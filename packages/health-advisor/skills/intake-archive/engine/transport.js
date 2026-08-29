'use strict';

// transport.js — THE SOLE NETWORK SITE OF THE INTAKE SURFACE (INV-9, ADR-004).
//
// WHY THIS FILE EXISTS SEPARATELY FROM lib/appraisal-transport.js. `lib/` is walked WHOLE by
// lib/appraisal-egress-scan.js, whose load-bearing half is a SITE rule: within that surface a
// network-capable module may be required by exactly ONE file, lib/appraisal-transport.js, and
// SURFACE_EXCLUSIONS is asserted empty. Putting an archive downloader in `lib/` would have forced an
// edit to that guard — "editing a load-bearing guard to accommodate an unrelated feature" is exactly
// the option ADR-004 rejected. So the intake surface is isolated under skills/intake-archive/ with its
// OWN sole site (this file) and its own mirror scanner (egress-scan.js), and CA-1's scanner has a
// zero-line diff.
//
// WHAT THIS CLIENT WILL AND WILL NOT DO:
//   • https: ONLY — an allowlist, never advice (`UnsupportedSchemeError`).
//   • `user:pass@host` — REFUSED (`CredentialsInUrlError`). A live credential in argv would otherwise
//     reach the catalog, the log and the operator's shell history.
//   • redirects are MANUAL, capped at max_redirects, and EVERY hop is re-parsed and re-validated from
//     scratch. A redirect chain is attacker-controlled input; validating only the first URL is the
//     same as not validating at all.
//   • a cross-HOST redirect is refused unless `--allow-host` names the new host. The allow side is
//     proven LIVE by its own happy-path test (P2c) — a suite that only tests refusals would pass just
//     as well if the client refused every redirect unconditionally.
//   • literal private / loopback / link-local IP hosts are refused LEXICALLY.
//   • the byte cap is counted ON THE STREAM. `Content-Length` is a HINT: a server that under-declares
//     and then sends 4 GiB is precisely the case the cap exists for.
//   • bounded in time twice: an IDLE deadline (no bytes for idle_timeout_ms) and a TOTAL deadline.
//
// HONEST LIMIT, STATED NOT IMPLIED (04 §10.4): DNS-resolution SSRF is NOT closed. A hostname that
// resolves to 169.254.169.254 passes the lexical check. Closing it needs resolve-then-pin-the-socket,
// which needs `node:dns` — a module the mirror scanner forbids ANYWHERE on this surface, including
// here, because it is also an exfiltration channel. The lexical check is the honest subset.
//
// SEAM: `requestImpl` is injectable (the same seam lib/appraisal-transport.js uses for its own
// budgets). It does not add a second import — it parameterises the ONE call into node:https — and it
// is what makes every refusal above testable without a socket, and what lets one test drive the real
// streaming/redirect/cap code against a local fixture server.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  UnsupportedSchemeError,
  CredentialsInUrlError,
  TransportError,
  LimitExceededError,
} = require('./errors.js');

const ALLOWED_SCHEME = 'https:';

// ── lexical SSRF refusal ─────────────────────────────────────────────────────────────────────────

const PRIVATE_V4_RULES = Object.freeze([
  { name: 'this-network', test: (o) => o[0] === 0 },
  { name: 'loopback', test: (o) => o[0] === 127 },
  { name: 'private-10/8', test: (o) => o[0] === 10 },
  { name: 'cgnat-100.64/10', test: (o) => o[0] === 100 && o[1] >= 64 && o[1] <= 127 },
  { name: 'private-172.16/12', test: (o) => o[0] === 172 && o[1] >= 16 && o[1] <= 31 },
  { name: 'ietf-192.0.0/24', test: (o) => o[0] === 192 && o[1] === 0 && o[2] === 0 },
  { name: 'private-192.168/16', test: (o) => o[0] === 192 && o[1] === 168 },
  { name: 'link-local-169.254/16', test: (o) => o[0] === 169 && o[1] === 254 },
  { name: 'benchmark-198.18/15', test: (o) => o[0] === 198 && (o[1] === 18 || o[1] === 19) },
  { name: 'multicast-224/4', test: (o) => o[0] >= 224 && o[0] <= 239 },
  { name: 'reserved-240/4', test: (o) => o[0] >= 240 },
]);

function parseIpv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m === null) return null;
  const octets = m.slice(1).map((s) => Number(s));
  return octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octets : null;
}

