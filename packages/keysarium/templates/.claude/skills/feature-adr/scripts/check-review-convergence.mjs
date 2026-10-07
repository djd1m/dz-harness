#!/usr/bin/env node
// Host checkpoint lineage, not a reviewer-supplied prior array, owns historical conditions.
// This checks consistency/freshness; it does not authenticate models or judge their evidence.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
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
export function evaluateReviewConvergence(host, receipt, currentManifest) {
  const phase = host?.phase
  const refuse = reason => result(phase || 'qe', 'not-established', host?.snapshot?.revision || null, [reason], (array(host?.conditions) ? host.conditions : []).map(c => c?.id))
  const problem = hostProblem(host)
  if (problem) return refuse(problem)
  const owners = host.reviewers.map(r => r.id)
  if (!same(host.snapshot.manifest, currentManifest) || digest(JSON.stringify(currentManifest)) !== host.snapshot.revision) return refuse('artifact-manifest-changed')
  if (!dictionary(receipt, ['schema', 'phase', 'nonce', 'revision', 'reviews', 'author']) || receipt.schema !== SCHEMA || receipt.phase !== phase || receipt.nonce !== host.snapshot.nonce || receipt.revision !== host.snapshot.revision) return refuse('receipt-phase-or-revision-invalid')
  if (!array(receipt.reviews, 16) || receipt.reviews.length !== owners.length || new Set(receipt.reviews.map(r => r?.reviewer)).size !== owners.length) return refuse('reviewer-set-invalid')
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
function pathsFor(repo, feature, phase) {
  const prefix = relative(repo, feature).split(sep).join('/')
  if (!prefix || prefix.startsWith('../')) throw Error('feature-must-be-inside-repo')
  safePath(repo, prefix, false)
  const targets = ['00_complexity_assessment.md', '01_requirements.md', '02_research.md', '04_domain_model.md', '05_architecture.md']
  if (phase === 'qe') targets.push('06_implementation_plan.md', '03.5_ideation_report.md')
  const adr = safePath(repo, prefix + '/03_adr')
  if (existsSync(adr) && !lstatSync(adr).isDirectory()) throw Error('adr-not-directory')
  const decisions = existsSync(adr) ? readdirSync(adr).filter(p => /^[0-9]{3}-.+\.md$/.test(p)).sort() : []
  if (phase === 'ideation' && !decisions.length) throw Error('adr-missing')
  const paths = targets.filter(p => existsSync(resolve(feature, p))).concat(decisions.map(p => '03_adr/' + p)).map(p => prefix + '/' + p)
  for (const required of phase === 'ideation' ? ['01_requirements.md', '05_architecture.md'] : ['01_requirements.md', '06_implementation_plan.md']) if (!paths.includes(prefix + '/' + required)) throw Error('design-input-missing:' + required)
  if (phase === 'qe') {
    const plan = readFileSync(safePath(repo, prefix + '/06_implementation_plan.md', false), 'utf8')
    const block = plan.split(/^EXPECTED_CODE_TARGETS:\s*$/m)
    if (block.length !== 2) throw Error('target-block-missing-or-duplicate')
    const planned = block[1].split('\n').filter(line => line.trim()).map(line => {
      const match = /^- (.+)$/.exec(line)
      if (!match) throw Error('target-block-malformed')
      return match[1]
    })
    if (!planned.length) throw Error('target-block-empty')
    const baseFile = resolve(feature, '.fa-state/base-ref')
    const base = existsSync(baseFile) ? readFileSync(baseFile, 'utf8').trim() : 'HEAD'
    if (!/^[A-Za-z0-9_./:-]+$/.test(base) || base.startsWith('-')) throw Error('base-ref-invalid')
    const guard = '.dz/guard.json'
    // Exact index membership includes staged additions/intent-to-add. The selected
    // base proves deletions; descendants and unrelated history confer no authority.
    const proof = [['ls-files', '--cached', '-z', '--', guard], ['ls-tree', '-r', '--name-only', '-z', base, '--', guard]].map(command =>
      execFileSync('git', command, { cwd: repo, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).split('\0').includes(guard))
    const allowedGuard = p => p === guard && proof.some(Boolean)
    if (planned.some(p => /^(features|\.dz|\.agentic-qe|roam)\//.test(p) && !allowedGuard(p))) throw Error('circular-review-target')
    paths.push(...planned)
    // Additions/deletions are discovered by the host, not the author delta request.
    for (const command of [['diff', '--no-renames', '--name-only', '-z', base, '--'], ['ls-files', '--others', '--exclude-standard', '-z']]) {
      const names = execFileSync('git', command, { cwd: repo, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).split('\0').filter(Boolean)
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
function reconcileCheckpoint(host, receipt, measured, repo, feature) {
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
      const report = readFileSync(file)
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
