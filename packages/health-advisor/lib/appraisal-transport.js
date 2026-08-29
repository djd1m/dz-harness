'use strict';
// ha-ca1-deterministic-appraisal — ADR-007 (AM-8). The ONLY network-capable module in the appraisal
// surface (05_architecture.md §9.2's SITE rule: any other importer of node:https in the walked
// surface fails the egress scan). GET only, https only, bounded in time, retries and concurrency.
//
// Seam C: the low-level request function is INJECTED (`requestImpl`), defaulting to node:https —
// which is what makes every budget below testable with no socket. `timers` and `now` are likewise
// injectable so the tests run in fake time.

const ALLOWED_METHODS = Object.freeze(['GET']);
const ALLOWED_SCHEMES = Object.freeze(['https:']);

const TRANSPORT_BUDGETS = Object.freeze({
  timeoutMs: 10000,        // per-request; never unbounded
  maxRetries: 2,           // on 429 / 5xx / timeout / socket error — NEVER on other 4xx
  maxConcurrency: 4,       // fixed in-flight cap
  // CA-1 QE F6 — `Retry-After` is a number the SOURCE chooses and this client obeyed without a
  // ceiling: MEASURED, `retry-after: 2147483` scheduled a 24.9-DAY sleep, twice (once per retry),
  // hanging the run on a header. A politeness signal is honoured up to a bound; past the bound the
  // honest answer is "the source declined", which is what `unavailable()` already says.
  retryAfterMaxMs: 30000,
  perHostMinIntervalMs: Object.freeze({
    // NCBI politeness: <= 3 req/s
    'eutils.ncbi.nlm.nih.gov': 334,
  }),
  crossrefMailto: 'jechkov.dmitriy@gmail.com', // Crossref polite-pool UA
});

/**
 * CA-1 QE F6 — RETURNS A CANCELLER. The request handle used to be created and dropped on the floor,
 * so the transport's own timeout resolved the promise and released the concurrency slot while the
 * socket stayed open: MEASURED, ONE get() against a never-answering server opened 3 sockets
 * (maxRetries + 1) and destroyed none, and at the shipped budgets maxConcurrency × (maxRetries + 1)
 * = 12 sockets could be live at once against a cap that reads as 4. A timeout that does not CANCEL
 * is a promise resolution, not a bound on resource use.
 */
function defaultRequestImpl(url, { timeoutMs, headers }, callback) {
  // the one real network import in CA-1's surface — see the SITE rule above
  const https = require('node:https');
  const req = https.get(url, { headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => callback(null, {
      statusCode: res.statusCode,
      headers: res.headers || {},
      body: Buffer.concat(chunks).toString('utf8'),
    }));
  });
  req.on('error', (err) => callback(err));
  req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  return req;
}

/**
 * Cancel whatever a requestImpl handed back, by whichever name it spells cancellation. Never
 * throws: a canceller that throws on the timeout path would replace a bounded failure with an
 * unbounded one.
 */
function cancelRequest(handle) {
  if (!handle || typeof handle !== 'object') return false;
  for (const name of ['destroy', 'abort', 'cancel']) {
    // C-6 (round 2): the property READ goes inside the try too — a throwing ACCESSOR used to
    // escape a function documented "Never throws", from inside a timer callback where nothing
    // above it can catch. Work outside the protection that was supposed to cover it.
    let fn;
    try { fn = handle[name]; } catch { continue; } // a hostile accessor is skipped, not propagated
    if (typeof fn === 'function') {
      try {
        fn.call(handle, new Error('timeout'));
      } catch {
        try { fn.call(handle); } catch { /* a canceller that cannot cancel is not an error path */ }
      }
      return true;
    }
  }
  return false;
}

function sha256Of(text) {
  return require('node:crypto').createHash('sha256').update(text).digest('hex');
}

function hostOf(url) {
  return new URL(url).host;
}

/**
 * createTransport(opts) -> { get(url) -> Promise<Observation> }
 * Observation (answered):   { answered: true, url, httpStatus, headers, body, sha256, fetchedAt }
 * Observation (unanswered): { answered: false, available: false, reason: 'endpoint-unavailable',
 *                             httpStatus, attempts, url, observedAt, detail }
 * get() RESOLVES — it never throws for a network-shaped failure and never hangs (AM-8). It throws
 * only for a construction error: a non-https URL (ALLOWED_SCHEMES is an allowlist, not advice).
 * NOTE: get()'s signature carries no body/data/method parameter — a caller cannot supply one.
 */