/**
 * classifyHost(host) -> null when the host is not a refused literal, otherwise the reason name.
 * LEXICAL: it inspects the spelling, never a resolver (see the header's honest limit).
 */
function classifyHost(rawHost) {
  const host = String(rawHost).toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '' ) return 'empty-host';
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback-name';
  const v4 = parseIpv4(host);
  if (v4 !== null) {
    const rule = PRIVATE_V4_RULES.find((r) => r.test(v4));
    return rule ? rule.name : null;
  }
  if (host.includes(':')) {
    // an IPv6 literal
    if (host === '::1') return 'loopback';
    if (host === '::') return 'this-network';
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return 'unique-local-fc00/7';
    if (/^fe[89ab][0-9a-f]:/.test(host)) return 'link-local-fe80/10';
    // IPv4-MAPPED ADDRESSES, IN BOTH SPELLINGS. `new URL()` CANONICALISES `::ffff:169.254.169.254` to
    // `::ffff:a9fe:a9fe` (MEASURED), so a check written only against the dotted spelling passes the
    // literal an operator would type and misses the one the parser actually hands over. The hex form is
    // the one that reaches this function in production.
    const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
    if (mappedDotted !== null) return classifyHost(mappedDotted[1]);
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (mappedHex !== null) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return classifyHost(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
    }
    return null;
  }
  return null;
}

// ── redaction: ONE definition, used by every renderer, the catalog and the log (INV-8, AM-3) ─────

/**
 * redactUrl(u) -> `https://host/path` — userinfo, query string and fragment REMOVED.
 *
 * A presigned object-storage URL carries a live signature in its query string
 * (`?X-Amz-Signature=…&X-Amz-Credential=…`). Writing the raw URL into sources/manifest.json would
 * durably persist a credential inside a patient's workspace, which is the one thing NFR-1 is about.
 * A single redactor — rather than a `.replace()` at each write site — is what makes "no secret in the
 * catalog" a property with ONE home instead of four.
 */
