#!/usr/bin/env node
// Host checkpoint lineage, not a reviewer-supplied prior array, owns historical conditions.
// This checks consistency/freshness; it does not authenticate models or judge their evidence.
// For structural condition/delta verification, implementationVerified:true is phase-specific:
// ideation = independently verified corrected ADR, architecture and phase artifacts at the
// current revision/nonce, without claiming production code or implementation tests exist;
// qe = independently verified actual implementation and relevant tests at that revision/nonce.
// False/missing remains blocking in both phases; field names, boolean strength, origin ownership,
// phase/nonce/manifest binding and legacy receipt compatibility are unchanged.
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const SCHEMA = 'fa-review-convergence-1'
const phases = ['ideation', 'qe']
const severities = ['BLOCKER', 'CRITICAL', 'HIGH', 'WARNING', 'SUGGESTION']
const kinds = ['structural', 'wording']
const digest = value => createHash('sha256').update(value).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 65536
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const array = (value, limit = 512) => Array.isArray(value) && value.length <= limit
function dictionary(value, keys, required = keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key)) && required.every(key => Object.hasOwn(value, key))
}
function strings(value, nonempty = false) { return array(value) && (!nonempty || value.length > 0) && value.every(text) && new Set(value).size === value.length }
function condition(c, owners) {
  return dictionary(c, ['id', 'owner', 'severity', 'classification', 'requirement', 'scope', 'evidence']) && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(c.id) && owners.includes(c.owner) && severities.includes(c.severity) && kinds.includes(c.classification) && text(c.requirement) && strings(c.scope, true) && text(c.evidence)
}
function risks(r, owners) { return dictionary(r, ['assessment', 'evidence', 'conditions']) && text(r.assessment) && text(r.evidence) && array(r.conditions) && r.conditions.every(c => condition(c, owners)) }
function checkpointProof(p) {
  return dictionary(p, ['checkpointDigest', 'evidence', 'supported', 'route', 'findings', 'reportDigest']) && hash(p.checkpointDigest) && text(p.evidence) && p.supported === true && ['native', 'mode-b', 'fallback'].includes(p.route) && array(p.findings) && p.findings.every(v => dictionary(v, ['digest', 'conditionId']) && hash(v.digest) && text(v.conditionId)) && (p.reportDigest === null || hash(p.reportDigest))
}
function reviewerFamily(stage) { return stage.qeReviewerUsed === 'codex-fallback' ? 'codex' : stage.qeReviewerUsed }
function reviewerEntry(r, roster) {
  const owners = roster.map(p => p.id)
  return !(!dictionary(r, ['reviewer', 'family', 'independent', 'verdict', 'conditions', 'verifications', 'newRisks', 'authorAssessmentChecked', 'deltaVerification', 'checkpointVerification'], ['reviewer', 'family', 'independent', 'verdict', 'conditions', 'verifications', 'newRisks', 'authorAssessmentChecked', 'deltaVerification']) || !owners.includes(r.reviewer) || roster.find(p => p.id === r.reviewer)?.family !== r.family || r.independent !== true || !['clean', 'conditional', 'no-go'].includes(r.verdict) || !array(r.conditions) || !r.conditions.every(c => condition(c, owners) && c.owner === r.reviewer) || !array(r.verifications) || !risks(r.newRisks, owners) || !r.newRisks.conditions.every(c => c.owner === r.reviewer) || typeof r.authorAssessmentChecked !== 'boolean')
}
function result(phase, verdict, revision, reasons, unresolved = []) { return { schema: SCHEMA, phase, verdict, revision, unresolved, reasons } }

