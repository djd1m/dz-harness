// Local measured Git/file provenance, never remote policy or reviewer authentication.
import { createHash } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, openSync, opendirSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
const sha = s => createHash('sha256').update(s).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const fail = s => { throw Error('native-post-ci-' + s) }
function safe(repo, path) {
  if (typeof path !== 'string' || path.startsWith('/') || /[\\\x00-\x1f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) fail('path-invalid')
  let file = repo
  for (const part of path.split('/')) { file = resolve(file, part); if (lstatSync(file).isSymbolicLink()) fail('symlink') }
  return file
}
function read(repo, proof, limit, selection = null, identity = null, imported = false, deadline = () => {}) {
  const file = safe(repo, proof.path), st = lstatSync(file)
  identity?.(proof.path, st); deadline()
  if (!st.isFile() || st.size > limit || imported && (st.nlink !== 1 || st.size !== proof.size)) fail('file-type-or-limit')
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW), h = createHash('sha256')
  const buffer = Buffer.alloc(65536), sample = selection ? Buffer.alloc(selection.length) : null
  const chunks = limit <= 128 * 1024 ? [] : null
  let count = 0, copied = 0
  try {
    const first = fstatSync(fd)
    if (!first.isFile() || first.ino !== st.ino || first.dev !== st.dev || first.size !== st.size) fail('file-identity-changed')
    while (true) {
      deadline(); const n = readSync(fd, buffer, 0, buffer.length, null); if (!n) break
      if (count + n > limit) fail('file-limit')
      h.update(buffer.subarray(0, n)); if (chunks) chunks.push(Buffer.from(buffer.subarray(0, n)))
      if (selection) { const start = Math.max(count, selection.offset), end = Math.min(count + n, selection.offset + selection.length); if (end > start) { buffer.copy(sample, start - selection.offset, start - count, end - count); copied += end - start } }
      count += n
    }
    const end = fstatSync(fd), current = lstatSync(file), digest = h.digest('hex')
    if (count !== st.size || end.size !== st.size || current.ino !== end.ino || current.dev !== end.dev || current.isSymbolicLink() || !current.isFile() || proof.digest && proof.digest !== digest || selection && copied !== selection.length) fail('file-short-changed-or-digest')
    if (imported && (first.nlink !== 1 || end.nlink !== 1 || current.nlink !== 1 || end.dev !== st.dev || end.ino !== st.ino || current.size !== st.size || end.mtimeMs !== st.mtimeMs || current.mtimeMs !== st.mtimeMs || count !== proof.size)) fail('imported-identity-or-size-changed')
    return { bytes: chunks ? Buffer.concat(chunks) : null, sample, digest, count }
  } finally { closeSync(fd) }
}
// Only directories implied by immutable admitted paths may exist; Git ignore rules confer no exemption.
function inventory(repo, prefix, paths, imported = [], identity = null, deadline = () => {}) {
  const files = new Set(paths), directories = new Map([[prefix.slice(0, -1), new Set()]])
  if (files.size !== paths.length) fail('proof-overlap')
  for (const r of imported) { files.add(r.path); const root = r.path.split('/').slice(0, 2).join('/'); if (!directories.has(root)) directories.set(root, new Set()) }
  for (const path of files) {
    const root = path.startsWith(prefix) ? prefix.slice(0, -1) : path.split('/').slice(0, 2).join('/')
    const parts = path.slice(root.length + 1).split('/'); let dir = root
    for (let i = 0; i < parts.length; i++) { directories.get(dir).add(parts[i]); if (i < parts.length - 1) { dir += '/' + parts[i]; if (!directories.has(dir)) directories.set(dir, new Set()) } }
  }
  if ([...directories.keys()].some(p => files.has(p))) fail('proof-file-directory-overlap')
  if (identity && (files.size > 256 || directories.size > 256)) fail('immutable-inventory-limit')
  const result = []
  for (const [dir, expected] of directories) {
    deadline(); const file = safe(repo, dir), before = lstatSync(file); if (!before.isDirectory()) fail('inventory-directory-type')
    const entries = [], fd = opendirSync(file)
    try { let entry; while ((entry = fd.readSync())) { if (entries.length >= 256 || !expected.has(entry.name)) fail('inventory-unlisted-or-limit'); entries.push(entry.name) } } finally { fd.closeSync() }
    if (entries.length !== expected.size) fail('inventory-missing')
    for (const path of [dir, ...entries.sort().map(name => dir + '/' + name)]) { const st = lstatSync(safe(repo, path)); deadline(); identity?.(path, st, !files.has(path)); if (path === dir && (st.ino !== before.ino || st.dev !== before.dev) || (files.has(path) ? !st.isFile() : !st.isDirectory())) fail('inventory-entry-type-or-identity'); result.push([path, st.dev, st.ino, st.size, st.mtimeMs]) }
  }
  return result
}
// Strict bounded parsers are exported for non-spawning adversarial framing controls.
export function parseImportedTree(bytes) {
  if (bytes.length > 4194304 || bytes.length && bytes.at(-1) !== 0) fail('imported-tree-framing')
  let text; try { text = new TextDecoder('utf8', { fatal: true }).decode(bytes) } catch { fail('imported-tree-encoding') }
  const entries = text.split('\0').slice(0, -1), seen = new Set()
  return entries.map(line => {
    const m = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64}) +([0-9]+)\t([^\x00-\x1f]+)$/.exec(line)
    if (!m || seen.has(m[4]) || !Number.isSafeInteger(Number(m[3])) || Number(m[3]) > 2097152) fail('imported-tree-entry')
    seen.add(m[4]); return { path: m[4], mode: m[1], oid: m[2], size: Number(m[3]) }
  })
}
export function parseImportedBatch(bytes, expected) {
  if (bytes.length > 4194304) fail('imported-batch-limit')
  const result = new Map(); let offset = 0
  for (const row of expected) {
    const newline = bytes.indexOf(10, offset)
    if (newline < offset || newline - offset > 100 || result.has(row.oid) || !Number.isSafeInteger(row.size) || row.size < 0 || row.size > 2097152) fail('imported-batch-header')
    const header = bytes.subarray(offset, newline).toString('ascii')
    if (header !== row.oid + ' blob ' + row.size) fail('imported-batch-identity')
    const end = newline + 1 + row.size
    if (end >= bytes.length || bytes[end] !== 10) fail('imported-batch-short-or-delimiter')
    result.set(row.oid, sha(bytes.subarray(newline + 1, end))); offset = end + 1
  }
  if (offset !== bytes.length) fail('imported-batch-trailing')
  return result
}
export function importedIdentityRegistry() {
  const files = new Map(), dirs = new Map()
  return (path, st, directory = false) => { const registry = directory ? dirs : files, id = st.dev + ':' + st.ino, prior = registry.get(id); if (prior !== undefined && prior !== path) fail('imported-identity-alias'); registry.set(id, path) }
}
function observeImported(repo, rows, current, identity) {
  const start = performance.now(), deadline = () => { if (performance.now() - start > 2000) fail('observation-deadline-exceeded') }
  const sources = []; let total = 0
  for (const row of current) {
    deadline(); let st
    try { st = lstatSync(safe(repo, row.path)) } catch (e) { if (row.digest === null && e.code === 'ENOENT') continue; throw e }
    if (row.digest === null || !st.isFile() || st.size > 2097152) fail('current-source-type-size-or-absence')
    identity(row.path, st); total += st.size; if (total > 16777216) fail('source-support-aggregate-limit')
    sources.push([row.path, st.dev, st.ino, st.size, st.mtimeMs, st.nlink])
  }
  for (const row of rows) {
    deadline(); const st = lstatSync(safe(repo, row.path)); total += st.size
    if (total > 16777216) fail('source-support-aggregate-limit')
    read(repo, row, 2097152, null, identity, true, deadline)
    sources.push([row.path, st.dev, st.ino, st.size, st.mtimeMs, st.nlink])
  }
  return sources
}
export function measureNativePostCiEvidence({ repo, featurePath, evidencePath, previous, current, validate }) {
  const prefix = featurePath + '/qa/post-ci-correction/'
  if (!evidencePath?.startsWith(prefix) || typeof validate !== 'function') fail('descriptor-path-or-capability-invalid')
  const descriptor = read(repo, { path: evidencePath }, 128 * 1024)
  let evidence
  try { evidence = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(descriptor.bytes)) } catch { fail('descriptor-malformed') }
  if (!descriptor.bytes.equals(Buffer.from(JSON.stringify(evidence) + '\n'))) fail('descriptor-noncanonical')
  validate(evidence, { featurePath, previous, current })
  const q = evidence.qualification, s = evidence.scope, u = s.upstream, f = evidence.failure
  const proofPaths = [evidencePath, ...new Set([f.log, q.color.log, q.neutral.log, q.ci.log].map(p => p.path)), s.fixture.patch.path, u.acceptanceEvidence.path, ...evidence.excludedEvidence.map(p => p.path)]
  const importedRows = evidence.schema === 'native-qe-post-ci-evidence-2' ? s.importedArtifacts : [], identity = importedRows.length ? importedIdentityRegistry() : null
  const supportObservation = identity ? observeImported(repo, importedRows, current, identity) : null
  const membership = inventory(repo, prefix, proofPaths, importedRows, identity)
  const witnesses = new Map(); let aggregate = 0
  for (const p of new Map([f.log, q.color.log, q.neutral.log, q.ci.log].map(p => [p.path, p])).values()) {
    const mode = [q.color, q.neutral].find(m => m.log.path === p.path)
    const measured = read(repo, p, 16 * 1024 * 1024, mode?.witness)
    aggregate += measured.count; if (aggregate > 64 * 1024 * 1024) fail('log-aggregate-limit')
    if (mode) witnesses.set(p.path, measured.sample)
  }
  for (const p of [s.fixture.patch, u.acceptanceEvidence, ...evidence.excludedEvidence]) read(repo, p, p === s.fixture.patch ? 64 * 1024 : 128 * 1024)
  validate(evidence, { featurePath, previous, current, witnesses })
  // Diff's explicit stat-cache refresh can write even with optional locks disabled.
  const git = (args, input) => execFileSync('git', ['-c', 'diff.autoRefreshIndex=false', ...args], { cwd: repo, input, timeout: 2000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' } })
  const commit = (id, kind = 'commit') => { const got = git(['rev-parse', '--verify', id + '^{' + kind + '}']).toString().trim(); if (got !== id) fail('git-object-not-exact'); return got }
  for (const id of [f.headCommit, q.sourceCommit, u.baseCommit, u.acceptedCommit, u.integrationCommit]) commit(id)
  commit(u.integrationTree, 'tree')
  const ancestry = git(['merge-base', u.baseCommit, u.acceptedCommit]).toString().trim()
  if (ancestry !== u.baseCommit) fail('upstream-base-not-ancestor')
  const info = git(['show', '-s', '--format=%P%n%T', u.integrationCommit]).toString().trim().split('\n'), parents = info[0].split(' ')
  if (parents.length !== 2 || parents[1] !== u.acceptedCommit || info[1] !== u.integrationTree) fail('integration-parents-or-tree-invalid')
  const preimport = parents[0]
  // Missing blobs are established from bounded tree membership, never an ignored git error.
  const totals = new Map()
  const cache = new Map()
  const blob = (tree, path) => {
    const key = tree + ':' + path
    if (cache.has(key)) return cache.get(key)
    const entry = git(['ls-tree', '-z', tree, '--', path]).toString('utf8').split('\0').filter(Boolean)
    if (!entry.length) { const absent = { kind: 'absent' }; cache.set(key, absent); return absent }
    const match = /^100(?:644|755) blob ([a-f0-9]+)\t(.+)$/.exec(entry[0])
    if (entry.length !== 1 || !match || match[2] !== path) fail('git-blob-type-invalid')
    const bytes = git(['cat-file', 'blob', match[1]])
    if (bytes.length > 2 * 1024 * 1024) fail('git-source-size-limit')
    totals.set(tree, (totals.get(tree) || 0) + bytes.length); if (totals.get(tree) > 16 * 1024 * 1024) fail('git-source-aggregate-limit')
    const state = { kind: 'bytes', digest: sha(bytes) }; cache.set(key, state); return state
  }
  const expected = r => r.digest === null ? { kind: 'absent' } : { kind: 'bytes', digest: r.digest }
  for (const r of previous) {
    if (!same(blob(f.headCommit, r.path), expected(r)) || !same(blob(preimport, r.path), expected(r))) fail('closed-source-mapping-invalid')
  }
  for (const r of current) {
    if (!same(blob(q.sourceCommit, r.path), expected(r))) fail('qualified-source-mapping-invalid')
    if (r.path !== s.fixture.path && !s.reviewArtifacts.some(a => a.path === r.path) && !same(blob(u.integrationTree, r.path), expected(r))) fail('integration-candidate-mapping-invalid')
  }
  for (const r of u.rows) {
    // Manifest absence does not prove Git absence. An unenrolled file may already
    // exist at the failed head; it must remain byte-identical until the import.
    const prior = r.before.kind === 'absent' ? blob(f.headCommit, r.path) : r.before.kind === 'bytes' ? r.before : { kind: 'absent' }
    if (r.before.kind === 'absent' && prior.kind === 'bytes' && (same(r.upstream, prior) || same(r.integrated, prior))) fail('import-not-changed')
    if (!same(blob(preimport, r.path), prior) || !same(blob(u.acceptedCommit, r.path), r.upstream) || !same(blob(u.integrationTree, r.path), r.integrated)) fail('import-blob-mapping-invalid')
  }
  for (const r of s.workflowDependencies) {
    if (![preimport, u.acceptedCommit, u.integrationTree, q.sourceCommit].every(t => same(blob(t, r.path), r.after))) fail('workflow-git-enrollment-invalid')
    const actual = read(repo, { path: r.path, digest: r.after.digest }, 2 * 1024 * 1024)
    if (actual.digest !== r.after.digest) fail('workflow-current-invalid')
  }
  if (importedRows.length) {
    const roots = [...new Set(importedRows.map(r => r.path.split('/').slice(0, 2).join('/')))]
    for (const tree of new Set([f.headCommit, u.baseCommit, preimport])) if (git(['ls-tree', '-z', tree, '--', ...roots]).length) fail('imported-root-preexists')
    const trees = [u.acceptedCommit, u.integrationTree, q.sourceCommit], inventories = []
    for (const tree of trees) {
      const entries = parseImportedTree(git(['ls-tree', '-r', '-l', '-z', tree, '--', ...roots])).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      if (entries.length !== importedRows.length || entries.some((r, i) => r.path !== importedRows[i].path || r.size !== importedRows[i].size)) fail('imported-tree-membership-or-size')
      for (const r of entries) { const key = tree + ':' + r.path; if (!cache.has(key)) { totals.set(tree, (totals.get(tree) || 0) + r.size); cache.set(key, { kind: 'bytes', digest: importedRows.find(p => p.path === r.path).digest }) } }
      if ((totals.get(tree) || 0) > 16777216) fail('git-source-aggregate-limit')
      inventories.push(entries)
    }
    if (!inventories.every(rows => same(rows, inventories[0]))) fail('imported-tree-bytes-changed')
    const objects = [...new Map(inventories[0].map(r => [r.oid, r])).values()], hashes = new Map()
    let batch = [], size = 0
    const flush = () => { if (!batch.length) return; const parsed = parseImportedBatch(git(['cat-file', '--batch'], Buffer.from(batch.map(r => r.oid).join('\n') + '\n')), batch); for (const [oid, hash] of parsed) hashes.set(oid, hash); batch = []; size = 0 }
    for (const row of objects) { const bytes = row.size + 102; if (size + bytes > 4194304) flush(); batch.push(row); size += bytes } flush()
    if (inventories[0].some((r, i) => hashes.get(r.oid) !== importedRows[i].digest)) fail('imported-blob-digest')
  }
  const patch = git(['diff', '--no-ext-diff', '--no-textconv', '--binary', f.headCommit, q.sourceCommit, '--', s.fixture.path])
  if (patch.length > 64 * 1024 || sha(patch) !== s.fixture.patch.digest) fail('fixture-patch-mismatch')
  const exceptions = new Set(['base-ref', 'checkpoints.jsonl', 'native-qe-history.jsonl', 'native-qe-head.json', 'review-convergence-qe-host.json', 'review-convergence-qe-review.json', 'review-convergence-ideation-host.json', 'review-convergence-ideation-review.json'].map(p => featurePath + '/.fa-state/' + p).concat([featurePath + '/08_qe_report.md', featurePath + '/07_code_changes/report.md', featurePath + '/07_code_changes/change_manifest.md']))
  const allowedExcluded = path => proofPaths.includes(path) || importedRows.some(r => r.path === path) || exceptions.has(path)
  // Compare all source tree deltas too: a qualified manifest cannot hide unrelated edits.
  const payload = new Set(current.map(r => r.path))
  const qualifiedChanges = git(['diff', '--no-renames', '--name-only', '-z', preimport, q.sourceCommit, '--']).toString('utf8').split('\0').filter(Boolean)
  if (qualifiedChanges.some(p => !payload.has(p) && !allowedExcluded(p))) fail('unqualified-commit-path')
  for (const args of [['diff', '--no-renames', '--name-only', '-z', q.sourceCommit, '--'], ['ls-files', '--others', '--exclude-standard', '-z']]) {
    const changed = git(args).toString('utf8').split('\0').filter(Boolean)
    if (changed.some(p => !payload.has(p) && !allowedExcluded(p))) fail('unqualified-current-path')
  }
  const imported = git(['diff', '--no-renames', '--name-only', '-z', preimport, u.integrationCommit, '--']).toString('utf8').split('\0').filter(Boolean)
  if (imported.some(p => !u.rows.some(r => r.path === p) && !s.reviewArtifacts.some(r => r.path === p) && !allowedExcluded(p))) fail('unaccounted-integration-path')
  // Fixed Git facts are computed outside the journal lock; the ordinary index/HEAD/source fence rechecks current bytes.
  if (identity && !same(supportObservation, observeImported(repo, importedRows, current, identity))) fail('imported-observation-changed')
  if (!same(membership, inventory(repo, prefix, proofPaths, importedRows, identity))) fail('inventory-observation-changed')
  return { evidencePath, evidence }
}
