#!/usr/bin/env node
'use strict';

// Standalone operator experiment. No registration, bootstrap, save, or automatic retry.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const PKG = '/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor';
const NATIVE = '/opt/health-advisor-runtime/node_modules/better-sqlite3';
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const labels = { label: 'НЕПРОВЕРЕНО', human_verification: 'not_established', content_trust: 'untrusted_document' };

function strictJSON(raw, code) {
  let value;
  try { value = JSON.parse(raw); } catch { fail(code); }
  const stack = [];
  for (const match of raw.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|[^{}\[\]:,\s]+/g)) {
    const token = match[0], top = stack.at(-1);
    if (token === '{') stack.push({ object: true, key: true, keys: new Set() });
    else if (token === '[') stack.push({ object: false });
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && top?.object) top.key = true;
    else if (token === ':' && top?.object) top.key = false;
    else if (top?.object && top.key && token[0] === '"') {
      const key = JSON.parse(token);
      if (top.keys.has(key)) fail(code);
      top.keys.add(key);
    }
  }
  return value;
}

function args() {
  const argv = process.argv.slice(2);
  if (Buffer.byteLength(JSON.stringify(argv)) > 16384) fail('invalid_request');
  const verb = argv.shift();
  if (!['plan', 'apply', 'status', 'reconcile', 'search-known'].includes(verb)) fail('invalid_request');
  const out = { verb };
  const values = ['lab-root', 'workspace', 'operation-id', 'case'];
  if (verb === 'apply') values.push('expect-plan-sha256');
  if (verb === 'search-known') values.push('query');
  while (argv.length) {
    const key = argv.shift();
    if (!key.startsWith('--') || Object.hasOwn(out, key.slice(2))) fail('invalid_request');
    const name = key.slice(2);
    if (verb === 'apply' && ['execute', 'synthetic-confirm'].includes(name)) out[name] = true;
    else if (values.includes(name) && argv.length) out[name] = argv.shift();
    else fail('invalid_request');
  }
  if (values.some(k => typeof out[k] !== 'string') || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(out['operation-id']) ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(out.case)) fail('invalid_request');
  if (verb === 'apply' && (!out.execute || !out['synthetic-confirm'] || !/^[a-f0-9]{64}$/.test(out['expect-plan-sha256']))) fail('invalid_request');
  if (verb === 'search-known' && !/^[A-Za-z0-9_-]{3,128}$/.test(out.query)) fail('invalid_request');
  return out;
}

function owned(p, directory, code, max, privateMode) {
  const s = fs.lstatSync(p);
  if (s.isSymbolicLink() || (directory ? !s.isDirectory() : !s.isFile()) || s.uid !== process.getuid() ||
      (s.mode & 0o7022) || (!directory && s.nlink !== 1) || (!directory && s.size > max) ||
      (privateMode !== undefined && (s.mode & 0o7777) !== privateMode)) fail(code);
  return s;
}
function guard(a) {
  try {
    const root = a['lab-root'], ws = a.workspace;
    if (!path.isAbsolute(root) || !path.isAbsolute(ws) || path.resolve(root) !== root || path.resolve(ws) !== ws ||
        !['/tmp/', '/var/tmp/'].some(base => root.startsWith(base)) || path.dirname(ws) !== root ||
        fs.realpathSync(root) !== root || fs.realpathSync(ws) !== ws) fail('synthetic_guard_refusal');
    // Every component below the system temp directory is owned and private.
    const base = root.startsWith('/var/tmp/') ? '/var/tmp' : '/tmp';
    let current = base;
    for (const part of path.relative(base, root).split(path.sep)) {
      current = path.join(current, part); owned(current, true, 'synthetic_guard_refusal', 0, 0o700);
    }
    owned(ws, true, 'synthetic_guard_refusal', 0, 0o700);
    const sentinel = path.join(root, '.health-index-lab-synthetic');
    owned(sentinel, false, 'synthetic_guard_refusal', 16384, 0o600);
    const marker = strictJSON(fs.readFileSync(sentinel, 'utf8'), 'synthetic_guard_refusal');
    if (!marker || Object.keys(marker).sort().join() !== 'nonce,schema,workspace' ||
        marker.schema !== 'hermes-recognized-index-lab-1' || marker.workspace !== ws ||
        typeof marker.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(marker.nonce)) fail('synthetic_guard_refusal');
  } catch { fail('synthetic_guard_refusal'); }
}