function artifactPath(rel) {
  return text(rel) && !rel.startsWith('/') && !rel.includes('\\') && !rel.split('/').some(p => !p || p === '.' || p === '..') && !/[\x00-\x1f]/.test(rel)
}
function hostProblem(host) {
  if (!dictionary(host, ['schema', 'phase', 'reviewers', 'snapshot', 'conditions', 'reviewSeen', 'rework', 'changedPaths']) || host.schema !== SCHEMA || !phases.includes(host.phase) || !array(host.reviewers, 16) || host.reviewers.length === 0) return 'host-lineage-invalid'
  const owners = host.reviewers.map(r => r?.id)
  if (new Set(owners).size !== owners.length || !host.reviewers.every(r => dictionary(r, ['id', 'family']) && text(r.id) && ['codex', 'claude', 'owner-exception'].includes(r.family))) return 'host-reviewers-invalid'
  if (!dictionary(host.snapshot, ['nonce', 'revision', 'manifest']) || !text(host.snapshot.nonce) || !hash(host.snapshot.revision) || !array(host.conditions) || !host.conditions.every(c => condition(c, owners)) || new Set(host.conditions.map(c => c.id)).size !== host.conditions.length || typeof host.reviewSeen !== 'boolean' || typeof host.rework !== 'boolean' || !strings(host.changedPaths) || !host.changedPaths.every(artifactPath)) return 'host-snapshot-invalid'
  const manifest = host.snapshot.manifest
  if (!Array.isArray(manifest) || !manifest.every(p => dictionary(p, ['path', 'digest']) && artifactPath(p.path) && (p.digest === null || hash(p.digest))) || new Set(manifest.map(p => p.path)).size !== manifest.length || digest(JSON.stringify(manifest)) !== host.snapshot.revision) return 'host-manifest-invalid'
  if (host.conditions.some(c => c.scope.some(path => !manifest.some(p => p.path === path)))) return 'host-condition-scope-unbound'
  return null
}
export function evaluateReviewConvergence(host, receipt, currentManifest, originOnly = false) {
  const phase = host?.phase
  const refuse = reason => result(phase || 'qe', 'not-established', host?.snapshot?.revision || null, [reason], (array(host?.conditions) ? host.conditions : []).map(c => c?.id))
  const problem = hostProblem(host)
  if (problem) return refuse(problem)
  const owners = host.reviewers.map(r => r.id)
  if (!same(host.snapshot.manifest, currentManifest) || digest(JSON.stringify(currentManifest)) !== host.snapshot.revision) return refuse('artifact-manifest-changed')
  if (!dictionary(receipt, ['schema', 'phase', 'nonce', 'revision', 'reviews', 'author']) || receipt.schema !== SCHEMA || receipt.phase !== phase || receipt.nonce !== host.snapshot.nonce || receipt.revision !== host.snapshot.revision) return refuse('receipt-phase-or-revision-invalid')
  if (!array(receipt.reviews, 16) || (originOnly ? !receipt.reviews.length || receipt.reviews.length > owners.length : receipt.reviews.length !== owners.length) || new Set(receipt.reviews.map(r => r?.reviewer)).size !== receipt.reviews.length) return refuse('reviewer-set-invalid')
  const all = new Map(host.conditions.map(c => [c.id, c]))
  const verified = new Set()
  const reasons = []
  const needsAuthor = host.rework || (host.reviewSeen && host.conditions.length > 0)
  if (needsAuthor && !receipt.author) return refuse('author-delta-missing')
  if (receipt.author !== null) {
    const a = receipt.author
    if (!dictionary(a, ['addressed', 'changedScope', 'classification', 'delta', 'evidence', 'newRisks']) || !strings(a.addressed) || !strings(a.changedScope, true) || !kinds.includes(a.classification) || !text(a.delta) || !text(a.evidence) || !risks(a.newRisks, owners)) return refuse('author-delta-invalid')
    if (host.changedPaths.some(path => !a.changedScope.includes(path))) return refuse('author-delta-omits-measured-changes')
    if (a.addressed.some(id => !all.has(id))) return refuse('author-addressed-unknown-condition')
    for (const c of a.newRisks.conditions) {
      if (all.has(c.id) && !same(all.get(c.id), c)) return refuse('author-risk-condition-redefined')
      all.set(c.id, c)
    }
  }
  for (const r of receipt.reviews) {
    if (!reviewerEntry(r, host.reviewers)) return refuse('reviewer-contract-invalid')
    if (Object.hasOwn(r, 'checkpointVerification') && !checkpointProof(r.checkpointVerification)) return refuse('checkpoint-verification-contract-invalid')
    if (receipt.author && !r.authorAssessmentChecked) return refuse('author-risk-assessment-not-reviewed')
    if (receipt.author) {
      const d = r.deltaVerification
      if (!dictionary(d, ['classification', 'evidence', 'implementationVerified']) || !kinds.includes(d.classification) || !text(d.evidence) || typeof d.implementationVerified !== 'boolean') return refuse('independent-delta-classification-missing')
      if ((receipt.author.classification === 'structural' || d.classification === 'structural') && (!d.implementationVerified || d.classification !== 'structural')) reasons.push('structural-delta-not-verified:' + r.reviewer)
    } else if (r.deltaVerification !== null) return refuse('unexpected-delta-verification')
    const own = r.conditions.concat(r.newRisks.conditions)
    if (new Set(own.map(c => c.id)).size !== own.length) return refuse('duplicate-condition')
    for (const c of host.conditions.filter(c => c.owner === r.reviewer)) if (!own.some(n => same(n, c))) return refuse('prior-condition-omitted-or-redefined:' + c.id)
    for (const c of own) {
      if (c.scope.some(path => !currentManifest.some(p => p.path === path))) return refuse('condition-scope-unmeasured:' + c.id)
      if (all.has(c.id) && !same(all.get(c.id), c)) return refuse('condition-redefined:' + c.id)
      all.set(c.id, c)
    }
    if (r.verdict === 'clean' && own.length > 0 && r.verifications.length === 0) return refuse('clean-verdict-contradicts-conditions')
    if (r.verdict === 'conditional' && own.length === 0) return refuse('conditional-without-conditions')
    if (r.verdict === 'no-go') reasons.push('reviewer-no-go:' + r.reviewer)
    const seen = new Set()
    for (const v of r.verifications) {
      if (!dictionary(v, ['id', 'revision', 'classification', 'evidence', 'implementationVerified']) || seen.has(v.id) || !all.has(v.id) || all.get(v.id).owner !== r.reviewer || v.revision !== host.snapshot.revision || !kinds.includes(v.classification) || !text(v.evidence) || typeof v.implementationVerified !== 'boolean') return refuse('verification-invalid-or-foreign')
      seen.add(v.id)
      // A semantic change cannot become a weaker check by the author's label.
      const structural = all.get(v.id).classification === 'structural' || receipt.author?.classification === 'structural' || v.classification === 'structural'
      if (structural && (!v.implementationVerified || v.classification !== 'structural')) reasons.push('structural-verification-missing:' + v.id)
      else verified.add(v.id)
    }
  }
  const unresolved = [...all.keys()].filter(id => !verified.has(id))
  for (const id of unresolved) reasons.push('unresolved:' + id)
  if (receipt.author?.newRisks.conditions.some(c => !receipt.reviews.some(r => r.conditions.concat(r.newRisks.conditions).some(n => same(n, c))))) reasons.push('author-risk-not-adopted-by-reviewer')
  return result(phase, reasons.length ? 'unresolved' : 'closed', host.snapshot.revision, reasons, unresolved)
}