function createTransport({
  requestImpl = defaultRequestImpl,
  timeoutMs = TRANSPORT_BUDGETS.timeoutMs,
  maxRetries = TRANSPORT_BUDGETS.maxRetries,
  maxConcurrency = TRANSPORT_BUDGETS.maxConcurrency,
  retryAfterMaxMs = TRANSPORT_BUDGETS.retryAfterMaxMs,
  perHostMinIntervalMs = TRANSPORT_BUDGETS.perHostMinIntervalMs,
  timers = { setTimeout, clearTimeout },
  now = () => Date.now(),
  mailto = TRANSPORT_BUDGETS.crossrefMailto,
} = {}) {
  let inFlight = 0;
  const queue = [];
  const hostNextFree = new Map();

  function pump() {
    while (inFlight < maxConcurrency && queue.length > 0) {
      const job = queue[0];
      const host = job.host;
      const minInterval = perHostMinIntervalMs[host] || 0;
      const nextFree = hostNextFree.get(host) || 0;
      // C3-3 (round 3): the clock read sits UNDER a guard now. It used to run bare, one frame
      // ABOVE the C-6 try/catch — inside get()'s Promise executor a throw here REJECTED get()
      // ('clock dead'), the promised decrement never ran, and the ABANDONED job was drained by the
      // next successful call and still hit the network. A job whose dispatch clock is dead is
      // failed HERE, clocklessly, without ever taking a slot or opening a socket.
      let t;
      try {
        t = now();
      } catch (err) {
        queue.shift();
        job.failWithoutStarting(`internal-error: clock failed at dispatch: ${String((err && err.message) || err)}`);
        continue;
      }
      if (minInterval > 0 && t < nextFree) {
        // politeness: this host is cooling down — try again when it frees up
        timers.setTimeout(pump, nextFree - t);
        return;
      }
      queue.shift();
      if (minInterval > 0) hostNextFree.set(host, t + minInterval);
      inFlight += 1;
      job.start();
    }
  }

  function attemptOnce(url, headers) {
    return new Promise((resolve) => {
      let settled = false;
      let handle = null;
      const timer = timers.setTimeout(() => {
        if (settled) return;
        settled = true;
        // F6: CANCEL, then resolve. The order matters — resolving first releases the slot to a
        // retry that would then race an in-flight socket nobody is going to close.
        const cancelled = cancelRequest(handle);
        resolve({ ok: false, kind: 'timeout', cancelled });
      }, timeoutMs);
      try {
        handle = requestImpl(url, { timeoutMs, headers }, (err, res) => {
          if (settled) return;
          settled = true;
          timers.clearTimeout(timer);
          if (err) resolve({ ok: false, kind: 'socket-error', detail: String(err.message || err) });
          else resolve({ ok: true, res });
        });
        // a requestImpl that both called back synchronously AND returned a handle has already
        // settled; cancelling now would destroy a completed request, so this is the only place the
        // handle is deliberately ignored
        if (settled) handle = null;
      } catch (err) {
        if (!settled) {
          settled = true;
          timers.clearTimeout(timer);
          resolve({ ok: false, kind: 'socket-error', detail: String(err.message || err) });
        }
      }
    });
  }

  // F6: a SOURCE-CONTROLLED delay is honoured only up to retryAfterMaxMs. Past the ceiling we stop
  // waiting and let the retry budget run out into `unavailable(...)`, which is the truthful report:
  // the source declined for longer than this tool is willing to hold a run open.
  function retryDelayMs(res, attempt) {
    const retryAfter = res && res.headers && res.headers['retry-after'];
    const parsed = retryAfter !== undefined ? Number(retryAfter) * 1000 : NaN;
    if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed, retryAfterMaxMs);
    return 250 * (attempt + 1); // bounded backoff
  }

  async function runJob(url, headers) {
    let lastStatus = null;
    let lastDetail = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const outcome = await attemptOnce(url, headers);
      if (outcome.ok) {
        const status = outcome.res.statusCode;
        lastStatus = status;
        if (status >= 200 && status < 300) {
          const body = typeof outcome.res.body === 'string' ? outcome.res.body : '';
          return {
            answered: true,
            url,
            httpStatus: status,
            headers: outcome.res.headers || {},
            body,
            sha256: sha256Of(body),
            fetchedAt: new Date(now()).toISOString(),
          };
        }
        const retryable = status === 429 || status >= 500;
        if (!retryable || attempt === maxRetries) {
          // a rate limit is the source DECLINING, not a failure to hammer; other 4xx never retry
          return unavailable(url, status, attempt + 1, `http-${status}`);
        }
        await new Promise((r) => timers.setTimeout(r, retryDelayMs(outcome.res, attempt)));
      } else {
        lastDetail = outcome.kind + (outcome.detail ? `: ${outcome.detail}` : '');
        if (attempt === maxRetries) return unavailable(url, lastStatus, attempt + 1, lastDetail);
        await new Promise((r) => timers.setTimeout(r, retryDelayMs(null, attempt)));
      }
    }
    /* istanbul ignore next -- the loop always returns */
    return unavailable(url, lastStatus, maxRetries + 1, lastDetail);
  }

  function unavailable(url, httpStatus, attempts, detail) {
    return {
      answered: false,
      available: false,
      reason: 'endpoint-unavailable',
      httpStatus: httpStatus === undefined ? null : httpStatus,
      attempts,
      url,
      observedAt: new Date(now()).toISOString(),
      detail: detail || null,
    };
  }

  // C-6/C3-3: the failure report that must be constructible when the CLOCK ITSELF is the failure —
  // a null timestamp, never a fabricated one, and no clock read anywhere on this path.
  function clocklessUnavailable(url, attempts, detail) {
    return {
      answered: false,
      available: false,
      reason: 'endpoint-unavailable',
      httpStatus: null,
      attempts,
      url,
      observedAt: null,
      detail,
    };
  }

  function get(url) {
    const parsed = new URL(url);
    if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
      throw new TypeError(`transport.get: scheme not in ALLOWED_SCHEMES: ${parsed.protocol}`);
    }
    const headers = { 'user-agent': `health-advisor-critical-appraisal (mailto:${mailto})` };
    return new Promise((resolve) => {
      queue.push({
        host: parsed.host,
        start: () => {
          // F6: BOTH settlements are handled. Only a fulfilment handler was installed here, so a
          // runJob() that REJECTED — any unforeseen throw on the async path — left this promise
          // pending FOREVER and never decremented inFlight, permanently consuming a slot: one
          // internal error silently deadlocked the whole transport. `get()` is documented to
          // RESOLVE and never hang (AM-8); a rejection path that hangs breaks that contract in the
          // one direction nobody would notice, because a hang looks like a slow network.
          const finish = (obs) => {
            inFlight -= 1;
            timers.setTimeout(pump, 0);
            resolve(obs);
          };
          runJob(url, headers).then(finish, (err) => {
            // C-6 (round 2): finish(unavailable(...)) evaluated its ARGUMENT first — and
            // unavailable() reads the injected clock, so a THROWING clock skipped the decrement and
            // LEAKED the slot permanently (a hang that looks like a slow network). The observation
            // is now built defensively: if even the failure report cannot be constructed, a minimal
            // clockless one is, and the decrement ALWAYS runs.
            let obs;
            try {
              obs = unavailable(url, null, 1, `internal-error: ${String((err && err.message) || err)}`);
            } catch (err2) {
              // the clock itself failed — a null timestamp, never a fabricated one
              obs = clocklessUnavailable(url, 1, `internal-error: ${String((err2 && err2.message) || err2)}`);
            }
            finish(obs);
          });
        },
        // C3-3: the dispatch-time failure path — the job never started, so no slot is taken, no
        // decrement is owed, and no request handle exists. attempts: 0 — the truth.
        failWithoutStarting: (detail) => resolve(clocklessUnavailable(url, 0, detail)),
      });
      pump();
    });
  }

  return { get };
}

module.exports = {
  ALLOWED_METHODS,
  ALLOWED_SCHEMES,
  TRANSPORT_BUDGETS,
  createTransport,
  cancelRequest, // C-6: exported so the "Never throws" contract is unit-testable directly
};