function runtime() {
  const p = spawnSync(process.execPath, [PKG + '/lib/recognized-cli.js', 'capabilities'],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 16384 });
  if (p.error || p.status !== 0) fail('runtime_unproven');
  const c = strictJSON(p.stdout, 'runtime_unproven');
  if (c.schema !== 'ha-recognized-capabilities-1' || c.version !== 1 || c.request_schema !== 'ha-recognized-save-1' ||
      c.experimental !== true || JSON.stringify(c.capabilities) !== JSON.stringify(['immutable-opid', 'exact-source-binding', 'unverified-only', 'status-no-text'])) fail('runtime_unproven');
  return { core: require(PKG + '/lib/recognized-store.js'), write: require(PKG + '/skills/third-brain/engine/write.js'),
    format: require(PKG + '/skills/third-brain/engine/plan.js'), search: require(PKG + '/skills/third-brain/engine/search.js') };
}
function makePlan(a, r) {
  const c = r.core.readUnverifiedRecognition(a.workspace, a['operation-id'], { includeText: true });
  const relative = `recognized/.machine-unverified/operations/${a['operation-id']}/artifact.md`;
  if (c.status !== 'present_unverified' || c.current_source_integrity !== 'valid_at_read_time' ||
      c.verification_status !== 'unverified' || c.index_status !== 'not_requested' || c.artifact_path !== relative ||
      typeof c.text !== 'string' || sha(c.text) !== c.text_sha256 || Buffer.byteLength(c.text) !== c.text_bytes) fail('core_unproven');
  const date = c.created_at.slice(0, 10);
  const built = r.write.buildRecords({ text: c.text, docSha256: c.text_sha256, docPathRel: relative,
    caseSlug: a.case, kind: 'machine-unverified', date, anchorIds: [c.source.entry_id], ts: c.created_at });
  const patterns = built.records.map(x => sha(JSON.stringify([x.pattern, x.domain, x.type, x.reward])));
  const digest = sha(JSON.stringify(['hermes-recognized-index-plan-1', a.workspace, c.operation_id,
    c.request_sha256, c.text_sha256, c.artifact_path, c.source, a.case, date, 'machine-unverified', patterns]));
  return { c, built, date, patterns, digest };
}