function safePath(root, rel, allowMissing = true) {
  if (!artifactPath(rel)) throw Error('unsafe-artifact-path')
  let path = root
  for (const part of rel.split('/')) {
    path = resolve(path, part)
    let entry
    try { entry = lstatSync(path) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      if (allowMissing) return resolve(root, rel)
      throw Error('artifact-missing:' + rel)
    }
    if (entry.isSymbolicLink()) throw Error('symlink-artifact:' + rel)
  }
  return path
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function writeJson(path, value) {
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw Error('unsafe-checkpoint')
  const temporary = path + '.' + randomUUID() + '.tmp'
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
  renameSync(temporary, path)
}
function pathsFor(repo, feature, phase, native = false) {
  const prefix = relative(repo, feature).split(sep).join('/')
  if (!prefix || prefix.startsWith('../')) throw Error('feature-must-be-inside-repo')
  safePath(repo, prefix, false)
  const targets = ['00_complexity_assessment.md', '01_requirements.md', '02_research.md', '04_domain_model.md', '05_architecture.md']
  if (phase === 'qe') targets.push('06_implementation_plan.md', '03.5_ideation_report.md')
  const adr = safePath(repo, prefix + '/03_adr')
  if (existsSync(adr) && !lstatSync(adr).isDirectory()) throw Error('adr-not-directory')
  const decisions = existsSync(adr) ? (native ? nativeNames(adr) : readdirSync(adr)).filter(p => /^[0-9]{3}-.+\.md$/.test(p)).sort() : []
  if (phase === 'ideation' && !decisions.length) throw Error('adr-missing')
  const paths = targets.filter(p => existsSync(resolve(feature, p))).concat(decisions.map(p => '03_adr/' + p)).map(p => prefix + '/' + p)
  for (const required of phase === 'ideation' ? ['01_requirements.md', '05_architecture.md'] : ['01_requirements.md', '06_implementation_plan.md']) if (!paths.includes(prefix + '/' + required)) throw Error('design-input-missing:' + required)
  if (phase === 'qe') {
    const planFile = safePath(repo, prefix + '/06_implementation_plan.md', false)
    const plan = native ? new TextDecoder('utf-8', { fatal: true }).decode(nativeBytes(planFile, 2 * 1024 * 1024)) : readFileSync(planFile, 'utf8')
    const block = plan.split(/^EXPECTED_CODE_TARGETS:\s*$/m)
    if (block.length !== 2) throw Error('target-block-missing-or-duplicate')
    const planned = block[1].split('\n').filter(line => line.trim()).map(line => {
      const match = /^- (.+)$/.exec(line)
      if (!match) throw Error('target-block-malformed')
      return match[1]
    })
    if (!planned.length) throw Error('target-block-empty')
    const baseFile = resolve(feature, '.fa-state/base-ref')
    const base = existsSync(baseFile) ? (native ? nativeBytes(baseFile, 256 * 1024).toString('utf8') : readFileSync(baseFile, 'utf8')).trim() : 'HEAD'
    if (!/^[A-Za-z0-9_./:-]+$/.test(base) || base.startsWith('-')) throw Error('base-ref-invalid')
    const guard = '.dz/guard.json'
    // Exact index membership includes staged additions/intent-to-add. The selected
    // base proves deletions; descendants and unrelated history confer no authority.
    const proof = [['ls-files', '--cached', '-z', '--', guard], ['ls-tree', '-r', '--name-only', '-z', base, '--', guard]].map(command =>
      execFileSync('git', command, { cwd: repo, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...(native ? { timeout: 2000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } } : {}) }).split('\0').includes(guard))
    const allowedGuard = p => p === guard && proof.some(Boolean)
    if (planned.some(p => /^(features|\.dz|\.agentic-qe|roam)\//.test(p) && !allowedGuard(p))) throw Error('circular-review-target')
    paths.push(...planned)
    // Additions/deletions are discovered by the host, not the author delta request.
    for (const command of [['diff', '--no-renames', '--name-only', '-z', base, '--'], ['ls-files', '--others', '--exclude-standard', '-z']]) {
      const names = execFileSync('git', command, { cwd: repo, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...(native ? { timeout: 2000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } } : {}) }).split('\0').filter(Boolean)
      paths.push(...names.filter(p => allowedGuard(p) || !p.startsWith('features/') && !p.startsWith('.dz/') && !p.startsWith('.agentic-qe/') && !p.startsWith('roam/') && p !== 'architecture/map.json'))
    }
  }
  return [...new Set(paths)].sort()
}
export function measureManifest(repo, feature, phase) {
  return measurePaths(repo, pathsFor(repo, feature, phase))
}
function measurePaths(repo, paths) {
  return [...new Set(paths)].sort().map(path => {
    const absolute = safePath(repo, path)
    if (!existsSync(absolute)) return { path, digest: null }
    if (!lstatSync(absolute).isFile()) throw Error('non-file-artifact:' + path)
    return { path, digest: digest(readFileSync(absolute)) }
  })
}
function checkpointPaths(repo, feature, phase) {
  const stateRel = relative(repo, feature).split(sep).join('/') + '/.fa-state'
  const state = safePath(repo, stateRel)
  mkdirSync(state, { recursive: true })
  return { host: safePath(repo, stateRel + '/review-convergence-' + phase + '-host.json'), review: safePath(repo, stateRel + '/review-convergence-' + phase + '-review.json') }
}
function qeCheckpoint(repo, feature) {
  const rel = relative(repo, feature).split(sep).join('/') + '/.fa-state/checkpoints.jsonl'
  const file = safePath(repo, rel)
  if (!existsSync(file)) return null
  let checkpoint = null
  for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const item = JSON.parse(line)
    if (item.stage === 'qe') checkpoint = item.result
  }
  return checkpoint ? { checkpointDigest: digest(JSON.stringify(checkpoint)), checkpoint } : null
}
function seriousFindings(source) {
  return (array(source?.gaps) ? source.gaps : []).filter(gap => [gap.sev, gap.severity, gap.priority].some(v => /(?:^|[^A-Z0-9])(BLOCKER|CRITICAL|HIGH|P0|P1)(?:$|[^A-Z0-9])/.test(String(v || '').toUpperCase())))
}
function reconcileCheckpoint(host, receipt, measured, repo, feature, knownReport) {
  if (!measured) return null
  const stage = measured.checkpoint
  for (const [base, source, family, missing] of [
    ['qe-primary', stage.qe, reviewerFamily(stage), !stage.qe || Boolean(stage.qe?.convergenceUnavailable)],
    ['qe-precision', stage.qe2, 'claude', host.reviewers.some(r => r.id.startsWith('qe-precision')) && (!stage.qe2 || !stage.qe2.reportWritten)],
  ]) {
    const findings = seriousFindings(source)
    if (!missing && !findings.length) continue
    const origin = host.reviewers.find(r => (r.id === base || r.id === base + ':' + family) && r.family === family)
    const review = receipt.reviews.find(r => r.reviewer === origin?.id)
    const proof = review?.checkpointVerification
    if (!origin || !checkpointProof(proof) || proof.checkpointDigest !== measured.checkpointDigest || !text(proof.evidence) || proof.supported !== true || !['native', 'mode-b', 'fallback'].includes(proof.route) || !array(proof.findings) || proof.findings.length !== findings.length || !(proof.reportDigest === null || hash(proof.reportDigest))) return null
    const mapped = new Set()
    for (const gap of findings) {
      const item = proof.findings.find(v => v.digest === digest(JSON.stringify(gap)))
      if (!dictionary(item, ['digest', 'conditionId']) || mapped.has(item.conditionId) || !host.conditions.some(c => c.id === item.conditionId && c.owner === origin.id && ['BLOCKER', 'CRITICAL', 'HIGH'].includes(c.severity)) || !review.verifications.some(v => v.id === item.conditionId && v.revision === host.snapshot.revision && v.implementationVerified === true && v.classification === 'structural')) return null
      mapped.add(item.conditionId)
    }
    if (base === 'qe-precision' && missing) {
      const file = safePath(repo, relative(repo, feature).split(sep).join('/') + '/08_qe_report.md', false)
      const report = knownReport === undefined ? readFileSync(file) : knownReport
      if (report === null) return null
      if (digest(report) !== proof.reportDigest || !/## Primary QE pass/.test(report.toString()) || !/## Precision QE pass/.test(report.toString()) || !/Combined Step-8 grade:/.test(report.toString())) return null
    }
  }
  return { ...measured, revision: host.snapshot.revision }
}
function retainPendingReceipt(host, path) {
  if (!host || !existsSync(path)) return host
  let receipt
  try { receipt = readJson(path) } catch (_) { throw Error('pending-reviewer-receipt-needs-origin-review') }
  if (!dictionary(receipt, ['schema', 'phase', 'nonce', 'revision', 'reviews', 'author']) || receipt.schema !== SCHEMA || receipt.phase !== host.phase || !text(receipt.nonce) || !hash(receipt.revision) || !array(receipt.reviews, 16) || !receipt.reviews.length || new Set(receipt.reviews.map(r => r?.reviewer)).size !== receipt.reviews.length) throw Error('pending-reviewer-receipt-needs-origin-review')
  const owners = host.reviewers.map(r => r.id), preserved = new Map(host.conditions.map(c => [c.id, c]))
  const fresh = receipt.nonce === host.snapshot.nonce && receipt.revision === host.snapshot.revision
  let problem = false, witnessed = false
  for (const r of receipt.reviews) {
    if (!reviewerEntry(r, host.reviewers) || Object.hasOwn(r, 'checkpointVerification') && !checkpointProof(r.checkpointVerification)) { problem = true; continue }
    const own = r.conditions.concat(r.newRisks.conditions)
    if (new Set(own.map(c => c.id)).size !== own.length) { problem = true; continue }
    witnessed = true
    for (const c of own) {
      // Stale evidence may preserve a known condition; it cannot originate new host authority.
      if (preserved.has(c.id)) { if (!same(preserved.get(c.id), c)) problem = true }
      else if (!fresh || c.scope.some(path => !host.snapshot.manifest.some(p => p.path === path))) problem = true
      else if (condition(c, owners) && c.owner === r.reviewer) preserved.set(c.id, c)
    }
  }
  const next = { ...host, conditions: [...preserved.values()], reviewSeen: host.reviewSeen || witnessed }
  // This imports original independent findings only, never closure, author claims or a grade.
  return { next, problem }
}
function bindReviewers(host, requested, measured) {
  if (!host) return requested
  const bound = host.reviewers.map(r => ({ ...r }))
  for (const actual of requested) {
    const prior = bound.find(r => r.id === actual.id)
    if (!prior) throw Error('host-lineage-conflict')
    if (prior.family === actual.family) continue
    const originated = host.reviewSeen || host.conditions.some(c => c.owner === prior.id) || measured && (prior.id === 'qe-primary' && reviewerFamily(measured.checkpoint) === prior.family || prior.id === 'qe-precision' && measured.checkpoint.qe2)
    if (!originated) prior.family = actual.family
    else if (!bound.some(r => r.id === actual.id + ':' + actual.family)) bound.push({ id: actual.id + ':' + actual.family, family: actual.family })
  }
  if (host.reviewers.some(r => !r.id.includes(':') && !requested.some(n => n.id === r.id)) || bound.length > 16) throw Error('host-lineage-conflict')
  return bound
}
export function runGate({ action, repo, feature, phase, reviewers }) {
  if (!phases.includes(phase) || !['prepare', 'evaluate'].includes(action)) throw Error('invalid-command')
  repo = realpathSync(repo); feature = resolve(repo, feature)
  const paths = checkpointPaths(repo, feature, phase)
  const hostExists = existsSync(paths.host)
  let host = hostExists ? readJson(paths.host) : null
  if (hostExists) {
    const problem = hostProblem(host)
    if (problem) throw Error(problem)
    if (host.phase !== phase) throw Error('host-lineage-conflict')
  }
  let pending = null
  if (host && existsSync(paths.review)) {
    try { pending = retainPendingReceipt(host, paths.review) } catch (error) { if (action === 'prepare') throw error }
  }
  const retained = pending?.next || host
  // Only scopes bound by the validated prior snapshot can extend current discovery.
  const current = measurePaths(repo, pathsFor(repo, feature, phase).concat((retained?.conditions || []).flatMap(c => c.scope)))
  const measuredCheckpoint = phase === 'qe' ? qeCheckpoint(repo, feature) : null
  if (action === 'prepare') {
    if (!array(reviewers, 16) || !reviewers.length || !reviewers.every(r => dictionary(r, ['id', 'family']) && text(r.id) && ['codex', 'claude', 'owner-exception'].includes(r.family)) || new Set(reviewers.map(r => r.id)).size !== reviewers.length) throw Error('reviewers-invalid')
    if (pending) {
      host = pending.next
      if (pending.problem) { writeJson(paths.host, host); throw Error('pending-reviewer-receipt-needs-origin-review') }
    }
    reviewers = bindReviewers(host, reviewers, measuredCheckpoint)
    const revision = digest(JSON.stringify(current))
    const snapshot = host?.snapshot?.revision === revision ? host.snapshot : { nonce: randomUUID(), revision, manifest: current }
    const priorManifest = new Map((host?.snapshot?.manifest || []).map(p => [p.path, p.digest]))
    const newManifest = new Map(current.map(p => [p.path, p.digest]))
    const changedPaths = host?.snapshot?.revision === revision ? host.changedPaths : host ? [...new Set([...(host.changedPaths || []), ...[...new Set([...priorManifest.keys(), ...newManifest.keys()])].filter(path => priorManifest.get(path) !== newManifest.get(path))])].sort() : []
    const next = { schema: SCHEMA, phase, reviewers, snapshot, conditions: host?.conditions || [], reviewSeen: host?.reviewSeen || false, rework: Boolean(host && (host.rework || host.reviewSeen && (host.snapshot.revision !== revision || host.conditions.length > 0))), changedPaths }
    writeJson(paths.host, next)
    return { ...result(phase, 'prepared', revision, []), nonce: snapshot.nonce, manifest: current, conditions: next.conditions, reviewers, checkpointDigest: measuredCheckpoint?.checkpointDigest || null }
  }
  if (!host) return result(phase, 'not-established', null, ['host-lineage-missing'])
  if (!existsSync(paths.review)) return result(phase, 'not-established', host.snapshot.revision, ['reviewer-receipt-missing'], host.conditions.map(c => c.id))
  const receipt = readJson(paths.review)
  let verdict = evaluateReviewConvergence(host, receipt, current)
  let closure = null
  if (phase === 'qe' && verdict.verdict === 'closed' && measuredCheckpoint) {
    closure = reconcileCheckpoint(host, receipt, measuredCheckpoint, repo, feature)
    if (!closure) verdict = result(phase, 'not-established', host.snapshot.revision, ['historical-checkpoint-own-verification-missing'])
  }
  // Preserve only fresh, independently owned findings bound by the prior snapshot.
  // Stale or malformed receipts cannot originate measurement authority on refusal.
  const preserved = new Map((pending?.next.conditions || host.conditions).map(c => [c.id, c]))
  const owners = host.reviewers.map(r => r.id)
  if (receipt?.phase === phase && receipt.nonce === host.snapshot.nonce && receipt.revision === host.snapshot.revision && risks(receipt.author?.newRisks, owners)) {
    for (const c of receipt.author.newRisks.conditions) if (!preserved.has(c.id) && c.scope.every(path => host.snapshot.manifest.some(p => p.path === path))) preserved.set(c.id, c)
  }
  writeJson(paths.host, { ...host, conditions: [...preserved.values()], reviewSeen: pending?.next.reviewSeen || host.reviewSeen, changedPaths: verdict.verdict === 'closed' ? [] : host.changedPaths })
  if (closure && verdict.verdict === 'closed') return { ...verdict, checkpointClosure: closure }
  return verdict
}

// Only the CLI supplies this capability. The default standalone runGate remains synchronous.
export const NATIVE_REVIEW_API_VERSION = 1
function nativeNames(dir) {
  if (!existsSync(dir)) return []
  const st = lstatSync(dir)
  if (!st.isDirectory() || st.isSymbolicLink()) throw Error('native-directory-unsafe:' + dir)
  const names = [], fd = opendirSync(dir)
  try { let entry; while ((entry = fd.readSync())) { names.push(entry.name); if (names.length > 256) throw Error('native-directory-candidate-limit:' + dir) } }
  finally { fd.closeSync() }
  return names.sort()
}
function nativeBytes(file, limit) {
  let st
  try { st = lstatSync(file) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (!st.isFile() || st.isSymbolicLink()) throw Error('native-file-unsafe:' + file)
  if (st.size > limit) throw Error('native-file-limit:' + file)
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile() || opened.ino !== st.ino || opened.dev !== st.dev) throw Error('native-file-changed:' + file)
    const bytes = Buffer.alloc(limit + 1); let n = 0
    while (n <= limit) { const got = readSync(fd, bytes, n, bytes.length - n, null); if (!got) break; n += got }
    if (n > limit) throw Error('native-file-limit:' + file)
    return bytes.subarray(0, n)
  } finally { closeSync(fd) }
}
function nativeManifest(repo, paths) {
  if (new Set(paths).size > 256) throw Error('native-artifact-path-limit')
  let total = 0
  return [...new Set(paths)].sort().map(path => {
    const bytes = nativeBytes(safePath(repo, path), 2 * 1024 * 1024)
    total += bytes?.length || 0
    if (total > 16 * 1024 * 1024) throw Error('native-artifact-aggregate-limit')
    return { path, digest: bytes === null ? null : digest(bytes) }
  })
}
function nativeReceipt(host, receipt, manifest) {
  // Reuse the unchanged strong aggregate gate with just the originating subset roster.
  // Missing reviewers can prevent closure without invalidating a structurally valid partial origin.
  if (!host || host.phase !== 'qe' || !dictionary(receipt, ['schema', 'phase', 'nonce', 'revision', 'reviews', 'author']) || receipt.schema !== SCHEMA || receipt.phase !== 'qe' || receipt.nonce !== host.snapshot.nonce || receipt.revision !== host.snapshot.revision || !array(receipt.reviews, 16) || !receipt.reviews.length || new Set(receipt.reviews.map(r => r?.reviewer)).size !== receipt.reviews.length) return null
  if (!receipt.reviews.every(r => reviewerEntry(r, host.reviewers))) return null
  const checked = evaluateReviewConvergence(host, receipt, manifest, true)
  if (checked.verdict === 'not-established') return null
  return receipt.reviews.map(r => ({ reviewer: r.reviewer, family: r.family }))
}
export function runNativeReviewGate({ action, repo, feature, reviewers, api }) {
  if (!api || api.version !== 1 || typeof api.transact !== 'function') throw Error('native-core-capability-not-established')
  if (!['prepare', 'evaluate', 'begin-repair'].includes(action)) throw Error('native-action-invalid')
  repo = realpathSync(repo); feature = realpathSync(resolve(repo, feature))
  const prefix = relative(repo, feature).split(sep).join('/')
  if (!prefix || prefix.startsWith('../') || api.projectRoot !== repo || api.featurePath !== feature) throw Error('native-feature-binding-invalid')
  safePath(repo, prefix, false)
  const stateDir = safePath(repo, prefix + '/.fa-state')
  const hostFile = safePath(repo, prefix + '/.fa-state/review-convergence-qe-host.json')
  const receiptFile = safePath(repo, prefix + '/.fa-state/review-convergence-qe-review.json')
  const checkpointFile = safePath(repo, prefix + '/.fa-state/checkpoints.jsonl')
  const baseFile = safePath(repo, prefix + '/.fa-state/base-ref')
  // Index bytes fence staging changes; no Git is run by the locked callback.
  let gitDir = resolve(repo, '.git')
  const gitStat = lstatSync(gitDir)
  if (gitStat.isFile()) {
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(nativeBytes(gitDir, 256 * 1024).toString('utf8'))
    if (!match) throw Error('native-gitdir-invalid')
    gitDir = realpathSync(resolve(repo, match[1]))
  } else if (!gitStat.isDirectory() || gitStat.isSymbolicLink()) throw Error('native-gitdir-invalid')
  const indexFile = resolve(gitDir, 'index')
  const measuredFiles = [hostFile, receiptFile, checkpointFile, baseFile, indexFile,
    safePath(repo, prefix + '/.fa-state/review-convergence-ideation-host.json'),
    safePath(repo, prefix + '/.fa-state/review-convergence-ideation-review.json'),
    safePath(repo, prefix + '/08_qe_report.md'),
    ...(gitStat.isFile() ? [resolve(repo, '.git')] : []), resolve(gitDir, 'HEAD')]
  const limits = measuredFiles.map(f => f === indexFile ? 4 * 1024 * 1024 : f === checkpointFile ? 2 * 1024 * 1024 : 256 * 1024)
  const observed = measuredFiles.map((f, i) => nativeBytes(f, limits[i]))
  const json = (index) => observed[index] === null ? null : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(observed[index]))
  const host = json(0)
  let receipt = null, receiptProblem = null
  try { receipt = json(1) } catch { receiptProblem = 'reviewer-receipt-malformed' }
  if (observed[0] !== null && (hostProblem(host) || host.phase !== 'qe')) throw Error(hostProblem(host) || 'native-host-phase-invalid')
  if (observed[3] !== null && !/^[A-Za-z0-9_./:-]+$/.test(observed[3].toString('utf8').trim())) throw Error('native-base-ref-invalid')
  const ideationHost = json(5), ideationReceipt = json(6)
  if (observed[5] !== null && (hostProblem(ideationHost) || ideationHost.phase !== 'ideation')) throw Error('native-ideation-state-invalid')
  if (observed[6] !== null) {
    if (!ideationHost || !dictionary(ideationReceipt, ['schema', 'phase', 'nonce', 'revision', 'reviews', 'author']) || ideationReceipt.schema !== SCHEMA || ideationReceipt.phase !== 'ideation' || !text(ideationReceipt.nonce) || !hash(ideationReceipt.revision) || !array(ideationReceipt.reviews, 16) || !ideationReceipt.reviews.length || new Set(ideationReceipt.reviews.map(r => r?.reviewer)).size !== ideationReceipt.reviews.length || !ideationReceipt.reviews.every(r => reviewerEntry(r, ideationHost.reviewers) && (!Object.hasOwn(r, 'checkpointVerification') || checkpointProof(r.checkpointVerification)))) throw Error('native-ideation-receipt-invalid')
    const owners = ideationHost.reviewers.map(r => r.id), author = ideationReceipt.author
    if (author !== null && (!dictionary(author, ['addressed', 'changedScope', 'classification', 'delta', 'evidence', 'newRisks']) || !strings(author.addressed) || !strings(author.changedScope, true) || !kinds.includes(author.classification) || !text(author.delta) || !text(author.evidence) || !risks(author.newRisks, owners))) throw Error('native-ideation-author-invalid')
    for (const r of ideationReceipt.reviews) {
      if (author ? !dictionary(r.deltaVerification, ['classification', 'evidence', 'implementationVerified']) || !kinds.includes(r.deltaVerification.classification) || !text(r.deltaVerification.evidence) || typeof r.deltaVerification.implementationVerified !== 'boolean' : r.deltaVerification !== null) throw Error('native-ideation-delta-invalid')
      if (!r.verifications.every(v => dictionary(v, ['id', 'revision', 'classification', 'evidence', 'implementationVerified']) && text(v.id) && hash(v.revision) && kinds.includes(v.classification) && text(v.evidence) && typeof v.implementationVerified === 'boolean') || new Set(r.verifications.map(v => v.id)).size !== r.verifications.length) throw Error('native-ideation-verification-invalid')
    }
  }
  let checkpoint = null
  if (observed[2] !== null) {
    if (observed[2].length && observed[2][observed[2].length - 1] !== 10) throw Error('native-checkpoint-candidate-torn')
    for (const line of new TextDecoder('utf-8', { fatal: true }).decode(observed[2]).split('\n').filter(Boolean)) {
      const entry = JSON.parse(line)
      if (!entry || typeof entry !== 'object' || typeof entry.stage !== 'string' || !entry.stage || typeof entry.inputHash !== 'string' || !entry.inputHash || !Object.hasOwn(entry, 'result') || entry.result === null) throw Error('native-checkpoint-candidate-invalid')
      if (entry.stage === 'qe') checkpoint = { checkpointDigest: digest(JSON.stringify(entry.result)), checkpoint: entry.result }
    }
  }
  const directoryFence = () => ({ adr: nativeNames(safePath(repo, prefix + '/03_adr')), bridge: nativeNames(safePath(repo, prefix + '/.fa-state/qe-bridge')), fragments: nativeNames(stateDir).filter(n => /^native-qe-(history\.jsonl|head\.json)\..*\.tmp$/.test(n)) })
  const membership = directoryFence()
  const paths = pathsFor(repo, feature, 'qe', true).concat((host?.conditions || []).flatMap(c => c.scope))
  const manifest = nativeManifest(repo, paths)
  if (action !== 'evaluate' && (!array(reviewers, 16) || !reviewers.length || !reviewers.every(r => dictionary(r, ['id', 'family']) && text(r.id) && ['codex', 'claude', 'owner-exception'].includes(r.family)) || new Set(reviewers.map(r => r.id)).size !== reviewers.length)) throw Error('reviewers-invalid')
  const observationDigest = digest(JSON.stringify({ files: observed.slice(1).map(b => b === null ? null : digest(b)), membership, manifest }))
  const checkpointClosure = host && receipt && checkpoint ? reconcileCheckpoint(host, receipt, checkpoint, repo, feature, observed[7]) : null
  return api.transact(action, active => {
    if (realpathSync(repo) !== repo || realpathSync(feature) !== feature) throw Error('native-project-feature-observation-changed')
    const currentGit = lstatSync(resolve(repo, '.git'))
    if (currentGit.ino !== gitStat.ino || currentGit.dev !== gitStat.dev) throw Error('native-gitdir-observation-changed')
    // Only descriptor/known-path work here; no discovery through runGate, Git, model or network.
    measuredFiles.forEach((file, i) => { const bytes = nativeBytes(file, limits[i]); if ((bytes === null) !== (observed[i] === null) || bytes !== null && !bytes.equals(observed[i])) throw Error('native-observation-changed:' + file) })
    const currentMembership = directoryFence()
    if (currentMembership.bridge.some(n => /^(signoff-|failed-).*\.json$/.test(n))) throw Error('native-bridge-source-collision:' + stateDir + '/native-qe-history.jsonl:' + stateDir + '/qe-bridge')
    if (!same(membership, currentMembership)) throw Error('native-candidate-membership-changed')
    if (!same(manifest, nativeManifest(repo, paths))) throw Error('native-artifact-observation-changed')
    if (membership.bridge.some(n => /^(signoff-|failed-).*\.json$/.test(n))) throw Error('native-bridge-source-collision:' + stateDir + '/native-qe-history.jsonl:' + stateDir + '/qe-bridge')
    if (membership.fragments.length) throw Error('native-temporary-fragment')
    if (!active && (observed[1] !== null || host && (host.reviewSeen || host.rework || host.conditions.length) || checkpoint)) throw Error('native-surviving-review-evidence-refuses-admission')
    if (active && (!host || !same(host.snapshot, active.snapshot))) throw Error('native-host-admitted-snapshot-mismatch')
    const revision = digest(JSON.stringify(manifest))
    const priorOrigins = nativeReceipt(host, receipt, host?.snapshot.manifest)
    if (action === 'prepare' && host && host.snapshot.revision !== revision && (active?.witnessed || priorOrigins)) throw Error('native-repair-required')
    if (action === 'evaluate') {
      if (!active || !host) throw Error('native-prepare-required')
      if (!same(manifest, host.snapshot.manifest)) throw Error('native-repair-required')
      const origins = nativeReceipt(host, receipt, manifest)
      let verdict = receipt === null ? result('qe', 'not-established', revision, [receiptProblem || 'reviewer-receipt-missing']) : evaluateReviewConvergence(host, receipt, manifest)
      // Closure is deliberately stronger than originating partial/unresolved evidence.
      if (verdict.verdict === 'closed' && checkpoint && !checkpointClosure) verdict = result('qe', 'not-established', revision, ['historical-checkpoint-own-verification-missing'])
      const preserved = new Map(host.conditions.map(c => [c.id, c]))
      if (origins) {
        for (const r of receipt.reviews) for (const c of r.conditions.concat(r.newRisks.conditions)) preserved.set(c.id, c)
        if (receipt.author) for (const c of receipt.author.newRisks.conditions) if (c.scope.every(path => manifest.some(p => p.path === path))) preserved.set(c.id, c)
      }
      if (verdict.verdict === 'closed' && checkpointClosure) verdict = { ...verdict, checkpointClosure }
      const next = { ...host, conditions: [...preserved.values()], reviewSeen: host.reviewSeen || Boolean(origins), changedPaths: verdict.verdict === 'closed' ? [] : host.changedPaths }
      return { host: next, snapshot: host.snapshot, origins: origins || [], receiptDigest: observed[1] === null ? null : digest(observed[1]), reason: origins ? null : verdict.reasons[0] || 'native-no-valid-origin', observationDigest, result: verdict, admission: false }
    }
    const bound = bindReviewers(host, reviewers, checkpoint)
    const snapshot = active?.snapshot.revision === revision ? active.snapshot : host?.snapshot.revision === revision ? host.snapshot : { nonce: randomUUID(), revision, manifest }
    const old = new Map((host?.snapshot.manifest || []).map(p => [p.path, p.digest])), current = new Map(manifest.map(p => [p.path, p.digest]))
    const changedPaths = host && host.snapshot.revision !== revision ? [...new Set([...old.keys(), ...current.keys()])].filter(p => old.get(p) !== current.get(p)).sort() : host?.changedPaths || []
    const next = { schema: SCHEMA, phase: 'qe', reviewers: bound, snapshot, conditions: host?.conditions || [], reviewSeen: host?.reviewSeen || false, rework: Boolean(host && (host.rework || host.reviewSeen && host.snapshot.revision !== revision)), changedPaths }
    return { host: next, snapshot, origins: [], receiptDigest: null, reason: null, observationDigest, result: { ...result('qe', 'prepared', revision, []), nonce: snapshot.nonce, manifest, reviewers: bound, conditions: next.conditions, checkpointDigest: checkpoint?.checkpointDigest || null }, admission: !active }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let phase = 'qe'
  try {
    const args = process.argv.slice(2)
    const action = args.shift()
    const options = {}
    while (args.length) {
      const key = args.shift()
      if (!['--repo', '--feature', '--phase', '--reviewers'].includes(key) || !args.length || Object.hasOwn(options, key)) throw Error('invalid-arguments')
      options[key] = args.shift()
    }
    phase = options['--phase']
    if (!options['--repo'] || !options['--feature'] || !phases.includes(phase)) throw Error('invalid-arguments')
    const output = runGate({ action, repo: options['--repo'], feature: options['--feature'], phase, reviewers: options['--reviewers'] ? JSON.parse(options['--reviewers']) : undefined })
    process.stdout.write(JSON.stringify(output) + '\n')
    process.exitCode = ['closed', 'prepared'].includes(output.verdict) ? 0 : output.verdict === 'unresolved' ? 1 : 3
  } catch (error) {
    process.stdout.write(JSON.stringify(result(phases.includes(phase) ? phase : 'qe', 'not-established', null, [String(error.message)])) + '\n')
    process.exitCode = 3
  }
}