function redactUrl(u) {
  let parsed;
  try {
    parsed = new URL(String(u));
  } catch {
    return '[unparseable-url]';
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

/** The full ORIGINAL URL's sha256 — so two intakes from one source are comparable without keeping it. */
function urlSha256(u) {
  return crypto.createHash('sha256').update(String(u)).digest('hex');
}

/**
 * assertUrlAcceptable(rawUrl, { allowHosts, originHost }) -> URL
 *
 * Called at run.js's INPUT-VALIDATION phase (so `--dry-run` and every refusal happen before a socket
 * exists) AND again for every redirect hop. Same function, both places: a redirect target that would
 * have been refused as the original URL is refused as a hop too.
 */
function assertUrlAcceptable(rawUrl, { allowHosts = [], originHost = null } = {}) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch (err) {
    throw new UnsupportedSchemeError(
      `intake --url is not a parseable URL: ${JSON.stringify(String(rawUrl).slice(0, 120))} (${err.message}).`,
      { reason: 'unparseable_url' }
    );
  }
  if (parsed.protocol !== ALLOWED_SCHEME) {
    throw new UnsupportedSchemeError(
      `intake refuses scheme ${parsed.protocol} — only ${ALLOWED_SCHEME} is allowed. A patient's documents ` +
      'are not fetched over a channel that cannot be authenticated. For a file already on this machine ' +
      'use --file <path>, which opens no socket at all.',
      { reason: 'scheme_not_https', scheme: parsed.protocol }
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new CredentialsInUrlError(
      'intake refuses a URL carrying inline credentials (user:pass@host). The credential would land in ' +
      'shell history, in this process\'s argv, and — but for this refusal — in sources/manifest.json. ' +
      'Use a presigned URL or a header-authenticated mirror instead.',
      { reason: 'userinfo_present' }
    );
  }
  const refusedAs = classifyHost(parsed.hostname);
  if (refusedAs !== null) {
    throw new TransportError(
      `intake refuses host ${parsed.hostname} (${refusedAs}). Private, loopback, link-local and reserved ` +
      'literal addresses are refused lexically so an operator-supplied URL cannot be pointed at this ' +
      'machine\'s own metadata or admin services. NOTE: this is a LEXICAL check — a hostname that ' +
      'RESOLVES to such an address is not caught (a stated limit, not an implied guarantee).',
      { reason: `private_address_${refusedAs}`, host: parsed.hostname }
    );
  }
  if (originHost !== null && parsed.host !== originHost && !allowHosts.includes(parsed.host)) {
    throw new TransportError(
      `intake refuses a cross-host redirect to ${parsed.host} (the request began at ${originHost}). ` +
      `Pass --allow-host ${parsed.host} if that mirror is expected; a redirect is attacker-controlled ` +
      'input and following it to an unnamed host is how a bounded download becomes an arbitrary one.',
      { reason: 'cross_host_redirect', host: parsed.host, originHost }
    );
  }
  return parsed;
}

// ── the one real request ─────────────────────────────────────────────────────────────────────────

/**
 * The default low-level request: GET over node:https, streaming. THE one network import of the whole
 * intake surface lives on the next line and nowhere else — egress-scan.js enforces exactly that.
 */
function defaultRequestImpl(url, { headers, idleTimeoutMs }, onResponse) {
  const https = require('node:https');
  const req = https.request(url, { method: 'GET', headers }, (res) => onResponse(null, res));
  req.on('error', (err) => onResponse(err));
  req.setTimeout(idleTimeoutMs, () => req.destroy(new Error(`idle timeout after ${idleTimeoutMs}ms`)));
  req.end();
  return req;
}

function isRedirect(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * download({ url, destPath, limits, allowHosts, requestImpl }) -> Promise<DownloadReceipt>
 *
 * DownloadReceipt: `{ blobPath, bytes, requestedUrlRedacted, finalUrlRedacted, urlSha256, hops }`.
 * NOTE what the receipt does NOT carry: the raw URL. Nothing downstream of this function can leak
 * what it was never handed (INV-8).
 */
function download({
  url,
  destPath,
  limits,
  allowHosts = [],
  requestImpl = defaultRequestImpl,
} = {}) {
  const origin = assertUrlAcceptable(url, { allowHosts });
  const originHost = origin.host;
  const maxBytes = limits.max_download_bytes;

  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true, mode: 0o700 });

    let settled = false;
    let totalTimer = null;
    let currentRequest = null;
    let currentStream = null;
    let sink = null;

    const cleanup = () => {
      if (totalTimer !== null) clearTimeout(totalTimer);
      for (const handle of [currentRequest, currentStream]) {
        if (handle && typeof handle.destroy === 'function') {
          try { handle.destroy(); } catch { /* a canceller that cannot cancel is not an error path */ }
        }
      }
      if (sink !== null) {
        try { sink.close(); } catch { /* already closed */ }
        sink = null;
      }
    };

    // A FAILED DOWNLOAD LEAVES NO BLOB. The staging discipline downstream would tolerate a leftover
    // dot-prefixed file, but a half-downloaded blob that a later run could mistake for a complete one
    // is a different class of problem, so it is removed here at the source.
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { fs.rmSync(destPath, { force: true }); } catch { /* best effort */ }
      reject(err);
    };

    const succeed = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    totalTimer = setTimeout(() => {
      fail(new TransportError(
        `the download exceeded the total deadline of ${limits.total_timeout_ms}ms. Nothing was extracted and ` +
        'no partial blob was kept.',
        { reason: 'total_timeout' }
      ));
    }, limits.total_timeout_ms);
    if (typeof totalTimer.unref === 'function') totalTimer.unref();

    const attempt = (targetUrl, hop) => {
      if (settled) return;
      if (hop > limits.max_redirects) {
        fail(new TransportError(
          `the download followed ${limits.max_redirects} redirects and was asked for another. A chain longer ` +
          'than the cap is refused rather than followed "just once more".',
          { reason: 'too_many_redirects', hops: hop }
        ));
        return;
      }

      let parsed;
      try {
        parsed = hop === 0
          ? origin
          : assertUrlAcceptable(targetUrl, { allowHosts, originHost });
      } catch (err) {
        fail(err);
        return;
      }

      try {
        currentRequest = requestImpl(
          parsed.href,
          { headers: { 'user-agent': 'health-advisor-intake-archive', accept: '*/*' }, idleTimeoutMs: limits.idle_timeout_ms },
          (err, res) => {
            if (settled) return;
            if (err) {
              fail(new TransportError(
                `the download failed at the socket: ${err.message}.`,
                { reason: 'socket_error', detail: String(err.message || err) }
              ));
              return;
            }
            currentStream = res;

            if (isRedirect(res.statusCode)) {
              const location = res.headers && res.headers.location;
              if (typeof res.resume === 'function') res.resume(); // drain, never buffer a redirect body
              if (typeof location !== 'string' || location === '') {
                fail(new TransportError(
                  `the source answered ${res.statusCode} with no usable Location header.`,
                  { reason: 'redirect_without_location', httpStatus: res.statusCode }
                ));
                return;
              }
              let next;
              try {
                next = new URL(location, parsed.href).href;
              } catch {
                fail(new TransportError(
                  `the source answered ${res.statusCode} with an unparseable Location.`,
                  { reason: 'redirect_unparseable', httpStatus: res.statusCode }
                ));
                return;
              }
              currentRequest = null;
              currentStream = null;
              attempt(next, hop + 1);
              return;
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
              if (typeof res.resume === 'function') res.resume();
              fail(new TransportError(
                `the source answered HTTP ${res.statusCode} for ${redactUrl(parsed.href)}.`,
                { reason: `http_${res.statusCode}`, httpStatus: res.statusCode }
              ));
              return;
            }

            // Content-Length is a HINT — checked early as a courtesy so an obviously oversized body is
            // refused before a byte is written, and then IGNORED in favour of the stream count below.
            const declared = Number(res.headers && res.headers['content-length']);
            if (Number.isFinite(declared) && declared > maxBytes) {
              if (typeof res.resume === 'function') res.resume();
              fail(new LimitExceededError(
                `the source declares ${declared} bytes, over max_download_bytes=${maxBytes}. Raise it with a ` +
                '--limits file if that is genuinely the archive you want (ceiling 2147483648).',
                { reason: 'max_download_bytes', limit: 'max_download_bytes', actual: declared, cap: maxBytes }
              ));
              return;
            }

            let received = 0;
            sink = fs.createWriteStream(destPath, { mode: 0o600 });
            sink.on('error', (werr) => fail(new TransportError(
              `writing the downloaded blob to ${destPath} failed: ${werr.message}.`,
              { reason: 'blob_write_failed' }
            )));

            let idleTimer = null;
            const armIdle = () => {
              if (idleTimer !== null) clearTimeout(idleTimer);
              idleTimer = setTimeout(() => {
                fail(new TransportError(
                  `the source sent no bytes for ${limits.idle_timeout_ms}ms (idle deadline).`,
                  { reason: 'idle_timeout' }
                ));
              }, limits.idle_timeout_ms);
              if (typeof idleTimer.unref === 'function') idleTimer.unref();
            };
            armIdle();

            res.on('data', (chunk) => {
              if (settled) return;
              received += chunk.length;
              // THE CAP THAT ACTUALLY BINDS: counted on the stream, so a server that under-declares
              // Content-Length and then floods is stopped at the byte the cap names.
              if (received > maxBytes) {
                if (idleTimer !== null) clearTimeout(idleTimer);
                fail(new LimitExceededError(
                  `the source sent more than max_download_bytes=${maxBytes} actual bytes (Content-Length was a ` +
                  `hint: ${Number.isFinite(declared) ? declared : 'absent'}). The stream count is what is enforced.`,
                  { reason: 'max_download_bytes', limit: 'max_download_bytes', actual: received, cap: maxBytes }
                ));
                return;
              }
              armIdle();
              sink.write(chunk);
            });
            res.on('error', (rerr) => {
              if (idleTimer !== null) clearTimeout(idleTimer);
              fail(new TransportError(`the response stream failed: ${rerr.message}.`, { reason: 'stream_error' }));
            });
            res.on('end', () => {
              if (idleTimer !== null) clearTimeout(idleTimer);
              if (settled) return;
              const finished = sink;
              sink = null;
              finished.end(() => succeed({
                blobPath: destPath,
                bytes: received,
                requestedUrlRedacted: redactUrl(url),
                finalUrlRedacted: redactUrl(parsed.href),
                urlSha256: urlSha256(url),
                hops: hop,
              }));
            });
          }
        );
      } catch (err) {
        fail(new TransportError(`the download could not be started: ${err.message}.`, { reason: 'request_failed' }));
      }
    };

    attempt(origin.href, 0);
  });
}

module.exports = {
  ALLOWED_SCHEME,
  PRIVATE_V4_RULES,
  classifyHost,
  assertUrlAcceptable,
  redactUrl,
  urlSha256,
  download,
  defaultRequestImpl,
};