function snapshot(a) {
  let db;
  try {
    let p = a.workspace;
    for (const part of ['.health-brain', '.dz', 'memory']) {
      p = path.join(p, part); owned(p, true, 'readback_unproven');
    }
    p = path.join(p, 'patterns.sqlite');
    owned(p, false, 'readback_unproven', 128 * 1024 * 1024);
    for (const suffix of ['-wal', '-shm']) {
      try { owned(p + suffix, false, 'readback_unproven', 128 * 1024 * 1024); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    const Database = require(NATIVE);
    db = new Database(p, { readonly: true, fileMustExist: true, timeout: 1000 });
    db.pragma('query_only=ON');
    db.exec('BEGIN');
    if (db.pragma('user_version', { simple: true }) !== 2) fail('readback_unproven');
    const table = db.prepare("SELECT type FROM sqlite_master WHERE name='memory_records'").get();
    if (table?.type !== 'table') fail('readback_unproven');
    const cols = db.pragma('table_info(memory_records)');
    if (cols.map(x => x.name).join() !== 'id,skill_id,text,score,outcome,timestamp,metadata' ||
        cols.map(x => x.type.toUpperCase()).join() !== 'TEXT,TEXT,TEXT,REAL,TEXT,TEXT,TEXT' || cols[0].pk !== 1) fail('readback_unproven');
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') fail('readback_unproven');
    const bound = db.prepare('SELECT count(*) AS n, coalesce(sum(length(CAST(text AS BLOB))+coalesce(length(CAST(metadata AS BLOB)),0)),0) AS bytes FROM memory_records').get();
    if (bound.n > 10000 || bound.bytes > 32 * 1024 * 1024) fail('readback_unproven');
    // Only after the snapshot-wide bounds may rows enter JS memory.
    const rows = db.prepare('SELECT id,text,score,outcome,metadata FROM memory_records').all();
    return rows.map(row => {
      if (typeof row.id !== 'string' || typeof row.text !== 'string' || typeof row.outcome !== 'string' ||
          !Number.isFinite(row.score) || typeof row.metadata !== 'string') fail('readback_unproven');
      const meta = strictJSON(row.metadata, 'readback_unproven');
      if (!meta || Array.isArray(meta) || typeof meta !== 'object' || typeof meta.domain !== 'string') fail('readback_unproven');
      return { ...row, domain: meta.domain };
    });
  } catch { fail('readback_unproven'); }
  finally { if (db) db.close(); }
}
function coverage(a, p, r) {
  const rows = snapshot(a), counts = p.patterns.map(() => 0);
  const ids = [], expected = new Map(p.built.records.map((x, i) => [JSON.stringify([x.pattern, x.domain, x.type, x.reward]), i]));
  let conflict = false;
  for (const row of rows) {
    const text = row.text;
    let h = null;
    if (text.includes('ha-doc')) {
      try {
        const line = text.split('\n', 1)[0];
        h = r.format.parseHeader(line);
        if (r.format.renderHeader(h) !== line) fail('readback_unproven');
      } catch { fail('readback_unproven'); }
    }
    const related = h?.doc_id === p.built.docId || h?.doc_path === p.c.artifact_path ||
      text.includes(p.built.docId) || text.includes(p.c.artifact_path);
    if (!related) continue;
    const i = expected.get(JSON.stringify([text, row.domain, row.outcome, row.score]));
    if (i === undefined) conflict = true;
    else { counts[i] += 1; ids.push(row.id); if (counts[i] !== 1) conflict = true; }
  }
  const missing = p.patterns.filter((_, i) => counts[i] === 0);
  return { coverage: conflict ? 'conflict' : missing.length === 0 ? 'complete' : missing.length === counts.length ? 'none' : 'exact_subset',
    missing_pattern_sha256: missing, record_ids: ids, observed_total_records: rows.length };
}
function recheck(a, p, r) { if (makePlan(a, r).digest !== p.digest) fail('core_drift'); }
function summary(p, observation, extra = {}) {
  return { ok: true, ...labels, schema: 'hermes-recognized-index-result-1', operation_id: p.c.operation_id,
    plan_sha256: p.digest, doc_id: p.built.docId, artifact_sha256: p.c.text_sha256,
    expected_count: p.patterns.length, core_index_status: 'not_requested', ...observation, ...extra };
}
async function main() {
  const a = args(); guard(a);
  const r = runtime(), p = makePlan(a, r);
  if (a.verb === 'plan') return summary(p, {}, { status: 'planned_unverified', pattern_sha256: p.patterns });
  if (a.verb === 'apply' && a['expect-plan-sha256'] !== p.digest) fail('plan_mismatch');
  const before = coverage(a, p, r);
  recheck(a, p, r);
  if (before.coverage === 'conflict') return summary(p, before, { ok: false, status: 'index_unknown', code: 'index_conflict', write_attempted: false });
  if (a.verb === 'apply' && before.coverage !== 'complete') {
    let writeFailed = false, observation, checkFailed;
    try {
      const result = await r.write.ingest({ workspace: a.workspace, documentPath: p.c.artifact_path,
        case: a.case, kind: 'machine-unverified', date: p.date, anchors: [p.c.source.entry_id] });
      if (result?.ok !== true) writeFailed = true;
    } catch { writeFailed = true; }
    // Always attempt both checks, even when ingest or one check failed.
    try { observation = coverage(a, p, r); } catch (e) { checkFailed = e.code; }
    try { recheck(a, p, r); } catch (e) { checkFailed = e.code; }
    if (writeFailed || checkFailed || observation?.coverage !== 'complete') {
      return summary(p, observation || {}, { ok: false, status: 'index_unknown', code: checkFailed || 'write_unproven',
        write_attempted: true, writes_may_exist: true });
    }
    return summary(p, observation, { status: 'indexed_unverified_at_check_time', write_attempted: true });
  }
  if (a.verb === 'search-known') {
    if (before.coverage !== 'complete') return summary(p, before, { ok: false, status: 'index_unknown', code: 'incomplete_index' });
    let found = [];
    try {
      const result = r.search.search(a.query, { workspace: a.workspace, limit: 100 });
      for (const hit of result.hits) {
        const i = hit.chunk - 1, rec = p.built.records[i];
        if (hit.doc_id !== p.built.docId) continue;
        if (!rec || r.format.renderHeader(hit) + '\n' + hit.body !== rec.pattern ||
            hit.domain !== rec.domain || hit.type !== rec.type || !hit.body.toLowerCase().includes(a.query.toLowerCase())) fail('search_unproven');
        found.push(p.patterns[i]);
      }
    } catch { fail('search_unproven'); }
    recheck(a, p, r);
    if (!found.length) fail('search_unproven');
    return summary(p, before, { status: 'known_source_reachable_at_check_time', known_pattern_sha256: [...new Set(found)] });
  }
  return summary(p, before, { status: before.coverage === 'complete' ? 'indexed_unverified_at_check_time' : 'index_unknown', write_attempted: false });
}

main().then(result => {
  const out = JSON.stringify(result);
  if (Buffer.byteLength(out) > 2 * 1024 * 1024) fail('output_bound');
  process.stdout.write(out + '\n'); if (!result.ok) process.exitCode = 1;
}).catch(error => {
  const safe = new Set(['invalid_request', 'synthetic_guard_refusal', 'runtime_unproven', 'readback_unproven',
    'source_drift', 'unsafe_path', 'corrupt_refusal', 'core_unproven', 'core_drift', 'plan_mismatch', 'search_unproven', 'output_bound']);
  process.stdout.write(JSON.stringify({ ok: false, ...labels, code: safe.has(error.code) ? error.code : 'runtime_unproven' }) + '\n');
  process.exitCode = 1;
});
