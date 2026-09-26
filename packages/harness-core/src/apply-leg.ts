/**
 * Apply-leg module (feature `setup-installs-apply-leg`, ADR-001 Decisions 1 and 2).
 *
 * The self-learning loop has three legs — COLLECT (session hooks → store), RANK (`dz teach` /
 * `dz recall` / `dz consolidate`), APPLY (a `UserPromptSubmit` hook injects learned lessons back
 * into the prompt via a resident embedding daemon). `dz setup` shipped the first two legs; the
 * third lived ONLY as hand-committed files in this hub's own `.claude/helpers/` — a consumer who
 * ran `dz setup --target claude-code --memory agentdb` got session hooks and a memory store, but no
 * recall injection at all (00_complexity_assessment.md, MEASURED 2026-09-12: clean scratch installs
 * on 0.8.10 and 0.8.22, with and without `--memory agentdb`, wrote no `UserPromptSubmit` entry).
 *
 * This module is the SOURCE of that third leg: the two helper files as versioned template
 * generators (the same shape as `AGENTDB_WRITER_VERSION`/`generateAgentdbWriter` in `setup.ts`),
 * the hook-registry entries `runSetup` merges into `settings.json`, and `applyLegStatus` — the ONE
 * measurement `dz doctor` and `dz parity` both read, so neither can drift into declaring the leg
 * present from a static capability table again (ADR-001 Decision 3, the "приборы врут" defect).
 *
 * Decision 2 (why `coreDistDir` is baked in, first candidate): a hook file lives in a CONSUMER
 * project's `.claude/helpers/`, where `require('@dzhechkov/harness-core')` cannot resolve — Node
 * resolves a bare specifier upward from the file, and the package is not above it in a global
 * install. The old hard-coded `/usr/lib/node_modules/...` candidate assumed one specific npm
 * prefix; a project set up from an nvm or `/usr/local` install found nothing. The fix mirrors
 * `claude-hooks-assets.ts`'s destructive-guard hook: bake the INSTALLING copy's absolute `dist`
 * directory into the generated body as the FIRST candidate (proven first at C-5), keep the
 * project-local candidates as fallbacks for a consumer that vendors its own harness-core.
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
// `node:os` is NOT one of the modules `countIoImports` (core-boundary.ts) tracks — free to import
// (core-boundary.test.ts's ratchet only counts fs/child_process/https). `probeApplyLeg`'s temp probe
// cwd reuses the existing top-level 'node:fs' import above (mkdtempSync/rmSync added to that SAME
// import statement, not a new one) so the ratchet stays at its pinned files:63 imports:69.
import { tmpdir, uptime } from 'node:os';
import { join, resolve } from 'node:path';
import { hookCommandsOf } from './managed-hooks.js';
import { patternRecordId, recordPattern, removePatternsByIds, loadStorePatternsSync, type PatternRecord, type RemovePatternsResult } from './patterns.js';

/**
 * FR-6 (feature `hook-recall-hybrid-parity`, ADR-001 C-4): send ONE `op: recall` probe to a LIVE
 * embed daemon socket and report the `engine` it answers with (`'hybrid'` | `'cosine-fallback'`) —
 * `dz doctor` prints this so an operator can SEE which engine is actually serving prompts, rather
 * than trusting the daemon's mere presence. Honest-degrade contract, matching every other doctor
 * probe: a non-socket path (e.g. a plain file, as every non-live doctor fixture in this repo uses),
 * a connection error, an unparsable reply, or a timeout all resolve to `undefined` — NEVER a thrown
 * error, and never distinguishable from "no daemon" in the caller's output (the existing "socket
 * present/absent" line already carries that half of the truth).
 *
 * `timeoutMs` defaults to 1000 ms — comfortably above the documented `HOOK_RECALL_BUDGET_MS` default
 * (500 ms): under that default, a cold `recallHybrid` semantic leg routinely exceeds the budget in
 * this environment (MEASURED — see the manifest's NFR-1 discussion), so the daemon's OWN answer
 * time is closer to ~500-550 ms than to the socket round-trip cost alone; a shorter probe timeout
 * would silently miss a live, correctly-answering daemon and report no engine at all.
 *
 * AM-8 (fix round 1): lives HERE, not in `operations.ts` — this module already owns the daemon's
 * wire protocol (`recallHookSource`/`embedDaemonSource`'s generated `op: recall` handshake) and its
 * socket-path resolution; `operations.ts`'s `runDoctor` reaches it via a dynamic `import()`
 * (matching its existing `embed-socket-path.js` import one line above the call site) rather than
 * duplicating a second, independent `node:net` IO surface in a file whose job is orchestration, not
 * protocol.
 */
export function probeRecallEngine(socketPath: string, timeoutMs = 1000): Promise<string | undefined> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const done = (v: string | undefined): void => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* already gone */
      }
      resolvePromise(v);
    };
    let sock: ReturnType<typeof netConnect>;
    try {
      sock = netConnect(socketPath);
    } catch {
      resolvePromise(undefined);
      return;
    }
    const timer = setTimeout(() => done(undefined), timeoutMs);
    timer.unref?.();
    let buf = '';
    sock.on('connect', () => {
      try {
        sock.write(`${JSON.stringify({ op: 'recall', prompt: 'dz doctor probe', limit: 1 })}\n`);
      } catch {
        done(undefined);
      }
    });
    sock.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf-8');
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      clearTimeout(timer);
      try {
        const msg = JSON.parse(buf.slice(0, nl)) as { engine?: unknown };
        // Codex round-3: only the protocol's own vocabulary is reported; anything else is "unknown" (undefined)
        done(msg.engine === 'hybrid' || msg.engine === 'cosine-fallback' || msg.engine === 'none' ? msg.engine : undefined);
      } catch {
        done(undefined);
      }
    });
    sock.on('error', () => {
      clearTimeout(timer);
      done(undefined);
    });
  });
}

/**
 * Version stamped into BOTH generated helper files as `// dz-apply-leg-version: N` (line 2, right
 * after the shebang). Bump on ANY change to {@link recallHookSource} or {@link embedDaemonSource}'s
 * output — `runSetup` regenerates a deployed helper whose stamp is older, without requiring
 * `--force` (the same self-healing contract as `AGENTDB_WRITER_VERSION`).
 *
 * Bumped 2→3 (fix round 1, review Codex C, MEDIUM finding "hub twins непереносимы"):
 * `recallHookSource`'s `loadCoreModule` candidate list is now built with a conditional spread so a
 * `null` `coreDistDir` (the hub's own portable marker, C-6/finding-6) degrades cleanly to the
 * project-relative fallbacks — the generated BYTES changed for every caller, hub and consumer alike.
 *
 * Bumped 3→4 (feature `embed-socket-short-path`): both generated files now resolve the socket path
 * through the same `DZ_EMBED_SOCKET` → project-path-if-short → tmpdir-short-hash logic as
 * {@link resolveEmbedSocketPath} (inlined as TEXT in both — a template string cannot `import` a
 * compiled module), the daemon writes a `.dz/embed.sock.path` pointer when it picks the tmpdir-short
 * branch, and `ready` is now printed only after `existsSync(SOCKET)` confirms the bind actually
 * landed (previously logged unconditionally, before `listen` even ran).
 *
 * Bumped 4→5 (feature `hook-recall-hybrid-parity`, ADR-001 D1/D2): the daemon's `op: recall`
 * handler now tries core's `recallHybrid` FIRST — under a time budget (`HOOK_RECALL_BUDGET_MS`,
 * default 500 ms) — via the SAME `CORE_DIST_DIR` + `loadCoreModule` mechanism the hook already
 * used only for its policy modules; on budget overrun, engine error, or no resolvable core module
 * it falls back to today's brute-force cosine, honestly labelled `engine: 'cosine-fallback'` with a
 * `reason`. The hook now reads `engine`/`reason` off the daemon's reply (stderr-only, never
 * context) and applies its relevance floor to the NEW `score` format when `engine === 'hybrid'`,
 * preserving today's cosine-calibrated floor unchanged for the `cosine-fallback` path.
 *
 * Bumped 5→6 (`hook-recall-hybrid-parity`, fix round 1 — AM-1/AM-2/AM-3/AM-5): the daemon now
 * (a) fires a fire-and-forget engine warm-up before `listen()` (AM-1) so the first REAL `op: recall`
 * is less likely to pay a cold `resolveAgentdbEmbedder` init; (b) arms the budget timer BEFORE
 * `loadCoreModule()`, not after (AM-2, wall clock from request receipt); (c) treats ANY failure
 * past the budget race — a malformed hit, `patternRecordId()` throwing — as an honest cosine
 * fallback rather than a bare protocol error (AM-3); (d) reports the RAW core RRF score, unchanged,
 * instead of a locally re-normalized [0,1] value (AM-5) — the hook's own `HOOK_SCORE_FLOOR` default
 * moved from `0.01` to `0.005` to match (see that constant's own comment for the measurement).
 *
 * Bumped 6→7 (feature `apply-leg-install-root`, ADR-001 D1): both generated files now resolve
 * `PROJECT` install-root-first (`INSTALL_ROOT` = this file's own location, when it owns a `.dz/`)
 * instead of trusting a foreign session's `CLAUDE_PROJECT_DIR`/cwd (issue #2) — the hook's own
 * `[dz-recall]` diagnostic line also gains `root=<path> (install|env|cwd)`.
 *
 * Bumped 7→8 (`apply-leg-install-root`, fix round 1, AM-7 HIGH — real regression MEASURED via
 * `retro-debt-hook.test.ts` going 4/5 red on the v7 hub helper): `PROJECT` install-root-first is
 * correct for the STORE (pattern db, socket, daemon script) but WRONG for a per-session artifact —
 * the narrated-error retro-debt sentinel (`retro-pending.json`) is written by the INVOKING
 * SESSION's own Stop hook under `CLAUDE_PROJECT_DIR`, not under wherever the hook happens to be
 * installed; a shared $HOME install made the hook look for a foreign session's sentinel under the
 * install root and silently drop every session's own debt confrontation. Split: `PROJECT` (install-
 * root-first) stays the STORE root; a new `SESSION_ROOT` (`CLAUDE_PROJECT_DIR || cwd()`, the
 * pre-feature resolution, unchanged) is the root for `RETRO_PENDING` — the ONE per-session file this
 * hook reads (every other `PROJECT`-derived path in this file names the store, the daemon, or the
 * harness-core install, confirmed by grep against every `path.join(PROJECT, …)` site). The diag line
 * gains `session=<path>` alongside the existing `root=<path> (…)`.
 *
 * Bumped 8→9 (feature `apply-leg-never-silent`, ADR-001 D2, FR-1): every early return in `main()`
 * now prints `[dz-recall] skipped reason=<store-not-found|socket-absent|core-unavailable|
 * empty-prompt|no-hits> root=<path> (…) session=<path>` on stderr before returning — the hook used
 * to exit silently on every one of these paths, indistinguishable (from stderr alone) from a
 * correctly-quiet "nothing relevant" outcome. `embedDaemonSource`'s own bytes are UNCHANGED by this
 * bump; the shared version number still advances because both helpers are upgraded as one unit by
 * `dz setup`/`applyLegStatus`.
 *
 * Bumped 9→10 (`apply-leg-never-silent`, fix round 1 — cross-model review AM-3/AM-6): (a) the hook
 * now tags its `op: recall` request with `probe: <bool>` (true only when
 * `DZ_HOOK_LIVENESS_PROBE=1`, the env {@link "./operations.js".probeHookLiveness} already stamps on
 * every live-probe spawn) so the daemon can tell a genuine session prompt apart from
 * `probeApplyLeg`'s own beacon query — AM-3: a beacon written for the ~8s of a doctor/parity probe
 * used to be recallable by ANY concurrent real prompt in the SAME project, a probe-only fixture
 * leaking into a real session's context; (b) `askDaemon`'s every failure path used to collapse into
 * one `undefined`, forcing the hook's own `skip('socket-absent')` call regardless of what actually
 * went wrong — AM-6: it now returns a tagged `{error: 'socket-absent'|'connect-refused'|
 * 'daemon-timeout'|'bad-reply'}` so the stderr reason names the ACTUAL failure (no socket file vs a
 * non-socket file at that path vs a listener that never replies vs a listener that replies with
 * something unparseable/shapeless). `embedDaemonSource`'s bytes also change for AM-3: `loadPatterns`
 * now reads each row's `domain` out of the SAME metadata JSON `dzIdOf`/`quarantinedOf` already
 * parse (the vector mirror carries no separate domain column), and both `hybridRecall`'s hits and
 * the cosine-fallback `scored` array are filtered to exclude `domain === 'apply-leg-probe'` unless
 * the request carried `probe: true` — a probe's own beacon still needs to reach ITS query, only a
 * REAL prompt must never see it.
 *
 * Bumped 10→11 (feature `embed-daemon-memory`, ADR-001 D1): the daemon now tries core's OWN cached
 * embedder (`resolveAgentdbEmbedder`) first — one pipeline per process — building a private one only
 * when core cannot hand one over; `ready` gained the ` embedder=<core-shared|own-fallback>` suffix
 * (see `features/embed-daemon-memory/07_code_changes/change_manifest.md` for the full T3 note; this
 * paragraph was missing from the bump history and is added here for the record, fix round 1).
 *
 * Bumped 11→12 (`embed-daemon-memory`, fix round 1 — F1/F2, Codex #1b/#3): (a) F1 — the own-fallback
 * pipeline now reads the STORE's own dtype manifest before building (absent = fp32 legacy, a
 * present-but-unrecognized value fails the request loudly instead of silently building fp32 against
 * a q8 store); `ready`'s own-fallback branch gains ` dtype=<fp32|q8|error>`. (b) F2 — a core-shared
 * STARTUP init failure no longer falls back to building an own pipeline (which risked a second live
 * embedder once a later hybrid call succeeded): `embedderSource` stays `'core-shared'` and `embed`
 * re-resolves `core.resolveAgentdbEmbedder` per request instead; `ready` names a startup failure
 * inline as `core-shared (init failed: <msg>, will retry per request)`; `warmUpHybridEngine()` is
 * skipped entirely in own-fallback mode. (c) `answerRecall`'s `embed(prompt)` call is now wrapped so
 * either failure mode degrades to the SAME honest `cosine-fallback` reply shape as every other
 * failure, never a bare protocol `{error}`.
 */
export const APPLY_LEG_VERSION = 13;

/**
 * Parse the `dz-apply-leg-version` stamp from a deployed helper file. Unlike
 * `writerVersionOf` (which floors an absent stamp at `0`), this returns `-1` for "no stamp at
 * all" per the plan contract (T1) — `0` is reserved for a future explicit `version 0` helper, and
 * collapsing "never installed" into the same number as "installed at v0" would make
 * `applyLegStatus` unable to tell the two apart.
 */
export function applyLegVersionOf(content: string): number {
  const m = /^\/\/ dz-apply-leg-version:\s*(\d+)/m.exec(content);
  return m ? parseInt(m[1] ?? '0', 10) : -1;
}

/**
 * Read back the `coreDistDir` baked into a deployed `recall-hook.cjs` by {@link recallHookSource}
 * (fix round 1, review Codex C, MEDIUM finding "переезд ядра"): `undefined` when the file carries no
 * recognisable `const CORE_DIST_DIR = …;` line at all (e.g. a pre-feature or hand-edited file),
 * `null` for the hub's own portable marker, otherwise the baked absolute path. `runSetup` compares
 * this against the CURRENT `coreDistDir` so a project whose npm/nvm relocated `harness-core` gets
 * its helper rewritten even when {@link APPLY_LEG_VERSION} did not change — a version-only staleness
 * check missed exactly this case (MEASURED: a stale baked path degrades the hook to permanent
 * silence, never a thrown error, so nothing else would ever surface it).
 */
export function bakedCoreDistDirOf(content: string): string | null | undefined {
  const m = /^const CORE_DIST_DIR = (.+);$/m.exec(content);
  if (!m) return undefined;
  const raw = m[1] ?? '';
  if (raw === 'null') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Generate `.claude/helpers/recall-hook.cjs`. `coreDistDir` is baked in as the FIRST resolve
 * candidate in `loadCoreModule` (Decision 2, AC-6/C-5) — an absolute path, supplied by the
 * installer (`dz setup`'s CLI caller resolves its own installed `@dzhechkov/harness-core`).
 *
 * `coreDistDir === null` is the HUB's OWN portable marker (fix round 1, review Codex C, MEDIUM
 * finding "hub twins непереносимы"): a checked-in file that bakes an ABSOLUTE checkout path fails
 * the twins byte-identity test in every clone but the one it was generated from. The hub instead
 * regenerates its two `.claude/helpers/*` files with `null`, which renders `const CORE_DIST_DIR =
 * null;` and — since `loadCoreModule`'s candidate list below SKIPS a falsy `CORE_DIST_DIR` — falls
 * straight through to the project-relative fallback candidates, the SAME `<project>/packages/
 * @dzhechkov/harness-core/dist/<file>` path the hub's own `coreDistDir` would have baked anyway
 * (`PROJECT` resolves from `CLAUDE_PROJECT_DIR`/`cwd()` at hook RUNTIME, not at generation time, so
 * it is correct in any clone). A real consumer install still gets its installer's absolute path
 * baked in as before — this is additive, not a behavior change for that case.
 *
 * Behaviourally identical to the pre-existing hand-committed hub file except for: the version
 * stamp (new, line 2) and the candidate list in `loadCoreModule` (baked path first when present,
 * `/usr/lib/...` dropped — FR-3).
 *
 * Also carries the `embed-socket-short-path` fix (FR-1/FR-2): `SOCKET` is resolved through the
 * same env → project-path-if-short → tmpdir-short-hash logic as
 * {@link "./embed-socket-path.js".resolveEmbedSocketPath}, inlined as text and preferring an
 * on-disk pointer when the resolver itself would land on the tmpdir-short branch.
 */
export function recallHookSource(coreDistDir: string | null): string {
  return `#!/usr/bin/env node
// dz-apply-leg-version: ${APPLY_LEG_VERSION}
/**
 * \`UserPromptSubmit\` hook — the APPLY leg of dz's self-learning loop.
 *
 * A feedback loop has three legs: COLLECT → RANK → APPLY. dz collected automatically and never read
 * back: of 18 hooks, none touched the pattern store, so 100+ learned lessons reached an agent's
 * context only when \`feature-adr\` Step-0 asked or a human typed \`dz recall\`. The cost was concrete —
 * a lesson that was ALREADY STORED ("Codex writes out-of-band; \`changed=0\` means NOT-YET") failed to
 * prevent the same false grade-D a second time. This file is the missing leg.
 *
 * WHAT IT MUST NOT BECOME. agentic-qe has an apply leg and no rank leg: it injects the same five
 * static guidance lines on every prompt regardless of topic, and only 10 of its 198 patterns were
 * ever used. An apply leg without a floor trains the reader to ignore it. So: when nothing clears the
 * MEASURED relevance floor this hook prints NOTHING AT ALL and exits 0.
 *
 * NEVER-BLOCK is the top safety property, above usefulness. Any failure — no daemon, no deps, a
 * malformed payload, a slow socket — exits 0 in silence. A broken hook must never stall a turn.
 */

const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

// FR-1 (ADR-001 D1, apply-leg-install-root): resolve OUR OWN store from where this hook is
// INSTALLED, not from whatever project the invoking session happens to be in — a hook installed at
// $HOME (a common single-machine layout: \`dz setup --target claude --memory agentdb --project
// $HOME\`, expecting the leg everywhere) used to silently look up a DIFFERENT project's \`.dz/\`
// whenever CLAUDE_PROJECT_DIR pointed elsewhere (issue #2, MEASURED). Precedent:
// claude-hooks-assets.ts's \`path.resolve(__dirname, '..', '..')\` for the destructive-guard hook.
// Order: INSTALL_ROOT (if it owns a \`.dz/\`) -> CLAUDE_PROJECT_DIR -> cwd.
const INSTALL_ROOT = path.resolve(__dirname, '..', '..');
const ROOT_SOURCE = fs.existsSync(path.join(INSTALL_ROOT, '.dz')) ? 'install' : (process.env.CLAUDE_PROJECT_DIR ? 'env' : 'cwd');
const PROJECT = ROOT_SOURCE === 'install' ? INSTALL_ROOT : (process.env.CLAUDE_PROJECT_DIR || process.cwd());
// AM-7 (fix round 1, apply-leg-install-root): PROJECT above is the STORE root (install-first) — a
// pattern db shared across every session at a $HOME install is correctly install-scoped. A
// per-session ARTIFACT is the opposite: the retro-debt sentinel is written by THIS SESSION's own
// Stop hook under its own CLAUDE_PROJECT_DIR, so looking it up under a foreign install root finds
// nothing (or, worse, another session's leftover file) and silently drops the confrontation.
// SESSION_ROOT is the pre-feature resolution, unchanged — the root for any file that belongs to the
// INVOKING session rather than to the store.
const SESSION_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CORE_DIST_DIR = ${coreDistDir === null ? 'null' : JSON.stringify(coreDistDir)};

// embed-socket-short-path (FR-1/FR-2): byte-for-byte the same logic as \`resolveEmbedSocketPath\` /
// \`resolveEffectiveEmbedSocketPath\` in \`embed-socket-path.ts\` — inlined as TEXT because this file
// is standalone and cannot \`import\` a compiled core module (apply-leg-twins.test.ts pins the copies
// to the same behavior as the daemon's own inlined copy).
const EMBED_SOCKET_PATH_BYTES_LIMIT = 100;
function resolveEmbedSocketPath(projectRoot, env) {
  const fromEnv = env.DZ_EMBED_SOCKET;
  if (typeof fromEnv === 'string' && fromEnv !== '') return { path: fromEnv, reason: 'env' };
  const projectPath = path.join(projectRoot, '.dz', 'embed.sock');
  if (Buffer.byteLength(projectPath, 'utf8') <= EMBED_SOCKET_PATH_BYTES_LIMIT) return { path: projectPath, reason: 'project' };
  const hash = crypto.createHash('sha1').update(projectRoot).digest('hex').slice(0, 12);
  const uid = String(process.getuid?.() ?? 'u');
  const shortPath = path.join(os.tmpdir(), \`dz-\${uid}\`, \`embed-\${hash}.sock\`);
  const tooLong = Buffer.byteLength(shortPath, 'utf8') > EMBED_SOCKET_PATH_BYTES_LIMIT;
  return tooLong ? { path: shortPath, reason: 'tmpdir-short', tooLong: true } : { path: shortPath, reason: 'tmpdir-short' };
}
function readEmbedSocketPointer(projectRoot) {
  const pointerPath = path.join(projectRoot, '.dz', 'embed.sock.path');
  if (!fs.existsSync(pointerPath)) return undefined;
  try {
    const raw = fs.readFileSync(pointerPath, 'utf-8').trim();
    return raw !== '' ? raw : undefined;
  } catch {
    return undefined;
  }
}
function resolveEffectiveEmbedSocketPath(projectRoot, env) {
  const resolved = resolveEmbedSocketPath(projectRoot, env);
  if (resolved.reason !== 'tmpdir-short') return resolved;
  const pointer = readEmbedSocketPointer(projectRoot);
  return pointer !== undefined && fs.existsSync(pointer) ? { path: pointer, reason: 'tmpdir-short' } : resolved;
}
const SOCKET = resolveEffectiveEmbedSocketPath(PROJECT, process.env).path;
// AM-3 (fix round 1, apply-leg-never-silent): set ONLY by probeHookLiveness (operations.ts) on
// every live-probe spawn — never by a real Claude Code session. Rides into the daemon's op:recall
// request as \`probe\` so the daemon can admit the probe's OWN beacon (domain=apply-leg-probe)
// without ever surfacing it to a concurrent real prompt in the same project.
const IS_LIVENESS_PROBE = process.env.DZ_HOOK_LIVENESS_PROBE === '1';
const USAGE_LOG = process.env.DZ_RECALL_USAGE_LOG || path.join(PROJECT, '.dz', 'recall-usage.jsonl');
// Measured (2026-09-14, apply-leg-socket.test.ts): an ordinary hook round-trip (spawn + one socket
// op) took 81-121 ms; 800 ms leaves a wide margin for a loaded daemon while still bounding the AM-2
// worst case — a daemon synchronously blocked never replies at all, so THIS timeout (not the
// daemon's own internal budget race, which cannot preempt synchronous work) is what actually
// rescues the hook from hanging.
const TIMEOUT_MS = Number(process.env.DZ_RECALL_HOOK_TIMEOUT_MS || 800);

// FR-5 (hook-recall-hybrid-parity, ADR-001 D2): the RRF-based \`score\` the daemon returns for
// \`engine: 'hybrid'\` is NOT on the cosine scale DEFAULT_RECALL_FLOORS (recall-hook-policy.ts) was
// calibrated on — applying the cosine floor to an RRF score would either admit everything or cut
// everything, so the hybrid path gets its OWN floor, applied to BOTH languages alike (the RRF score
// carries no language-baseline shift the way raw cosine did).
//
// AM-5 (fix round 1), MEASURED not a placeholder: recallHybrid(RRF_K=60) over a live 14-lesson
// fixture (this environment, 2026-09-14 — reproducer in the manifest's Fix-round 1 section) shows
// raw RRF score is only WEAKLY discriminating per-hit: an exact-lexical-match hit scored 0.03252
// (both legs agree at rank 0), but a genuinely IRRELEVANT query ("xkcd banana quantum toaster
// nonsense") still returned a top hit at 0.01639 — HIGHER than several truly relevant tail hits in
// OTHER queries (0.01471-0.01538). This is structural, not a fixture artifact: RRF encodes RANK,
// not similarity, and a nearest-neighbor search always returns SOME top-1 even for a garbage query.
// A raw-score floor therefore cannot cleanly separate signal from noise at the per-hit level the
// way the cosine floor does — true filtering here has to come from \`limit\` and \`selectHookHits\`'s
// own budget, not from this number. The floor's honest job is only to reject a DEGENERATE score
// (zero/negative/NaN from a malformed hit), so it is set well BELOW the measured noise floor
// (0.01471) rather than attempting to rank-filter — deliberately permissive, matching ADR-001 D2's
// stated intent that an exact lexical match (FR-4) must never be defeated by an unmeasured cutoff.
const HOOK_SCORE_FLOOR = Number(process.env.DZ_RECALL_HOOK_SCORE_FLOOR || 0.005);

const safe = (fn, fb) => {
  try {
    return fn();
  } catch {
    return fb;
  }
};

/** Read the whole of stdin, bounded. Returns '' on anything unexpected. */
function readStdin() {
  return safe(() => fs.readFileSync(0, 'utf-8'), '');
}

/** Extract the prompt from a UserPromptSubmit payload — the shapes Claude Code may send. */
function extractPrompt(raw) {
  const text = String(raw || '').trim();
  if (text === '') return '';
  const parsed = safe(() => JSON.parse(text), undefined);
  if (parsed && typeof parsed === 'object') {
    for (const k of ['prompt', 'user_prompt', 'userPrompt']) {
      if (typeof parsed[k] === 'string' && parsed[k].trim() !== '') return parsed[k].trim();
    }
    return '';
  }
  return text; // plain, non-JSON text is the prompt
}

/**
 * Load the pure policy from the built harness-core. It ships as ESM, so a \`.cjs\` hook cannot
 * \`require()\` it — resolve the absolute path and use dynamic \`import()\`, exactly as
 * \`claim-check-hook.cjs\` does. Unresolvable ⇒ the hook is inert (exit 0), never a block.
 */
async function loadCoreModule(fileName, predicate) {
  const candidates = [
    ...(CORE_DIST_DIR ? [path.join(CORE_DIST_DIR, fileName)] : []),
    path.join(PROJECT, 'node_modules', '@dzhechkov', 'harness-core', 'dist', fileName),
    path.join(PROJECT, 'packages', '@dzhechkov', 'harness-core', 'dist', fileName),
  ];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    try {
      const mod = await import(pathToFileURL(c).href);
      if (predicate(mod)) return mod;
    } catch {
      /* try the next candidate */
    }
  }
  return undefined;
}

async function loadPolicy() {
  return loadCoreModule('recall-hook-policy.js', (mod) => typeof mod.selectHookHits === 'function');
}

/**
 * Retro admission-debt directive (feature narrated-error-must-be-taught, ADR-001 D2/D3). The Stop
 * hook's scan-tail arms \`.dz/retro/<session>/pending.json\` when the assistant admitted an error
 * without a teach; THIS hook confronts the assistant on the very next prompt. Contract:
 *  - no string session_id in the payload ⇒ '' BEFORE any fs call (the hook guesses no session);
 *  - sentinel absent ⇒ '' and ZERO extra work beyond one existsSync (the no-noise pin — output
 *    stays byte-identical to a build without this feature);
 *  - stale / other-session sentinel ⇒ '' (the debt belongs to a dead session; retro collected it);
 *  - core module absent or old (no directive exports) ⇒ '' — inert, NEVER-BLOCK.
 */
// AM-7 (fix round 1): SESSION_ROOT, not PROJECT — the sentinel is a per-session artifact (see the
// SESSION_ROOT comment above). retro-debt-sentinel-per-session: per-session by PATH now too — the
// root is the session's, and the file is under \`.dz/retro/<safeId>/\`, so two sessions in one
// worktree can no longer read (or clear) each other's debt through one shared flat file.
// TWIN of safeSessionDirName in session-retro.ts — duplicated inline because this hook must stay
// dependency-free; pinned to equal outputs by test retro-sentinel-per-session.test.ts (AC-6/twin).
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
function safeSessionDirName(sessionId) {
  if (SAFE_SESSION_ID_RE.test(sessionId) && sessionId !== '.' && sessionId !== '..') return sessionId;
  return crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
}
function retroPendingPathFor(sessionId) {
  return path.join(SESSION_ROOT, '.dz', 'retro', safeSessionDirName(sessionId), 'pending.json');
}
async function retroDebtDirective(payload) {
  const sessionId = payload && typeof payload.session_id === 'string' ? payload.session_id : '';
  if (sessionId === '') return '';
  const pendingPath = retroPendingPathFor(sessionId);
  if (!fs.existsSync(pendingPath)) return '';
  const sentinel = safe(() => JSON.parse(fs.readFileSync(pendingPath, 'utf-8')), undefined);
  if (!sentinel || typeof sentinel.snippet !== 'string' || sentinel.snippet === '') return '';
  const mod = await loadCoreModule(
    'session-retro.js',
    (m) => typeof m.renderRetroDebtDirective === 'function' && typeof m.retroSentinelIsFresh === 'function',
  );
  if (!mod) return '';
  return safe(() => {
    const ctx = {
      sessionId: payload && typeof payload.session_id === 'string' ? payload.session_id : undefined,
      transcriptPath: payload && typeof payload.transcript_path === 'string' ? payload.transcript_path : undefined,
      nowMs: Date.now(),
    };
    return mod.retroSentinelIsFresh(sentinel, ctx) ? String(mod.renderRetroDebtDirective(sentinel)) : '';
  }, '');
}

async function loadUsagePolicy() {
  return loadCoreModule('recall-usage.js', (mod) => typeof mod.formatRecallUsageRecord === 'function');
}

/** The event-chain primitives (ADR-001). Absent ⇒ records are written UNCHAINED, never blocked. */
async function loadChainPolicy() {
  return loadCoreModule('event-chain.js', (mod) => typeof mod.appendChainedLines === 'function' && typeof mod.guardedRewrite === 'function');
}

/**
 * Tail facts of the usage log, read from its END — O(1) in the file size. The apply-leg hook runs on
 * EVERY prompt, so re-reading the whole log per append would be a per-turn tax that eventually gets
 * the hook switched off. Unreadable ⇒ the empty tail, and the caller starts a marked chain segment.
 */
function readLogTail(chain, file) {
  return safe(() => {
    if (!chain || typeof chain.readTailInfo !== 'function') return undefined;
    if (!fs.existsSync(file)) return chain.EMPTY_LOG_TAIL;
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      if (!Number.isFinite(size) || size <= 0) return chain.EMPTY_LOG_TAIL;
      const want = Math.min(size, Number(chain.EVENT_CHAIN_TAIL_BYTES) || 65536);
      const buf = Buffer.alloc(want);
      fs.readSync(fd, buf, 0, want, size - want);
      return chain.readTailInfo(buf.toString('utf-8'), { partial: want < size });
    } finally {
      try { fs.closeSync(fd); } catch { /* nothing to do */ }
    }
  }, chain && chain.EMPTY_LOG_TAIL);
}

// FR-6 (hook-recall-hybrid-parity): the reply now carries \`engine\`/\`reason\` alongside \`hits\` —
// returned as a small object rather than the bare hit array, so the caller can apply the RIGHT
// floor (FR-5) and print the engine to stderr ONLY (never into the injected context, FR-2).
// AM-6 (fix round 1): every failure used to collapse into one \`undefined\`, forcing the caller's
// \`skip('socket-absent')\` regardless of whether the socket was truly absent, refused the connect,
// never replied, or replied with garbage. Each branch now tags its OWN reason so the stderr line
// (and, through it, \`probeApplyLeg\`'s parsed reason) names what actually happened.
function askDaemon(prompt) {
  return new Promise((resolve) => {
    if (!fs.existsSync(SOCKET)) return resolve({ error: 'socket-absent' });
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      safe(() => sock.destroy());
      resolve(v);
    };
    const sock = net.connect(SOCKET);
    const timer = setTimeout(() => done({ error: 'daemon-timeout' }), TIMEOUT_MS);
    timer.unref?.();
    let buf = '';
    sock.on('connect', () => sock.write(JSON.stringify({ op: 'recall', prompt, limit: 8, probe: IS_LIVENESS_PROBE }) + '\\n'));
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\\n');
      if (nl === -1) return;
      clearTimeout(timer);
      const msg = safe(() => JSON.parse(buf.slice(0, nl)), undefined);
      if (msg && Array.isArray(msg.hits)) {
        done({
          hits: msg.hits,
          engine: typeof msg.engine === 'string' ? msg.engine : undefined,
          reason: typeof msg.reason === 'string' ? msg.reason : undefined,
        });
      } else {
        done({ error: 'bad-reply' });
      }
    });
    sock.on('error', () => {
      clearTimeout(timer);
      done({ error: 'connect-refused' });
    });
  });
}

const REVIVE_LOCK = path.join(PROJECT, '.dz', 'embed-daemon.lock');
const REVIVE_LOCK_FRESH_MS = 120_000; // model load takes ~45s; don't respawn while one is coming up
function reviveDaemon() {
  // AM-7 (fix round 1, test-only): a test that probes the SAME dead fixture multiple times in quick
  // succession (probeApplyLeg directly, then again through runDoctor, then again through a
  // 'dz parity' subprocess) used to race against this very self-heal — the first probe's revive
  // could finish loading a real daemon before the second or third probe ran, flipping
  // "socket-absent" into "hybrid"/"cosine-fallback" non-deterministically. No production session
  // ever sets this.
  if (process.env.DZ_RECALL_NO_REVIVE === '1') return;
  // CROSS-PROCESS lock: every prompt runs a fresh hook process, so a per-process flag let 20 queued
  // prompts spawn 20 daemons while the first was still loading its model (Codex #5). A lockfile with
  // a freshness window means at most one spawn per window, machine-wide.
  safe(() => {
    fs.mkdirSync(path.dirname(REVIVE_LOCK), { recursive: true });
    // ATOMIC acquisition: \`wx\` fails if the lock exists — stat-then-write let every concurrent hook
    // observe "no fresh lock" and spawn its own daemon (the exact burst this lock exists to stop).
    try {
      fs.writeFileSync(REVIVE_LOCK, String(process.pid), { flag: 'wx' });
    } catch {
      // Lock exists. Stale (older than the freshness window) → steal it by rewrite; fresh → yield.
      try {
        const st = fs.statSync(REVIVE_LOCK);
        if (Date.now() - st.mtimeMs < REVIVE_LOCK_FRESH_MS) return;
        fs.writeFileSync(REVIVE_LOCK, String(process.pid));
      } catch {
        return; // cannot inspect the lock — yield rather than storm
      }
    }
    const { spawn } = require('child_process');
    const daemon = path.join(PROJECT, '.claude', 'helpers', 'dz-embed-daemon.mjs');
    if (!fs.existsSync(daemon)) return;
    const child = spawn(process.execPath, [daemon], { detached: true, stdio: 'ignore' });
    child.unref();
  }, undefined);
}

function recordUsage(hits, usage, query, chain) {
  safe(() => {
    const ts = new Date().toISOString();
    // One PROMPT = one event: the report must count prompts, not injected-hit rows (up to 3 per
    // prompt), or readiness is fabricated from multiplicity.
    const eventId = ts + ':' + Math.random().toString(36).slice(2, 10);
    const records = [];
    for (const h of hits || []) {
      if (typeof h?.dzId !== 'string' || h.dzId.trim() === '') continue;
      // query + runId make the log REPLAYABLE: without them it can say a lesson was used but never
      // say for what, which made cold-vs-warm measurement unbuildable from the recorded history.
      const runId = process.env.CLAUDE_CODE_SESSION_ID || undefined;
      const full = typeof query === 'string' ? query.trim() : '';
      const q = full !== '' ? full.slice(0, 200) : undefined;
      // A truncated prefix cannot REPRODUCE the original recall — flagged so the report excludes it
      // from replay readiness instead of counting a false pair.
      const queryTruncated = full.length > 200 ? true : undefined;
      const input = { dzId: h.dzId, score: h.score, ts, query: q, runId, eventId, queryTruncated };
      const rec =
        usage && typeof usage.buildRecallUsageRecord === 'function'
          ? usage.buildRecallUsageRecord(input)
          : { dzId: h.dzId, score: h.score, ts, ...(q ? { query: q } : {}), ...(runId ? { runId } : {}), eventId, ...(queryTruncated ? { queryTruncated } : {}) };
      if (rec && typeof rec === 'object') records.push(rec);
    }
    if (records.length === 0) return;
    // event-chain (ADR-001): seq + prevHash from the LAST LINE ONLY. If the chain module is absent
    // (a broken install) the records are still written, unchained — a hole verify will name, which
    // is the honest outcome; never-block outranks chain completeness.
    const payload =
      chain && typeof chain.appendChainedLines === 'function'
        ? chain.appendChainedLines(records, readLogTail(chain, USAGE_LOG))
        : records.map((r) => JSON.stringify(r) + '\\n').join('');
    if (typeof payload !== 'string' || payload === '') return;
    fs.mkdirSync(path.dirname(USAGE_LOG), { recursive: true });
    fs.appendFileSync(USAGE_LOG, payload, 'utf-8');
    compactUsageLogIfNeeded(usage, chain, ts);
  }, undefined);
}

const COMPACT_LOCK = \`\${USAGE_LOG}.compact.lock\`;
/** A compaction is milliseconds of work; anything older than this is a crashed holder. */
const COMPACT_LOCK_FRESH_MS = 30_000;

/**
 * ATOMIC \`wx\` acquisition with a staleness window — the same pattern the daemon-revive lock uses.
 * \`wx\` fails when the file exists, so two hooks cannot both believe they hold it (a stat-then-write
 * check let every concurrent hook observe "free" and proceed, which is the burst this prevents).
 */
// The lock TOKEN identifies the owner: release must only ever remove the holder's OWN lock, and a
// stale steal must be an atomic claim, not an overwrite two stealers can both "win" (Codex re-QE MED).
const COMPACT_LOCK_TOKEN = \`\${process.pid}.\${Math.floor(Math.random() * 0xffffffff).toString(16)}\`;
function acquireCompactLock() {
  return (
    safe(() => {
      try {
        fs.writeFileSync(COMPACT_LOCK, COMPACT_LOCK_TOKEN, { flag: 'wx' });
        return true;
      } catch {
        const st = fs.statSync(COMPACT_LOCK); // throws ⇒ vanished ⇒ treat as busy, try next prompt
        if (Date.now() - st.mtimeMs < COMPACT_LOCK_FRESH_MS) return false;
        // Stale: unlink, then RE-RACE through \`wx\` — of N concurrent stealers exactly one wins;
        // a plain overwrite here let every stealer proceed and each believed it held the lock.
        try { fs.unlinkSync(COMPACT_LOCK); } catch { /* someone else already removed it */ }
        fs.writeFileSync(COMPACT_LOCK, COMPACT_LOCK_TOKEN, { flag: 'wx' }); // throws ⇒ lost the race ⇒ busy
        return true;
      }
    }, false) === true
  );
}
/** Release ONLY our own lock: a token mismatch means a stealer legitimately took over — leave it. */
function releaseCompactLock() {
  safe(() => {
    if (fs.readFileSync(COMPACT_LOCK, 'utf-8') === COMPACT_LOCK_TOKEN) fs.unlinkSync(COMPACT_LOCK);
  }, undefined);
}

/** Append a one-line note where a human (and \`dz doctor\`) will see it. Best-effort, never blocks. */
function noteEvent(event, detail) {
  safe(() => {
    fs.appendFileSync(
      path.join(PROJECT, '.dz', 'sessions.jsonl'),
      JSON.stringify({ event, ts: new Date().toISOString(), ...detail }) + '\\n',
    );
  }, undefined);
}

/**
 * Compaction is the only path that REWRITES the evidence log, so it is the only path that can lose
 * an append. It runs behind \`guardedRewrite\`: an exclusive lock, plus a re-read of the live file
 * after computing the new text and before the rename — an append that landed in between aborts the
 * attempt and is folded into the retry rather than being overwritten by it (Codex QE CRITICAL-1).
 */
function compactUsageLogIfNeeded(usage, chain, ts) {
  safe(() => {
    if (!usage || typeof usage.compactRecallUsageLogChecked !== 'function') return;
    const maxBytes = Number(process.env.DZ_RECALL_USAGE_MAX_BYTES || usage.RECALL_USAGE_LOG_MAX_BYTES || 1048576);
    const st = fs.statSync(USAGE_LOG);
    const shouldCompact =
      typeof usage.shouldCompactRecallUsageLogSize === 'function'
        ? usage.shouldCompactRecallUsageLogSize(st.size, maxBytes)
        : st.size > maxBytes;
    if (!shouldCompact) return;
    if (!chain || typeof chain.guardedRewrite !== 'function') return; // no guard ⇒ no rewrite

    const io = {
      read: () => safe(() => fs.readFileSync(USAGE_LOG, 'utf-8'), undefined),
      replace: (text) => {
        const tmp = \`\${USAGE_LOG}.\${process.pid}.tmp\`;
        fs.writeFileSync(tmp, text, 'utf-8');
        fs.renameSync(tmp, USAGE_LOG);
      },
      acquireLock: acquireCompactLock,
      releaseLock: () => releaseCompactLock(),
    };
    const result = chain.guardedRewrite(io, (text) => {
      const r = usage.compactRecallUsageLogChecked(text, { maxBytes, compactedAt: ts });
      return { text: r.text, refusedDirty: r.status === 'refused-dirty', defects: r.defects };
    });
    // A refusal or a persistent race is a FINDING about the evidence base, not a no-op to swallow.
    if (result.status === 'refused-dirty' || result.status === 'raced') {
      noteEvent('recall-usage-compaction-' + result.status, {
        attempts: result.attempts,
        defects: (result.defects || []).slice(0, 3).map((d) => \`\${d.kind}@L\${d.line}\`),
      });
    }
  }, undefined);
}

/** Emit additionalContext when non-empty; silence otherwise (the floor contract). */
function emitContext(context) {
  if (typeof context !== 'string' || context === '') return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context },
    }) + '\\n',
  );
}

// FR-1 (ADR-001 D2, apply-leg-never-silent): every silent early exit below now names WHY, on
// stderr, one line, same shape as the existing \`[dz-recall] engine=…\` diagnostic. Exit code stays
// 0 — a broken/empty/quiet hook must never fail a prompt (NEVER-BLOCK, unchanged). The reason is
// for TWO readers, neither of which is "the user watching Claude Code's own transcript" (FR-2's
// own manifest names why that channel does not apply to this hook): (1) \`dz doctor\`'s live probe,
// which spawns this exact command as a child process and reads ITS OWN child's stderr directly —
// unmediated by Claude Code's UI, so the redirect policy of any particular hook EVENT is moot; and
// (2) a human running the command by hand from a terminal, who sees stderr exactly as printed.
const skip = (reason) =>
  safe(() => process.stderr.write(\`[dz-recall] skipped reason=\${reason} root=\${PROJECT} (\${ROOT_SOURCE}) session=\${SESSION_ROOT}\\n\`));

async function main() {
  const raw = readStdin();
  const payload = safe(() => JSON.parse(String(raw || '').trim()), undefined);
  const prompt = extractPrompt(raw);

  // The retro debt directive rides EVERY early-return path below: a down daemon or an empty prompt
  // must not swallow the confrontation — the debt is independent of recall relevance. When the
  // sentinel is absent this is one existsSync and debt === '' (byte-identical outputs to before).
  const debt = await retroDebtDirective(payload);

  if (prompt === '') {
    skip('empty-prompt');
    return emitContext(debt);
  }

  // FR-1: the most fundamental silent failure (issue #2) — no \`.dz/\` at all under the resolved
  // PROJECT root. Checked BEFORE the policy/daemon legs below: a missing store makes every
  // downstream question ("is the daemon alive?") moot, and printing THIS reason first is what let
  // the original issue's symptom (four green checks, a store that was never there) be diagnosed
  // from stderr alone.
  if (!fs.existsSync(path.join(PROJECT, '.dz'))) {
    skip('store-not-found');
    return emitContext(debt);
  }

  const policy = await loadPolicy();
  if (!policy) {
    skip('core-unavailable');
    return emitContext(debt);
  }

  const daemonReply = await askDaemon(prompt);
  // AM-6: the tagged reason IS the diagnosis now — 'socket-absent' (no file), 'connect-refused' (a
  // file exists but nothing answers like a daemon), 'daemon-timeout' (something answers, never in
  // time) and 'bad-reply' (answers, unparseable/shapeless) are four DIFFERENT defects with four
  // different remedies; collapsing them back into one string is exactly the finding this fixes.
  if (daemonReply.error) {
    skip(daemonReply.error);
    // SELF-HEAL (2026-07-28): the daemon is started at SessionStart only, so when it dies mid-way
    // through a long-lived session NOTHING restarts it — the apply leg was silently dead for 19
    // days (MEASURED: recall-usage.jsonl last record 2026-07-09, socket absent). Spawn it
    // fire-and-forget so the NEXT prompt has it; this prompt stays uninjected (never-block).
    reviveDaemon();
    return emitContext(debt);
  }
  const { hits, engine, reason } = daemonReply;
  // FR-6/FR-2: the engine (and, on fallback, why) is the caller's business, not the model's — it
  // NEVER rides into additionalContext, only stderr, which Claude Code does not read as context.
  if (typeof engine === 'string') {
    safe(() => process.stderr.write(\`[dz-recall] engine=\${engine}\${reason ? \` reason=\${reason}\` : ''} root=\${PROJECT} (\${ROOT_SOURCE}) session=\${SESSION_ROOT}\\n\`));
  }
  if (hits.length === 0) {
    skip('no-hits');
    return emitContext(debt); // daemon alive, nothing relevant — silence is correct
  }

  // FR-5 (ADR-001 D2): a hybrid-engine reply carries an RRF-based score — its OWN floor, applied to
  // both languages. A cosine-fallback reply (or an old daemon that never sent \`engine\` at all)
  // keeps today's cosine-calibrated DEFAULT_RECALL_FLOORS untouched.
  const floorOpts = engine === 'hybrid' ? { floors: { ru: HOOK_SCORE_FLOOR, en: HOOK_SCORE_FLOOR } } : {};
  const selection = policy.selectHookHits(prompt, hits, floorOpts);
  // lesson-quarantine AM-2: an excluded hypothesis is logged, never a silent context shrink.
  if (typeof selection.quarantinedExcluded === 'number' && selection.quarantinedExcluded > 0) {
    try {
      fs.appendFileSync(
        path.join(PROJECT, '.dz', 'sessions.jsonl'),
        JSON.stringify({ event: 'quarantine-excluded', ts: new Date().toISOString(), count: selection.quarantinedExcluded }) + '\\n',
      );
    } catch { /* best-effort */ }
  }
  const context = policy.renderHookContext(selection);
  // The debt directive is PREPENDED so it is the first thing the model reads (before other work).
  const combined = debt === '' ? context : context === '' ? debt : \`\${debt}\\n\${context}\`;
  if (combined === '') return; // nothing cleared the floor — the whole point
  emitContext(combined);

  if (context !== '') {
    const usage = await loadUsagePolicy();
    const chain = await loadChainPolicy();
    recordUsage(selection.hits, usage, prompt, chain);
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
`;
}

/** `setTimeout`'s delay argument is a 32-bit signed int in Node — see {@link resolveIdleMs}. */
export const IDLE_MS_INT32_MAX = 2_147_483_647;

/** Result of resolving a raw `DZ_EMBED_IDLE_MS` value into the daemon's actual idle-exit timer. */
export interface ResolvedIdleMs {
  /** `null` ⇒ the idle exit is disabled outright (0/NaN/negative). Otherwise the clamped ms value. */
  readonly value: number | null;
  /** True ⇒ `value` was clamped down from a raw value above {@link IDLE_MS_INT32_MAX}. */
  readonly clamped: boolean;
}

/**
 * Pure mirror of the `IDLE_MS` resolution inlined into {@link embedDaemonSource}'s generated body
 * (AM-10, dz-harness-hub issue #10 defect 7). Extracted (fix round 1, review Codex C, LOW finding)
 * so the clamp/disable rule is unit-testable directly — the review noted the only prior proof was a
 * LIVE process observed via its first stderr log line, which shows the log fired but not that the
 * underlying arithmetic is right for every input class.
 *
 * A template string cannot `import` this function into the daemon's own runtime (it is generated
 * text, not compiled code), so {@link embedDaemonSource} keeps its OWN copy of the same three rules —
 * `apply-leg-twins.test.ts` pins the generated body to the same `IDLE_MS_INT32_MAX` constant this
 * module exports, so the two cannot drift apart silently.
 */
export function resolveIdleMs(raw: number): ResolvedIdleMs {
  if (!Number.isFinite(raw) || raw <= 0) return { value: null, clamped: false };
  if (raw > IDLE_MS_INT32_MAX) return { value: IDLE_MS_INT32_MAX, clamped: true };
  return { value: raw, clamped: false };
}

/**
 * Generate `.claude/helpers/dz-embed-daemon.mjs`. Behaviourally identical to the pre-existing
 * hand-committed hub file except for: the version stamp (new, line 2), `resolveDeps()`, which
 * tries `@huggingface/transformers` before falling back to `@xenova/transformers` — AM-3,
 * dz-harness-hub issue #10 defect 3: `agentdb >= 3.0.0-alpha` depends on the former, and an older
 * agentdb install still carries the latter, so probing only one name silently starved the daemon
 * on either side of that agentdb version boundary — and (feature `hook-recall-hybrid-parity`,
 * ADR-001 D1) the `op: recall` handler, which now tries core's `recallHybrid` under a time budget
 * before falling back to the brute-force cosine below.
 *
 * `coreDistDir` (new parameter, ADR-001 D1) is baked in exactly like {@link recallHookSource}'s own
 * parameter of the same name — the FIRST resolve candidate for `loadCoreModule`. `null` (the
 * default, and what every existing zero-arg call site gets) is the same PORTABLE marker
 * `recallHookSource(null)` uses: `loadCoreModule` falls through to the project-relative fallback
 * candidates, resolved from `DZ_PROJECT_ROOT`/`cwd()` at daemon RUNTIME, which is correct in any
 * clone and for any consumer whose `harness-core` install is reachable under its own project tree.
 */
export function embedDaemonSource(coreDistDir: string | null = null): string {
  return `#!/usr/bin/env node
// dz-apply-leg-version: ${APPLY_LEG_VERSION}
/**
 * Resident embedding + recall daemon for the \`dz recall\` APPLY leg.
 *
 * WHY IT EXISTS (measured, not assumed): loading the multilingual embedder costs ~1478 ms, while a
 * warm embed of a query costs 6–8 ms. A \`UserPromptSubmit\` hook is a fresh process every turn, so
 * without a resident model the hook would add ~2 s to every prompt and be switched off within a day.
 * With this daemon the hook is a socket round-trip.
 *
 * ORPHAN SAFETY — the load-bearing property. Today (2026-07-09) two orphaned agentdb MCP servers,
 * 19 h and 7 h old, were found rewriting a SQLite file whole-file several times per second and
 * corrupting concurrent readers. A resident process that outlives its purpose is a liability. So:
 *
 *   - it EXITS after \`DZ_EMBED_IDLE_MS\` (default 30 min) with no request;
 *   - it refuses to start if a live daemon already owns the socket (no duplicate herd);
 *   - it removes a stale socket left by a crashed predecessor;
 *   - it opens the pattern store READ-ONLY — it can never be the writer that tears a file;
 *   - it exits on SIGINT/SIGTERM/SIGHUP and unlinks its socket.
 *
 * PROTOCOL — newline-delimited JSON over a unix socket:
 *   → {"op":"recall","prompt":"…","limit":8}   ← {"hits":[{"dzId","pattern","score","domain"}],"engine":"hybrid"|"cosine-fallback","reason"?}
 *   → {"op":"ping"}                              ← {"ok":true,"model":"…","uptimeMs":N}
 *   → {"op":"stop"}                              ← {"ok":true}   (then exits)
 *
 * ADR-001 (feature \`hook-recall-hybrid-parity\`): \`op: recall\` first tries core's \`recallHybrid\`
 * (same engine \`dz recall\` uses) under \`HOOK_RECALL_BUDGET_MS\` (default 500 ms, < the hook's own
 * 800 ms timeout); on budget overrun, engine error, or no resolvable core module it falls back to
 * the brute-force cosine below. \`score\` on \`engine:"hybrid"\` is the RAW core RRF score, UNCHANGED
 * (AM-5, fix round 1) — the exact same number \`dz recall --json\` reports as \`relevance\`, never
 * locally re-normalized; on \`engine:"cosine-fallback"\` it is COSINE RELEVANCE in [0,1] as before —
 * two DIFFERENT scales, never the teaching reward either way. The caller applies the right floor
 * for whichever scale \`engine\` names.
 */

import { createServer } from 'node:net';
import { existsSync, unlinkSync, readFileSync, mkdirSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const log = (...a) => console.error('[dz-embed]', ...a);

/** Never let a diagnostic reach stdout — the hook that spawns us may be parsing it. */
console.log = (...a) => console.error(...a);

// FR-4 (ADR-001 D1, apply-leg-install-root): the SAME install-root-first order the hook uses (see
// recallHookSource's own PROJECT comment) — DZ_PROJECT_ROOT stays the TOP override for the daemon
// (a caller that explicitly names a project root always wins), then INSTALL_ROOT (this file's own
// location, when it owns a \`.dz/\`), then cwd.
const INSTALL_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT = process.env['DZ_PROJECT_ROOT'] ?? (existsSync(join(INSTALL_ROOT, '.dz')) ? INSTALL_ROOT : process.cwd());

// ADR-001 (hook-recall-hybrid-parity, D1): the SAME candidate-list resolution the hook uses for its
// own policy modules — the baked \`coreDistDir\` first (a real install's absolute dist path), then
// project-relative fallbacks resolved from PROJECT at RUNTIME. \`null\` (the hub's own portable
// marker, matching \`recallHookSource(null)\`) skips straight to the fallbacks. Loaded ONCE and
// memoized (\`coreModulePromise\`) — a fresh \`import()\` per recall would defeat FR-3's "opened once".
const CORE_DIST_DIR = ${coreDistDir === null ? 'null' : JSON.stringify(coreDistDir)};
let coreModulePromise;
function loadCoreModule() {
  if (coreModulePromise !== undefined) return coreModulePromise;
  coreModulePromise = (async () => {
    const candidates = [
      ...(CORE_DIST_DIR ? [join(CORE_DIST_DIR, 'index.js')] : []),
      join(PROJECT, 'node_modules', '@dzhechkov', 'harness-core', 'dist', 'index.js'),
      join(PROJECT, 'packages', '@dzhechkov', 'harness-core', 'dist', 'index.js'),
    ];
    for (const c of candidates) {
      if (!existsSync(c)) continue;
      try {
        const mod = await import(pathToFileURL(c).href);
        if (typeof mod.recallHybrid === 'function' && typeof mod.patternRecordId === 'function') return mod;
      } catch {
        /* try the next candidate */
      }
    }
    return undefined;
  })();
  return coreModulePromise;
}

// FR-2 (hook-recall-hybrid-parity): the hybrid leg is time-boxed so a slow/cold engine can never make ONE prompt pay the full
// cost — it falls back to the warm cosine below instead. 500 ms leaves the hook's own 800 ms
// timeout (recallHookSource's TIMEOUT_MS) headroom for the socket round-trip itself.
// Measured 2026-09-14 (nfr1-measure.mjs, real 743-pattern store, warm-up on, n=100 x2): hybrid p50 60-65 ms,
// p95 100-180 ms, max 374 ms; 500 ms ≈ 3x p95 and stays under the hook's own 800 ms client timeout.
const HOOK_RECALL_BUDGET_MS = Number(process.env['HOOK_RECALL_BUDGET_MS'] || 500);
// Codex round-2 (2026-09-14): a hybrid attempt that LOST the race keeps running in the background —
// this cap keeps a burst of slow requests from stacking unbounded engine work; past it, requests answer
// with cosine at once, honestly labelled. Real cancellation needs worker isolation (backlog 14c1316b).
const HYBRID_MAX_IN_FLIGHT = (() => {
  const raw = Number(process.env['HOOK_HYBRID_MAX_IN_FLIGHT'] || 2);
  // Codex round-3: NaN/Infinity/0/negative must not silently disable the cap — fall back to 2.
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 2;
})();
let hybridInFlight = 0;
// Test-only fault injection (AC-2): a positive value delays the hybrid leg so the budget can be
// PROVEN to fire without a real slow engine. Absent/0 in every real deployment.
const DZ_EMBED_HYBRID_DELAY_MS = Number(process.env['DZ_EMBED_HYBRID_DELAY_MS'] || 0);
// AM-5 (fix round 1): the daemon used to re-normalize recallHybrid's raw RRF score into [0,1] with
// its OWN copy of vector-tier.ts's RRF_K constant — two numbers that could silently drift apart
// (this file is standalone generated text and cannot \`import\` the compiled core constant), AND a
// scale \`dz recall --json\`'s own \`relevance\` field (cli.ts: \`relevance: … h.score …\`) never
// applies — so the hook's floor and the CLI's floor were never comparable numbers even though both
// ultimately came from the same recallHybrid() call. Fixed: the daemon now reports \`h.score\`
// UNCHANGED — the exact raw core score \`dz recall --json\` already reports as \`relevance\` — so a
// floor calibrated against one is valid against the other (AM-4's parity test asserts the two are
// literally equal, not merely proportional).

// embed-socket-short-path (FR-1): a unix socket path has a hard platform limit on \`sun_path\`
// (Linux 108 bytes incl. NUL, macOS 104) — a deeply nested project's \`.dz/embed.sock\` can exceed
// it, and \`listen()\` then fails while every OTHER part of the daemon looks healthy. This mirrors
// {@link resolveEmbedSocketPath} in \`embed-socket-path.ts\` byte-for-byte (this file is generated
// TEXT, standalone, and cannot \`import\` a compiled core module — apply-leg-twins.test.ts pins the
// two copies to the same behavior).
const EMBED_SOCKET_PATH_BYTES_LIMIT = 100;
function resolveEmbedSocketPath(projectRoot, env) {
  const fromEnv = env['DZ_EMBED_SOCKET'];
  if (typeof fromEnv === 'string' && fromEnv !== '') return { path: fromEnv, reason: 'env' };
  const projectPath = join(projectRoot, '.dz', 'embed.sock');
  if (Buffer.byteLength(projectPath, 'utf8') <= EMBED_SOCKET_PATH_BYTES_LIMIT) return { path: projectPath, reason: 'project' };
  const hash = createHash('sha1').update(projectRoot).digest('hex').slice(0, 12);
  const uid = String(process.getuid?.() ?? 'u');
  const shortPath = join(tmpdir(), \`dz-\${uid}\`, \`embed-\${hash}.sock\`);
  const tooLong = Buffer.byteLength(shortPath, 'utf8') > EMBED_SOCKET_PATH_BYTES_LIMIT;
  return tooLong ? { path: shortPath, reason: 'tmpdir-short', tooLong: true } : { path: shortPath, reason: 'tmpdir-short' };
}
const { path: SOCKET, reason: SOCKET_REASON, tooLong: SOCKET_TOO_LONG } = resolveEmbedSocketPath(PROJECT, process.env);
const SOCKET_POINTER = join(PROJECT, '.dz', 'embed.sock.path');
// AM-10 (issue #10 defect 7): a setTimeout delay is a 32-bit signed int in Node — anything
// above 2_147_483_647 ms silently becomes ~1ms (a "30 days" idle setting exited in ~1 second,
// MEASURED). 0/NaN/negative disables the idle exit outright rather than firing immediately.
const IDLE_MS_INT32_MAX = 2_147_483_647;
const IDLE_MS_RAW = Number(process.env['DZ_EMBED_IDLE_MS'] ?? 30 * 60 * 1000);
let IDLE_MS;
if (!Number.isFinite(IDLE_MS_RAW) || IDLE_MS_RAW <= 0) {
  IDLE_MS = null;
  log('idle exit disabled (DZ_EMBED_IDLE_MS=' + IDLE_MS_RAW + ')');
} else if (IDLE_MS_RAW > IDLE_MS_INT32_MAX) {
  IDLE_MS = IDLE_MS_INT32_MAX;
  log('idle clamp: ' + IDLE_MS_RAW + ' -> ' + IDLE_MS_INT32_MAX + ' ms');
} else {
  IDLE_MS = IDLE_MS_RAW;
}
const MODEL_FALLBACK = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

function configuredModel() {
  try {
    const cfg = JSON.parse(readFileSync(join(PROJECT, '.dz', 'config.json'), 'utf-8'));
    const m = cfg?.memory?.agentdb?.embeddingModel ?? cfg?.memory?.embed?.model;
    return typeof m === 'string' && m.trim() !== '' ? m.trim() : MODEL_FALLBACK;
  } catch {
    return MODEL_FALLBACK;
  }
}

/** Is a daemon already listening? Resolves true only on a successful connect. */
function socketAlive(path) {
  return new Promise((resolve) => {
    if (!existsSync(path)) return resolve(false);
    const c = connect(path);
    const done = (v) => {
      c.destroy();
      resolve(v);
    };
    c.on('connect', () => done(true));
    c.on('error', () => done(false));
    setTimeout(() => done(false), 500);
  });
}

// ADR-001 (embed-daemon-memory, D1/T3): better-sqlite3 is resolved INDEPENDENTLY of the embedder now
// — the cosine-fallback leg always needs it to read the mirror, regardless of whether the embedder
// itself comes from core (embedder=core-shared) or this daemon's own pipeline (embedder=own-fallback).
// Splitting it out of the old resolveDeps() lets the daemon start on core-shared alone when only
// better-sqlite3 (not transformers) is locally resolvable.
function resolveDatabase() {
  const req = createRequire(join(PROJECT, 'package.json'));
  return req('better-sqlite3');
}

// own-fallback ONLY (ADR-001 D1): resolves the transformers module for the daemon's OWN pipeline,
// built only when core has no resolveAgentdbEmbedder to share (no core module, or it errored).
function resolveDeps() {
  const req = createRequire(join(PROJECT, 'package.json'));
  // agentdb >= 3.0.0-alpha depends on '@huggingface/transformers' (the '@xenova/transformers'
  // fork it supersedes); older agentdb releases still pull '@xenova/transformers'. Neither is a
  // DIRECT dependency of the project, so try each candidate via the project's own require AND via
  // agentdb's own declared (possibly hoisted-elsewhere) require before giving up
  // (dz-harness-hub issue #10 defect 3).
  const candidates = ['@huggingface/transformers', '@xenova/transformers'];
  let transformers;
  let lastErr;
  for (const name of candidates) {
    try {
      transformers = req.resolve(name);
      break;
    } catch (err) {
      lastErr = err;
      try {
        transformers = createRequire(req.resolve('agentdb/package.json')).resolve(name);
        break;
      } catch (err2) {
        lastErr = err2;
      }
    }
  }
  if (transformers === undefined) {
    throw new Error('neither @huggingface/transformers nor @xenova/transformers could be resolved (' + String((lastErr && lastErr.message) || lastErr) + ')');
  }
  return { transformers };
}

const cos = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * (b[i] ?? 0);
  return s;
};

function dzIdOf(metadataJson) {
  try {
    const meta = JSON.parse(String(metadataJson || '{}'));
    const id = meta?.dzId ?? meta?.dreamId;
    return typeof id === 'string' && id.trim() !== '' ? id.trim() : undefined;
  } catch {
    return undefined;
  }
}

// lesson-quarantine: an unproven lesson is flagged so the hook POLICY can exclude it from
// auto-inject (the daemon only reports; the decision lives in selectHookHits).
function quarantinedOf(metadataJson) {
  try {
    return JSON.parse(String(metadataJson || '{}'))?.qStatus === 'quarantined';
  } catch {
    return false;
  }
}

// AM-3 (fix round 1, apply-leg-never-silent): the vector mirror's own row carries no domain column
// (see loadPatterns' own note below) — domain lives in the SAME metadata JSON dzIdOf/quarantinedOf
// already parse, so this is the ONE extra field read off a column that's already in hand.
function domainOf(metadataJson) {
  try {
    const d = JSON.parse(String(metadataJson || '{}'))?.domain;
    return typeof d === 'string' && d !== '' ? d : undefined;
  } catch {
    return undefined;
  }
}

// AM-3: the ONE domain a genuine session must never see — probeApplyLeg's own beacon marker
// (apply-leg.ts's PROBE_BEACON_DOMAIN, inlined here as text for the same reason every other shared
// constant in this generated file is: a template string cannot import a compiled module).
const PROBE_BEACON_DOMAIN = 'apply-leg-probe';
/** Strip probe-domain hits from a real (non-probe) answer; a probe request passes through untouched. */
function filterProbeHits(hits, probe) {
  return probe ? hits : hits.filter((h) => h.domain !== PROBE_BEACON_DOMAIN);
}

async function main() {
  if (await socketAlive(SOCKET)) {
    log('a daemon already owns', SOCKET, '— exiting');
    process.exit(0);
  }
  if (existsSync(SOCKET)) {
    try {
      unlinkSync(SOCKET); // stale socket from a crashed predecessor
    } catch {
      /* the bind below will fail loudly enough */
    }
  }

  const started = Date.now();
  const model = configuredModel();

  // better-sqlite3 is required regardless of which embedder answers a request (ADR-001, T3) — the
  // cosine-fallback leg always reads the mirror through it.
  let Database;
  try {
    Database = resolveDatabase();
  } catch (err) {
    log('deps unavailable — not starting:', err?.message ?? err);
    process.exit(0); // never a hard failure: the hook degrades to silence
  }

  // ADR-001 D1 (embed-daemon-memory): the daemon SHARES core's single per-process embedder and
  // builds a private pipeline only when core cannot hand one over AT ALL — no core module, or a core
  // build too old to export \`resolveAgentdbEmbedder\` (F2, fix round 1, Codex #3). A STARTUP init
  // FAILURE (core exists, has the export, but the call itself errored — offline model cache, a
  // corrupted manifest) is NEVER treated as "core unavailable": own-fallback must not be built in
  // that case, because a LATER hybrid call could succeed and stand up a SECOND, independent pipeline
  // in the same process — the exact "two live embedders" defect the review named. Instead
  // \`embedderSource\` STAYS \`'core-shared'\` and \`embed\` re-resolves \`core.resolveAgentdbEmbedder\`
  // on EVERY call: core's own per-process cache (agentdb-index.ts) makes a repeat call after SUCCESS
  // effectively free, and evicts its own entry on failure — so a transient startup failure can heal
  // on a later request without this daemon ever building an embedder of its own.
  //
  // The shared embedder is still PROBED EAGERLY, before \`ready\`, for the same reason the own
  // pipeline always was: the cosine-fallback leg must answer inside the hook budget on the FIRST
  // request too (parity AC-2: hybrid delayed by 3000 ms, reply < 2000 ms). MEASURED 2026-09-16
  // (change_manifest.md, deviation B): a LAZY resolve put the cold pipeline init (2000-3600 ms) on
  // the first fallback reply — 4/5 runs at 2063-2146 ms. The probe's OUTCOME only decides the
  // \`ready\`-log wording now (F2) — it never gates \`embedderSource\` or builds an own-fallback
  // pipeline. The starved-budget parity test that used to lean on a cold engine now injects
  // DZ_EMBED_HYBRID_DELAY_MS itself, so its premise holds by construction, not by cold timing.
  let embed;
  let embedderSource;
  let embedderReadyDetail = '';
  let ownFallbackDtypeLabel;
  const startupCore = await loadCoreModule();
  const coreHasSharedEmbedder = startupCore !== undefined && typeof startupCore.resolveAgentdbEmbedder === 'function';
  if (coreHasSharedEmbedder) {
    embedderSource = 'core-shared';
    embed = async (text) => {
      const shared = await startupCore.resolveAgentdbEmbedder(PROJECT);
      if (!shared || typeof shared.embed !== 'function' || 'error' in shared) {
        throw new Error((shared && shared.error) || 'resolveAgentdbEmbedder returned no embed()');
      }
      return shared.embed(text);
    };
    let startupProbe;
    try {
      startupProbe = await startupCore.resolveAgentdbEmbedder(PROJECT);
    } catch (err) {
      startupProbe = { error: err?.message ?? String(err) };
    }
    if (!startupProbe || typeof startupProbe.embed !== 'function' || 'error' in startupProbe) {
      const msg = (startupProbe && startupProbe.error) || 'resolveAgentdbEmbedder returned no embed()';
      log('core-shared embedder init failed at startup, will retry per request:', msg);
      embedderReadyDetail = \` (init failed: \${msg}, will retry per request)\`;
    }
  }
  if (embed === undefined) {
    // own-fallback: ONLY when core has no resolveAgentdbEmbedder to share at all (no core module, or
    // a fake/old core, as in test fixtures) — never as a reaction to a startup init error (above).
    let deps;
    try {
      deps = resolveDeps();
    } catch (err) {
      log('deps unavailable — not starting:', err?.message ?? err);
      process.exit(0); // never a hard failure: the hook degrades to silence
    }
    // F1 (fix round 1, Codex #1b): the daemon has no core to ask, so it reads the STORE's own dtype
    // manifest directly — an own pipeline built blindly at fp32 would silently compare vectors from
    // two different spaces against a q8 store. Absent manifest = fp32 (legacy — matches every store
    // predating this feature, same discipline as embedding-config.ts's readEmbedManifest). A manifest
    // that IS present but names neither known dtype is NEVER folded into that same fp32 case — this
    // daemon fails loudly for that request (embed() throws below, caught honestly by answerRecall)
    // rather than silently mixing dtype spaces.
    const manifestPath = join(PROJECT, '.dz', 'agentdb.db.embed-manifest.json');
    let ownDtype = 'fp32';
    let ownDtypeError;
    let manifestIsFile = false;
    try {
      manifestIsFile = statSync(manifestPath).isFile(); // a non-file at the sidecar path is "absent", as in core
    } catch {
      manifestIsFile = false;
    }
    if (manifestIsFile) {
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))?.dtype;
        if (raw === 'fp32' || raw === 'q8') {
          ownDtype = raw;
        } else if (raw !== undefined) {
          ownDtypeError = String(raw);
        }
      } catch (err) {
        // Lead delta after Codex r2 (HIGH): a manifest that EXISTS but cannot be parsed is NOT
        // "absent" — refusing beats guessing fp32 over a q8 store (same rule as core's readError).
        ownDtypeError = 'unreadable manifest: ' + (err?.message ?? String(err));
      }
    }
    embedderSource = 'own-fallback';
    if (ownDtypeError !== undefined) {
      log('manifest dtype unknown:', ownDtypeError);
      ownFallbackDtypeLabel = 'error';
      const dtypeErrMsg = \`manifest dtype unknown: \${ownDtypeError}\`;
      embed = async () => { throw new Error(dtypeErrMsg); };
    } else {
      ownFallbackDtypeLabel = ownDtype;
      const { pipeline } = await import(deps.transformers);
      const extractor = await pipeline('feature-extraction', model, ownDtype === 'q8' ? { dtype: 'q8' } : {});
      embed = async (text) => Array.from((await extractor(text, { pooling: 'mean', normalize: true })).data);
    }
  }

  // AM-1 (fix round 1): warm resolveAgentdbEmbedder — cached PER PROCESS since db1521ba (cold
  // ~2-3.6 s, warm ~1 ms, MEASURED, see the manifest's T8/AM-1 discussion) — OFF the request path,
  // so the first REAL \`op: recall\` is not the one that pays the cold init. Fired fire-and-forget as
  // early as main() can (moved up from right-before-listen, T3/embed-daemon-memory: every ms of
  // extra head start matters against a multi-second cold cost — see change_manifest.md), never
  // awaited by startup: this is a best-effort head start, not a guarantee — a request landing in
  // the window before it completes still pays the (possibly-partial, since it JOINS the same
  // in-flight resolveAgentdbEmbedder promise, D1) cold cost, and a warm-up failure (no core module,
  // engine error) is silently swallowed — never-block applies to startup exactly as it does to a
  // request. Measured: the slowest cold resolveAgentdbEmbedder init observed in this environment
  // was 3653 ms (T8 log, 2026-09-14) — 10 s leaves a wide margin without risking an unbounded
  // warm-up hang.
  const WARMUP_TIMEOUT_MS = 10_000;
  async function warmUpHybridEngine() {
    const core = await loadCoreModule();
    if (core === undefined) return;
    const guard = new Promise((resolve) => {
      const t = setTimeout(resolve, WARMUP_TIMEOUT_MS);
      t.unref?.();
    });
    // An empty-string query still exercises the FULL semantic leg (embed + engine.search), which is
    // exactly what needs warming; recallHybrid degrades any error inside it honestly, so nothing
    // here needs its own try/catch beyond the outer .catch(() => {}) at the call site below.
    await Promise.race([core.recallHybrid(PROJECT, '', { limit: 1, mode: 'hook', deferExposures: true }), guard]);
  }
  // Fire-and-forget, never awaited — main() proceeds immediately regardless of warm-up outcome.
  // F2 (fix round 1, Codex #3): warm-up specifically primes the HYBRID leg's own use of
  // resolveAgentdbEmbedder — pointless when this daemon has no core embedder to share (own-fallback
  // has no core module, or a fake/old core in tests) AND risks standing up a SECOND, unrelated
  // pipeline via whatever recallHybrid does internally in that case. Skipped entirely in own-fallback.
  if (embedderSource === 'core-shared') {
    warmUpHybridEngine().catch(() => {});
  }

  // READ-ONLY. This process must never be the writer that tears the file for a concurrent reader.
  const dbPath = join(PROJECT, '.dz', 'agentdb.db');
  const DZ_TASK_TYPES = ['dz-teach', 'dz-learning'];

  function loadPatterns() {
    if (!existsSync(dbPath)) return [];
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const ph = DZ_TASK_TYPES.map(() => '?').join(',');
      // NOTE: the vector mirror carries no \`domain\` — that column lives in the lexical store. An
      // earlier draft read \`tags[0]\` and cheerfully labelled every hit \`dz-backfill\`, which is the
      // SOURCE marker, not a domain. Emitting a wrong label is worse than emitting none.
      const rows = db
        .prepare(
          \`SELECT p.approach AS pattern, p.metadata AS metadata, e.embedding AS embedding
             FROM reasoning_patterns p JOIN pattern_embeddings e ON e.pattern_id = p.id
            WHERE p.task_type IN (\${ph})\`,
        )
        .all(...DZ_TASK_TYPES);
      return rows.map((r) => {
        const buf = r.embedding;
        const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        // AM-3: domain rides along so answerRecall can exclude the probe's own beacon from a real
        // session's cosine-fallback answer — the SAME metadata column dzIdOf/quarantinedOf already read.
        return { dzId: dzIdOf(r.metadata), pattern: r.pattern, vec, quarantined: quarantinedOf(r.metadata), domain: domainOf(r.metadata) };
      });
    } finally {
      db.close();
    }
  }

  let patterns = loadPatterns();
  let patternsAt = Date.now();

  // ADR-001 (hook-recall-hybrid-parity, D1): try core's recallHybrid FIRST, budget-bounded.
  // AM-2 (fix round 1, wall clock from request receipt): the budget timer is armed BEFORE
  // \`loadCoreModule()\` runs, not after it resolves — the FIRST call's dynamic \`import()\` cost used
  // to be spent OUTSIDE the race, so a slow/cold module resolution could add its own latency on top
  // of the full \`HOOK_RECALL_BUDGET_MS\` window instead of eating into it.
  // NAMED LIMIT (AM-2): \`Promise.race\` cannot PREEMPT synchronous work — if \`core.recallHybrid\`
  // (or anything it calls) blocks the event loop synchronously, this race does not return until
  // that work finishes, budget or not; Node has no cooperative-preemption primitive for that. The
  // budget only bounds work that yields the event loop somewhere (every real I/O/await in
  // recallHybrid does). The hook's OWN client-side \`TIMEOUT_MS\` (recallHookSource, 800 ms) is the
  // actual backstop against a synchronously-blocked daemon: it times out the SOCKET, not the
  // daemon's internal race, so the hook always returns promptly even if this promise never does.
  //
  // \`hybridRecall\`'s own promise is left running past a timeout loss (never awaited a second time)
  // — its \`.catch\` below only silences a LATE rejection so a slow, eventually-failing engine call
  // can never become an unhandled-rejection crash for this long-lived process.
  async function hybridRecall(prompt, limit, probe) {
    if (hybridInFlight >= HYBRID_MAX_IN_FLIGHT) {
      return { ok: false, reason: \`hybrid saturated (\${hybridInFlight} attempt(s) still in flight, cap \${HYBRID_MAX_IN_FLIGHT})\` };
    }
    const TIMED_OUT = Symbol('timed-out');
    let timer;
    const budget = new Promise((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), HOOK_RECALL_BUDGET_MS);
      timer.unref?.();
    });
    hybridInFlight += 1;
    const attempt = (async () => {
      const core = await loadCoreModule();
      if (core === undefined) return { unavailable: true };
      if (DZ_EMBED_HYBRID_DELAY_MS > 0) await new Promise((r) => setTimeout(r, DZ_EMBED_HYBRID_DELAY_MS));
      const result = await core.recallHybrid(PROJECT, prompt, { limit, mode: 'hook', deferExposures: true });
      return { unavailable: false, result, core };
    })();
    // the in-flight count follows the UNDERLYING attempt, not the race: a timed-out attempt still
    // occupies its slot until it settles (that is the whole point of the cap)
    attempt.then(() => { hybridInFlight -= 1; }, () => { hybridInFlight -= 1; });
    attempt.catch(() => {}); // swallow a rejection that arrives AFTER the budget already won the race
    try {
      const raced = await Promise.race([attempt, budget]);
      clearTimeout(timer);
      if (raced === TIMED_OUT) return { ok: false, reason: \`budget exceeded (\${HOOK_RECALL_BUDGET_MS} ms)\` };
      if (raced.unavailable) return { ok: false, reason: 'core module unavailable' };
      // AM-3 (fix round 1): everything past the race — reading result.hits, a hit missing its
      // required fields, patternRecordId() throwing on a malformed pattern — is now INSIDE this
      // try, so any such failure falls back to cosine with an honest \`reason\` instead of reaching
      // the socket handler's outer catch, which used to turn it into a bare protocol {error} reply
      // (never engine:'cosine-fallback') — the exact defect this amendment fixes.
      const { result, core } = raced;
      const hits = (result.hits || []).map((h) => ({
        dzId: core.patternRecordId(h.pattern),
        pattern: h.pattern.pattern,
        score: h.score, // AM-5: raw core score, unchanged — the same number \`dz recall --json\` reports as \`relevance\`
        domain: h.pattern.domain,
        ...(h.quarantined ? { quarantined: true } : {}),
      }));
      // AM-3 (fix round 1): filter BEFORE slicing to \`limit\` — filtering after would let a probe
      // beacon that happened to rank in the top \`limit\` silently crowd out a real hit for a real
      // (non-probe) caller instead of simply being excluded from consideration.
      return { ok: true, hits: filterProbeHits(hits, probe).slice(0, limit) };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, reason: \`recallHybrid failed: \${err?.message ?? err}\` };
    }
  }

  /** \`op: recall\`'s whole answer: hybrid first (budget-bounded), cosine fallback on ANY failure —
   * always honestly labelled with \`engine\`/\`reason\` (FR-2/FR-6). */
  async function answerRecall(prompt, limitRaw, probe) {
    const limit = Math.min(Number(limitRaw) || 8, 32);
    if (prompt.trim() === '') return { hits: [], engine: 'none', reason: 'empty prompt' }; // Codex round-2: every reply carries \`engine\`
    const hybrid = await hybridRecall(prompt, limit, probe);
    if (hybrid.ok) return { hits: hybrid.hits, engine: 'hybrid' };
    // Reload the cosine mirror if it changed on disk (a \`dz teach\` between turns) — the SAME
    // staleness window as before this feature, just checked only when actually falling back.
    if (Date.now() - patternsAt > 5000) {
      try {
        patterns = loadPatterns();
      } catch {
        /* keep the previous snapshot */
      }
      patternsAt = Date.now();
    }
    if (patterns.length === 0) return { hits: [], engine: 'cosine-fallback', reason: hybrid.reason };
    // F1/F2 (fix round 1): \`embed()\` can now THROW honestly (own-fallback with an unrecognized
    // manifest dtype, F1; core-shared re-resolution failing on this exact request, F2) — caught here
    // so it degrades to the SAME honest cosine-fallback shape every other failure gets, never a bare
    // protocol {error} reply reaching the socket handler's outer catch (the AM-3 defect class).
    let qv;
    try {
      qv = await embed(prompt);
    } catch (err) {
      return { hits: [], engine: 'cosine-fallback', reason: \`embedder unavailable: \${err?.message ?? err}\` };
    }
    const scored = patterns.map((p) => ({ dzId: p.dzId, pattern: p.pattern, score: cos(qv, p.vec), domain: p.domain, ...(p.quarantined ? { quarantined: true } : {}) }));
    scored.sort((a, b) => b.score - a.score);
    // AM-3: same domain exclusion as the hybrid leg, applied before slicing for the same reason.
    return { hits: filterProbeHits(scored, probe).slice(0, limit), engine: 'cosine-fallback', reason: hybrid.reason };
  }

  let idleTimer;
  let lastActivityAt = Date.now();
  const touch = () => {
    lastActivityAt = Date.now();
    clearTimeout(idleTimer);
    if (IDLE_MS === null) return; // idle exit disabled (AM-10)
    idleTimer = setTimeout(() => {
      // Prints the ACTUAL elapsed time, not the configured IDLE_MS — the two used to be treated as
      // interchangeable, but a clamped or reconfigured value made the log claim a wait that never
      // happened (AM-10).
      log(\`idle \${Date.now() - lastActivityAt} ms — exiting (orphan safety)\`);
      shutdown(0);
    }, IDLE_MS);
    idleTimer.unref?.();
  };

  const server = createServer((sock) => {
    touch();
    let buf = '';
    sock.on('data', async (chunk) => {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let reply;
        try {
          const msg = JSON.parse(line);
          if (msg.op === 'ping') {
            reply = { ok: true, model, uptimeMs: Date.now() - started, patterns: patterns.length };
          } else if (msg.op === 'stop') {
            sock.write(JSON.stringify({ ok: true }) + '\\n');
            return shutdown(0);
          } else if (msg.op === 'recall') {
            const prompt = typeof msg.prompt === 'string' ? msg.prompt : '';
            reply = await answerRecall(prompt, msg.limit, msg.probe === true);
          } else {
            reply = { error: \`unknown op \${String(msg.op)}\` };
          }
        } catch (err) {
          reply = { error: err?.message ?? String(err) };
        }
        try {
          sock.write(JSON.stringify(reply) + '\\n');
        } catch {
          /* client vanished */
        }
      }
    });
    sock.on('error', () => sock.destroy());
  });

  function shutdown(code) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    try {
      if (existsSync(SOCKET)) unlinkSync(SOCKET);
    } catch {
      /* ignore */
    }
    try {
      // Only OUR pointer is removed — one that already names another daemon's socket stays.
      if (SOCKET_REASON === 'tmpdir-short' && existsSync(SOCKET_POINTER) && readFileSync(SOCKET_POINTER, 'utf-8').trim() === SOCKET) unlinkSync(SOCKET_POINTER);
    } catch {
      /* ignore */
    }
    process.exit(code);
  }

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => shutdown(0));

  // FR-3 ("absence of a receipt is not success"): \`ready\` is printed ONLY after \`listen\`'s callback
  // AND a fresh \`existsSync(SOCKET)\` both confirm the socket file is actually on disk — a caller
  // that greps stderr for "ready" must never see it for a socket that silently failed to bind.
  function bindFailed(detail) {
    log(\`bind failed: \${detail} (path \${Buffer.byteLength(SOCKET, 'utf8')} bytes)\`);
    process.exit(3);
  }

  // A fresh project's SOCKET directory (\`.dz/\`, or a caller-injected DZ_EMBED_SOCKET's own parent)
  // may not exist yet — \`dz setup\` usually creates \`.dz/\` before this daemon ever runs, but a
  // missing parent must not surface as an opaque platform EACCES/ENOENT when a plain mkdir fixes it.
  if (SOCKET_TOO_LONG) bindFailed('even the tmpdir-short fallback exceeds the unix socket path limit — set DZ_EMBED_SOCKET to a short path');
  try {
    // Lead edit after Codex review (finding 2): the private per-user directory is created 0700 and
    // verified — a socket in a world-writable tmpdir could be pre-bound or hijacked by a neighbour.
    mkdirSync(dirname(SOCKET), { recursive: true, mode: 0o700 });
    if (SOCKET_REASON === 'tmpdir-short') {
      const st = statSync(dirname(SOCKET));
      const ownUid = typeof process.getuid === 'function' ? process.getuid() : st.uid;
      if (st.uid !== ownUid || (st.mode & 0o077) !== 0) bindFailed(\`socket directory \${dirname(SOCKET)} is not private (uid \${st.uid}, mode \${(st.mode & 0o777).toString(8)})\`);
    }
  } catch (err) {
    if (SOCKET_REASON === 'tmpdir-short') bindFailed(\`cannot prepare socket directory: \${err?.message ?? err}\`);
    /* project branch: listen() below reports the real reason if the directory truly cannot be created */
  }

  server.listen(SOCKET, () => {
    if (!existsSync(SOCKET)) return bindFailed('socket file missing after listen');
    if (SOCKET_REASON === 'tmpdir-short') {
      // Lead edit after Codex review (finding 3): the pointer is published ATOMICALLY (tmp + rename)
      // and BEFORE \`ready\` — a reader never sees a half-written or missing pointer after \`ready\`;
      // a pointer that cannot be published is a bind failure, not a warning.
      try {
        mkdirSync(join(PROJECT, '.dz'), { recursive: true });
        const tmp = \`\${SOCKET_POINTER}.\${process.pid}.tmp\`;
        writeFileSync(tmp, SOCKET);
        renameSync(tmp, SOCKET_POINTER);
      } catch (err) {
        return bindFailed(\`could not publish socket pointer: \${err?.message ?? err}\`);
      }
    }
    // F1/F2 (fix round 1): own-fallback names ITS resolved dtype (\`dtype=<fp32|q8|error>\`, F1); a
    // core-shared daemon that failed its startup probe names that too, inline (\`(init failed: …,
    // will retry per request)\`, F2) — both make the honest state observable from \`ready\` alone.
    const embedderReadyLabel = embedderSource === 'own-fallback' ? \`\${embedderSource} dtype=\${ownFallbackDtypeLabel}\` : \`\${embedderSource}\${embedderReadyDetail}\`;
    log(\`ready: \${patterns.length} pattern vectors, model \${model}, socket \${SOCKET} embedder=\${embedderReadyLabel}\`);
    touch();
  });
  server.on('error', (err) => bindFailed(err?.message ?? String(err)));
}

main().catch((err) => {
  log('fatal:', err?.message ?? err);
  process.exit(0); // a dead daemon must never fail a session
});
`;
}

/** One Claude Code hook-registry entry in the matcher-group shape (no matcher — session/prompt events don't need one). */
export interface ApplyLegHookEntry {
  readonly hooks: readonly { readonly type: 'command'; readonly command: string }[];
}

/**
 * POSIX single-quote a value for safe interpolation into a shell command line: wraps it in `'`,
 * escaping every embedded `'` as the standard `'\''` sequence (close quote, literal escaped quote,
 * reopen quote). Single quotes disable EVERY shell expansion — `$`, backticks, `"`, another `'` —
 * unlike a bare `"..."` interpolation, which blocks only whitespace/globbing and still lets `$`/
 * backtick content run (AM-1, fix round 1, HIGH).
 */
function shellQuote(value: string): string {
  return `'${value.split(`'`).join(`'\\''`)}'`;
}

/**
 * The two hook-registry entries `runSetup` merges into `.claude/settings.json` (FR-1). Commands
 * match the hub's own `.claude/settings.json` verbatim (`grep`-diffed against it at authoring time):
 * the recall hook is invoked with a swallowed non-zero exit (`|| true`) so a broken hook body never
 * fails a prompt, and the embed daemon is spawned detached via `nohup` + a backgrounding `sh -c`
 * so `SessionStart` never waits on model load.
 *
 * `installRoot` (ADR-001 D2, feature `apply-leg-install-root`): when the caller (`dz setup`) knows
 * its own install root, the commands bake it in as an ABSOLUTE path — the deployed helper already
 * bakes an absolute `CORE_DIST_DIR`, so a `${CLAUDE_PROJECT_DIR:-.}`-relative command in
 * settings.json only masked that non-portability, and broke down to `Cannot find module` (swallowed
 * by `2>/dev/null || true`) whenever `project === $HOME` and a session's own `CLAUDE_PROJECT_DIR`
 * pointed elsewhere (issue #2). Omitting `installRoot` (every pre-existing zero-arg caller — status
 * fixtures, `applyLegStatus` regression tests) keeps the original `CLAUDE_PROJECT_DIR`-relative
 * form byte for byte; `hookCommandInvokes`/`applyLegStatus` (FR-3) recognize BOTH forms as wired,
 * and `runSetup`'s `addIfMissing` (setup.ts) REPLACES a stale form with the current one in place —
 * never a second entry — on re-setup.
 *
 * Fix round 1 corrections to the absolute (`installRoot`-given) branch — the legacy zero-arg branch
 * is UNCHANGED byte for byte:
 *  - AM-1 (HIGH): a caller-controlled path was interpolated RAW into shell source. A `"`, `$`,
 *    backtick, or `'` in `installRoot` altered or injected commands, and the SessionStart form broke
 *    outright on a `'` (it cannot be escaped inside a `'...'` body by nesting `"`). Fixed:
 *    {@link shellQuote} wraps every path; SessionStart passes them as POSITIONAL ARGS (`$1`/`$2`) to
 *    an INNER `sh -c` whose script text is a FIXED literal with no caller-controlled bytes, so
 *    nested-quote fragility cannot arise at all.
 *  - AM-3 (HIGH): the daemon used to fall back to `DZ_PROJECT_ROOT ?? installLocal`, and nothing in
 *    the SessionStart command ever SET that variable — a stale inherited `DZ_PROJECT_ROOT` in the
 *    parent env could win over the install root the hook itself resolves to. Fixed: the SessionStart
 *    command now sets `DZ_PROJECT_ROOT="$1"` (`$1` = installRoot) explicitly, so the daemon and the
 *    hook agree by construction regardless of what the parent environment happens to carry.
 *  - AM-4 (LOW): a relative `installRoot` used to produce a relative command, breaking the "every
 *    baked path is absolute" invariant the module's own docs claim. Fixed: `resolve()`s its input.
 */
export function applyLegHookEntries(
  installRoot?: string,
): { readonly userPromptSubmit: ApplyLegHookEntry; readonly sessionStart: ApplyLegHookEntry } {
  if (installRoot === undefined) {
    // Legacy zero-arg form — byte-identical to every pre-fix-round build. Kept only for
    // `applyLegStatus`'s upgrade-recognition tests (a pre-feature install's settings.json) and for
    // seeding "stale entry" fixtures; every real `dz setup` caller passes `opts.projectRoot`.
    return {
      userPromptSubmit: {
        hooks: [{
          type: 'command',
          // FR-2 (apply-leg-never-silent, ADR-001 D2): `2>/dev/null` removed — the hook itself now
          // names every silent exit on stderr (FR-1), and swallowing that stream at the settings.json
          // level would defeat it at the source. `|| true` stays: a broken hook body must never fail
          // the prompt.
          command: 'node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/recall-hook.cjs" || true',
        }],
      },
      sessionStart: {
        hooks: [{
          type: 'command',
          command: "sh -c 'nohup node \"${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/dz-embed-daemon.mjs\" >/dev/null 2>&1 & exit 0'",
        }],
      },
    };
  }
  // AM-4: make a relative caller input absolute so the "every baked path is absolute" invariant
  // holds regardless of what the caller passed, not merely for callers that already resolve first.
  const root = resolve(installRoot);
  const recallHookPath = `${root}/.claude/helpers/recall-hook.cjs`;
  const daemonPath = `${root}/.claude/helpers/dz-embed-daemon.mjs`;
  return {
    userPromptSubmit: {
      hooks: [{
        type: 'command',
        // AM-1: shellQuote the WHOLE path — a bare `"..."` interpolation only blocks whitespace and
        // globbing, it still lets `$`, backticks, and a literal `"` do damage; single-quoting blocks
        // every shell expansion at once.
        // FR-2 (apply-leg-never-silent, ADR-001 D2): `2>/dev/null` removed — see the zero-arg branch's
        // comment above for why.
        command: `node ${shellQuote(recallHookPath)} || true`,
      }],
    },
    sessionStart: {
      hooks: [{
        type: 'command',
        // AM-1/AM-3: the INNER script text (`'DZ_PROJECT_ROOT="$1" nohup node "$2" …'`) is a FIXED
        // literal — no caller-controlled byte ever sits inside it, so it can never itself contain an
        // unescaped `'` that would break the outer single-quoting. `root`/`daemonPath` instead arrive
        // as POSITIONAL ARGS (`$1`/`$2`), each independently shellQuote()d for the OUTER shell that
        // parses this whole command line. AM-3: `DZ_PROJECT_ROOT="$1"` pins the daemon to THIS
        // install root explicitly — a stale value already in the parent environment can never win.
        command: `sh -c 'DZ_PROJECT_ROOT="$1" nohup node "$2" >/dev/null 2>&1 & exit 0' sh ${shellQuote(root)} ${shellQuote(daemonPath)}`,
      }],
    },
  };
}

/** Version + presence of one deployed helper file. */
export interface ApplyLegHelperStatus {
  readonly path: string;
  readonly exists: boolean;
  /** {@link applyLegVersionOf} of the deployed file; `-1` when absent, unstamped, or unreadable. */
  readonly version: number;
  /** True only when the file EXISTS but could not be read (EISDIR, EACCES, …) — distinct from absent. */
  readonly unreadable?: boolean;
}

/** Whether a hook-registry entry naming this helper was found in `.claude/settings.json`. */
export interface ApplyLegHookPresence {
  readonly present: boolean;
}

/**
 * Why {@link ApplyLegStatus.installed} is `false`. Absent when `installed` is `true`.
 *  - `'missing-helpers'` — at least one helper FILE does not exist.
 *  - `'stale-version'` — both helpers exist and are readable, but at least one carries a
 *    `dz-apply-leg-version` below {@link APPLY_LEG_VERSION}.
 *  - `'hooks-missing'` — both helpers exist and are current, but `.claude/settings.json` does not
 *    structurally wire one or both of them under the right event (fix round 1, HIGH finding 1).
 *  - `'unreadable'` — a helper file EXISTS but could not be read (fix round 1, Q3 finding): reported
 *    distinctly rather than silently folding into `missing-helpers`, which would tell a consumer to
 *    re-run `dz setup` when the real problem is a broken/permission-denied file in the way.
 */
export type ApplyLegNotInstalledReason = 'missing-helpers' | 'stale-version' | 'hooks-missing' | 'unreadable';

/** The ONE measurement `dz doctor` and `dz parity` both read (ADR-001 Decision 3) — never a static capability declaration. */
export interface ApplyLegStatus {
  /**
   * True only when BOTH helper files exist, are READABLE, are at {@link APPLY_LEG_VERSION} or newer,
   * AND both hook entries are structurally wired under the correct event — a partial or stale install
   * is not installed (fix round 1, HIGH findings 1 and 2).
   */
  readonly installed: boolean;
  /** Present exactly when `installed` is `false` — see {@link ApplyLegNotInstalledReason}. */
  readonly reason?: ApplyLegNotInstalledReason;
  readonly helpers: {
    readonly recallHook: ApplyLegHelperStatus;
    readonly embedDaemon: ApplyLegHelperStatus;
  };
  readonly hooks: {
    readonly userPromptSubmit: ApplyLegHookPresence;
    readonly sessionStart: ApplyLegHookPresence;
  };
  /** From `.dz/config.json`'s `memory.backend`; `'unknown'` when absent/unreadable/unrecognised. */
  readonly backend: 'agentdb' | 'jsonl' | 'unknown';
}

/** Read one deployed helper's exists/version/unreadable facts. Never throws. */
function readHelperStatus(path: string): { exists: boolean; version: number; unreadable?: boolean } {
  const exists = existsSync(path);
  if (!exists) return { exists: false, version: -1 };
  try {
    return { exists: true, version: applyLegVersionOf(readFileSync(path, 'utf-8')) };
  } catch {
    // Exists but could not be read (EISDIR — e.g. a directory left at the path — EACCES, a
    // filesystem error mid-read, …). Distinct from absent: `missing-helpers` tells the reader to
    // run `dz setup`, which does nothing for a file setup cannot even open (fix round 1, Q3).
    return { exists: true, version: -1, unreadable: true };
  }
}

/**
 * ONE definition of "this command invokes our helper", shared by the installer (`setup.ts`
 * `addIfMissing`) and the diagnostics (`applyLegStatus`) so they can never disagree (re-review
 * Codex, third pass). A bare mention (`echo .claude/helpers/recall-hook.cjs`) is not an invocation:
 * the helper path must follow a `node` word — directly, or inside the daemon's
 * `sh -c 'nohup node "…"'` spawn. Forward slashes only: every command dz writes uses them.
 *
 * Fix round 1 (AM-1/AM-3, apply-leg-install-root): the SessionStart command now passes its daemon
 * path as a POSITIONAL ARG (`sh -c '… node "$2" …' sh <root> <daemonPath>`) rather than interpolating
 * it textually next to `node`, so the ORIGINAL adjacency regex alone no longer matches it. A SECOND
 * recognizer accepts that shape: the command invokes `node` with a `$N`-style positional argument
 * AND carries `markerPath` as one of its own (shellQuote()d) trailing arguments — both conditions
 * together, so a foreign command that merely echoes the marker path near an unrelated `node "$1"`
 * invocation still does not count.
 */
export function hookCommandInvokes(command: string, markerPath: string): boolean {
  const escapedMarker = markerPath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const direct = new RegExp('(^|[\\s;&|(])node\\s+[\'"]?[^\\s\'"]*' + escapedMarker);
  if (direct.test(command)) return true;
  // Codex round-2 (NEW): the absolute form is POSIX-single-quoted (`node '<root>/.claude/…'`), and a
  // root may contain whitespace or `'` (written as `'\''`) — the bare `[^\s'"]*` run above stops at
  // the first space, so such an entry read as "absent" and re-setup appended a duplicate.
  const quotedDirect = new RegExp("(^|[\\s;&|(])node\\s+'(?:[^']|'\\\\'')*" + escapedMarker);
  if (quotedDirect.test(command)) return true;
  const invokesNodeWithPositional = /\bnode\s+["']?\$\d/.test(command);
  const markerAsQuotedArg = new RegExp("'[^']*" + escapedMarker + "'");
  return invokesNodeWithPositional && markerAsQuotedArg.test(command);
}

/**
 * A hook-registry entry naming `markerPath` is wired under `event` in the PARSED settings structure
 * — never a raw substring scan over the whole file (fix round 1, HIGH finding 1). A comment, an
 * unrelated field, or the marker under the WRONG event must not read as installed: only an actual
 * `hooks.<event>[*].hooks[*].command` (or the legacy flat shape `hookCommandsOf` also understands)
 * containing `markerPath` counts.
 */
function hookWiredUnder(settings: unknown, event: string, markerPath: string): boolean {
  const hooksSection = (settings as { hooks?: unknown })?.hooks;
  const list = hooksSection && typeof hooksSection === 'object' ? (hooksSection as Record<string, unknown>)[event] : undefined;
  if (!Array.isArray(list)) return false;
  // Re-review Codex (B) finding: a bare substring (`echo .claude/helpers/recall-hook.cjs`) is not a
  // hook. Our entries always INVOKE the helper — `node "<…>/.claude/helpers/<file>"` (directly, or
  // inside the daemon's `sh -c 'nohup node "…"'`) — so the marker must follow a `node` invocation.
  return list.some((entry) => hookCommandsOf(entry).some((cmd) => hookCommandInvokes(cmd, markerPath)));
}

/**
 * Measure the apply leg's actual state in `root` — plain `fs` reads, no injection (mirrors
 * `writerVersionOf`'s own read style): a diagnostic that needed dependency injection to be testable
 * would be a diagnostic nobody could point at a REAL project either. Never throws (fix round 1, Q3):
 * an unreadable helper is a named fact in the return value, not an exception that would otherwise
 * blow through `dz doctor`'s outer try/catch (silence) or crash `dz parity` outright.
 */
export function applyLegStatus(root: string): ApplyLegStatus {
  const recallHookPath = join(root, '.claude', 'helpers', 'recall-hook.cjs');
  const embedDaemonPath = join(root, '.claude', 'helpers', 'dz-embed-daemon.mjs');

  const recallHook = readHelperStatus(recallHookPath);
  const embedDaemon = readHelperStatus(embedDaemonPath);

  let userPromptSubmitPresent = false;
  let sessionStartPresent = false;
  try {
    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8')) as unknown;
    userPromptSubmitPresent = hookWiredUnder(settings, 'UserPromptSubmit', '.claude/helpers/recall-hook.cjs');
    sessionStartPresent = hookWiredUnder(settings, 'SessionStart', '.claude/helpers/dz-embed-daemon.mjs');
  } catch {
    // settings.json absent, unreadable, or not valid JSON — both stay false, the honest answer.
  }

  let backend: ApplyLegStatus['backend'] = 'unknown';
  try {
    const cfg = JSON.parse(readFileSync(join(root, '.dz', 'config.json'), 'utf-8')) as { memory?: { backend?: string } };
    if (cfg.memory?.backend === 'agentdb') backend = 'agentdb';
    else if (cfg.memory?.backend === 'jsonl') backend = 'jsonl';
  } catch {
    // config.json absent or unreadable — 'unknown' is the honest answer, not a guess.
  }

  const anyUnreadable = recallHook.unreadable === true || embedDaemon.unreadable === true;
  const helpersPresent = recallHook.exists && embedDaemon.exists;
  const helpersCurrent =
    helpersPresent && !anyUnreadable && recallHook.version >= APPLY_LEG_VERSION && embedDaemon.version >= APPLY_LEG_VERSION;
  const hooksPresent = userPromptSubmitPresent && sessionStartPresent;
  const installed = helpersCurrent && hooksPresent;

  let reason: ApplyLegNotInstalledReason | undefined;
  if (!installed) {
    reason = anyUnreadable
      ? 'unreadable'
      : !helpersPresent
        ? 'missing-helpers'
        : !helpersCurrent
          ? 'stale-version'
          : 'hooks-missing';
  }

  return {
    installed,
    ...(reason !== undefined ? { reason } : {}),
    helpers: {
      recallHook: { path: recallHookPath, exists: recallHook.exists, version: recallHook.version, ...(recallHook.unreadable ? { unreadable: true } : {}) },
      embedDaemon: { path: embedDaemonPath, exists: embedDaemon.exists, version: embedDaemon.version, ...(embedDaemon.unreadable ? { unreadable: true } : {}) },
    },
    hooks: {
      userPromptSubmit: { present: userPromptSubmitPresent },
      sessionStart: { present: sessionStartPresent },
    },
    backend,
  };
}

/**
 * Human remedy text shared VERBATIM between `dz doctor` and `dz parity` for the two reasons this
 * fix round adds machinery for (fix round 1, HIGH finding 2 / Q3 finding 7): `stale-version` and
 * `unreadable`. Both instruments read the SAME {@link ApplyLegStatus}; routing them through the same
 * text-producing function is what makes "тексты совпадают по причине" a structural guarantee rather
 * than two hand-written strings that happen to agree today. The `missing-helpers`/`hooks-missing`
 * wording is deliberately NOT unified here — `dz doctor` and `dz parity` already carried different
 * (pre-existing, tested) phrasing for that case before this fix round, and unifying it was not asked.
 */
export function applyLegReasonMessage(status: ApplyLegStatus): string {
  if (status.reason === 'stale-version') {
    const deployedMin = Math.min(status.helpers.recallHook.version, status.helpers.embedDaemon.version);
    return `installed v${deployedMin}, current v${APPLY_LEG_VERSION} — re-run dz setup to upgrade (no --force needed)`;
  }
  if (status.reason === 'unreadable') {
    const bad = [status.helpers.recallHook, status.helpers.embedDaemon]
      .filter((h) => h.unreadable === true)
      .map((h) => h.path);
    return `cannot read deployed helper(s): ${bad.join(', ')} — fix or remove it and re-run: dz setup --target claude-code --memory agentdb`;
  }
  return 'not installed — run dz setup --target claude-code --memory agentdb';
}

/**
 * The ACTUAL command `.claude/settings.json` carries for the wired `UserPromptSubmit` recall hook —
 * not a reconstruction. {@link probeApplyLeg} must run exactly what a real session would run,
 * `${CLAUDE_PROJECT_DIR:-.}`-relative legacy form and all: reconstructing our own `node <path> ||
 * true` would silently stop testing the shell-expansion half of the legacy form, the exact half
 * issue #2 broke. Mirrors {@link hookWiredUnder}'s traversal (kept in lock-step: both read
 * `hooks.UserPromptSubmit[*].hooks[*].command` and recognize it via {@link hookCommandInvokes}) but
 * returns the command TEXT instead of a boolean.
 */
function findConfiguredRecallHookCommand(root: string): string | undefined {
  try {
    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8')) as unknown;
    const hooksSection = (settings as { hooks?: unknown })?.hooks;
    const list = hooksSection && typeof hooksSection === 'object' ? (hooksSection as Record<string, unknown>)['UserPromptSubmit'] : undefined;
    if (!Array.isArray(list)) return undefined;
    for (const entry of list) {
      for (const cmd of hookCommandsOf(entry)) {
        if (hookCommandInvokes(cmd, '.claude/helpers/recall-hook.cjs')) return cmd;
      }
    }
  } catch {
    /* settings.json absent, unreadable, or not valid JSON — nothing to probe */
  }
  return undefined;
}

/**
 * AM-4 (fix round 1, apply-leg-never-silent): the LEGACY zero-arg form ({@link applyLegHookEntries}'s
 * no-installRoot branch) reads `${CLAUDE_PROJECT_DIR:-.}` — a shell expansion that only resolves to
 * something useful from a REAL session's own cwd. Spawning it from `probeApplyLeg`'s temp "foreign"
 * cwd can never find the deployed helper by construction (the file lives at `root`'s own
 * `.claude/helpers/`, never under the temp dir), so a probe against this form would spawn a doomed
 * command and report a confusing generic failure — not a fact about whether the leg injects, only a
 * fact about the fixture being unprobeable. The absolute form ({@link shellQuote}'d installRoot)
 * never contains this literal env-expansion syntax — it bakes a resolved path instead — so a plain
 * substring check distinguishes the two without re-parsing shell grammar.
 */
export function isLegacyRelativeRecallCommand(command: string): boolean {
  return command.includes('${CLAUDE_PROJECT_DIR');
}

/** {@link probeApplyLeg}'s result — the ONE measurement `dz doctor`'s new row and `dz parity`'s
 * Self-learning cell both read (ADR-001 Decision 3, extended by `apply-leg-never-silent` D1): green
 * means OBSERVED injection, never inferred file presence. */
export interface ApplyLegProbeResult {
  /** True ONLY when the probe's own beacon lesson came back inside `additionalContext`. */
  readonly ok: boolean;
  /** Present exactly when `ok` is `false` — taken from the hook's own `[dz-recall] skipped
   * reason=…` stderr line when present, else a best-effort description of what went wrong. */
  readonly reason?: string;
  readonly elapsedMs: number;
  /** Fix round 1 (HIGH-1): the KILL-ATTEMPT fact, straight from `probeHookLiveness`'s own
   * `groupKillAttempted` — present only on the branches that actually reached a spawn (absent for the
   * early "not installed" / "no hook configured" / "legacy command" / "beacon write failed"
   * returns, none of which ever call `probeHookLiveness`). This is deliberately a DIFFERENT fact
   * from "is the grandchild still alive" — a caller observes both separately, never conflates them. */
  readonly groupKillAttempted?: boolean;
  /** FR-3 (feature `apply-leg-daemon-hygiene`): present exactly when the pre-probe scavenge of
   * STALE beacon-domain records failed — the reason comes straight from {@link
   * scavengeStaleProbeBeacons}'s own `error`, never swallowed. Independent of `ok`/`reason`: a
   * scavenge failure does not itself flip `ok` to `false` (the probe's own injection result may
   * still be perfectly genuine), but it IS a fact `dz doctor`/`dz parity` callers can surface
   * rather than lose. */
  readonly scavengeError?: string;
}

/** Words a real prompt needs to clear `hasEnoughSignal` (recall-hook-policy.ts: `MIN_PROMPT_CHARS`
 * 10, `MIN_CONTENT_TOKENS` 2) — a bare unique token alone is ONE token and would be silently
 * dropped by the very floor this probe means to exercise honestly. */
const PROBE_PROMPT_WORDS = 'apply leg live probe';
/** Doctor/parity probes share ONE domain tag so a leaked beacon (a failed removal) is trivially
 * findable and excludable — never `dz-teach`/`general`, which would blend it into real lessons. */
const PROBE_BEACON_DOMAIN = 'apply-leg-probe';

/**
 * FR-3 (feature `apply-leg-daemon-hygiene`): the scavenger that ran at the top of every probe used
 * to delete EVERY beacon-domain record unconditionally — safe against a probe killed mid-flight
 * (Codex round-2's own reason for the scavenger existing at all), but WRONG the moment two probes
 * from two DIFFERENT sessions can be live against the SAME store at once: the second probe's
 * scavenge deletes the first probe's still-in-flight beacon, and the first probe then reports a
 * false `ok:false` (its own hook query returns nothing, because the lesson it was about to match
 * against is already gone) — a false-red `dz doctor`/`dz parity` parity check with no defect behind
 * it. The fix: tag every beacon with its OWNER (`probe-owner=<pid>:<startedMs>`, embedded in the
 * pattern TEXT so it survives a round-trip through any store tier without a schema change — NFR-1
 * forbids a new column) and scavenge ONLY a beacon whose owner is provably gone: the pid no longer
 * answers `process.kill(pid, 0)`, OR the beacon has outlived its TTL (see {@link
 * scavengeStaleProbeBeacons}'s own `ttlMs` parameter).
 */
const PROBE_OWNER_TAG_PREFIX = 'probe-owner=';
/** Fix round 1 (HIGH-6 residual): a second, independent tag alongside `probe-owner=` — the WRITING
 * process's own OS-level start time (epoch ms, from `/proc/<pid>/stat`), so the scavenger can tell a
 * PID-REUSE case (the recorded pid is technically "alive" per `process.kill(pid,0)`, but the LIVE
 * process at that pid started at a different time than the one that wrote the beacon) apart from
 * the genuine same-process case. Absent whenever the write-time `/proc` read fails (non-Linux,
 * permission) — the scavenger then falls back to the plain alive+TTL check alone, unchanged. */
const PROC_START_TAG_PREFIX = 'proc-start=';
/** Lead delta after Codex round 2 (HIGH-4): the beacon's OWN expiry, in epoch ms, written by the
 * probe that owns it. The pre-delta scavenger applied ITS OWN `ttlMs` to SOMEONE ELSE'S beacon, so a
 * default-budget probe (ttl 60 s) deleted the live beacon of a widened-budget probe (ttl 360 s) after
 * 60 s — the very false-red this hardening exists to prevent, one level up. A beacon now states when
 * IT expires; the scavenger's own `ttlMs` is only the fallback for a beacon written before this tag
 * existed. */
const PROBE_EXPIRES_TAG_PREFIX = 'probe-expires=';

/**
 * Fix round 1 (HIGH-6): the pre-fix-round TTL was a flat 60 000 ms, independent of the probe's own
 * `timeoutMs` — a caller that legitimately widens `timeoutMs` past that (a widened, suspended, or
 * heavily loaded probe) could have its OWN still-in-flight beacon scavenged by a concurrent probe
 * before it ever replies. The TTL is now DERIVED from the probe's own `timeoutMs`
 * (`max(timeoutMs * 3, 60_000)`, see {@link probeApplyLeg}'s call site) so a widened timeout widens
 * its own protection window too; the 60 000 ms floor keeps the pre-fix-round generous margin for the
 * default (unwidened) case. Exported as a named constant only for the floor value — the ACTUAL TTL
 * used by a given probe is always `ttlMs`, computed at the call site, never this constant alone.
 */
const PROBE_BEACON_TTL_FLOOR_MS = 60_000;

function formatProbeOwner(pid: number, startedMs: number): string {
  return `${PROBE_OWNER_TAG_PREFIX}${pid}:${startedMs}`;
}

/** Parses the `probe-owner=<pid>:<startedMs>` tag out of a beacon's pattern text. `undefined` for
 * any beacon predating this tag (an older deployed core wrote it) — treated by the scavenger as
 * ownerless and therefore always safe to remove (the pre-FR-3 behavior for exactly that case). */
function parseProbeOwner(patternText: string): { readonly pid: number; readonly startedMs: number } | undefined {
  const idx = patternText.indexOf(PROBE_OWNER_TAG_PREFIX);
  if (idx === -1) return undefined;
  const match = /probe-owner=(\d+):(\d+)/u.exec(patternText.slice(idx));
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { pid: Number(match[1]), startedMs: Number(match[2]) };
}

function formatProcStart(procStartedAtMs: number): string {
  return ` ${PROC_START_TAG_PREFIX}${procStartedAtMs}`;
}

function formatProbeExpires(expiresAtMs: number): string {
  return ` ${PROBE_EXPIRES_TAG_PREFIX}${expiresAtMs}`;
}

/** Parses the `probe-expires=<epochMs>` tag — `undefined` for a beacon written before the tag
 * existed, which is exactly when the scavenger falls back to its own `ttlMs`. */
function parseProbeExpires(patternText: string): number | undefined {
  const idx = patternText.indexOf(PROBE_EXPIRES_TAG_PREFIX);
  if (idx === -1) return undefined;
  const match = /probe-expires=(\d+)/u.exec(patternText.slice(idx));
  if (match?.[1] === undefined) return undefined;
  return Number(match[1]);
}

/** Parses the `proc-start=<ticks>` tag — `undefined` when absent (pre-fix-round beacon, or the
 * write-time `/proc` read failed). */
function parseProcStart(patternText: string): number | undefined {
  const idx = patternText.indexOf(PROC_START_TAG_PREFIX);
  if (idx === -1) return undefined;
  const match = /proc-start=(\d+)/u.exec(patternText.slice(idx));
  if (match?.[1] === undefined) return undefined;
  return Number(match[1]);
}

/** True when `pid` answers a liveness signal — `process.kill(pid, 0)` sends no actual signal, it
 * only probes whether the OS still has a process at that pid (ESRCH ⇒ dead). */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * Fix round 1 (HIGH-6 residual, Linux-only, best-effort), tightened by the lead after Codex round 2
 * (MEDIUM-6): a process's OWN `starttime` from `/proc/<pid>/stat` — field 22 overall, found by
 * skipping past the LAST `)` so a `comm` containing spaces or parens never misaligns the split —
 * returned as RAW TICKS SINCE BOOT, the unit the kernel reports. No wall clock is consulted and no
 * CLK_TCK conversion is performed, so a stepped wall clock can no longer make the same live process
 * look like a different one. `undefined` on ANY read/parse failure (non-Linux, permission, the
 * process exiting mid-read) — the caller MUST treat that as "cannot prove", never as a pass in
 * either direction.
 */
function pidStartedAtMsFromProcStat(pid: number): number | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const afterComm = stat.slice(stat.lastIndexOf(')') + 1).trim();
    const fields = afterComm.split(/\s+/u);
    // Overall field 22 (`starttime`) = fields[22 - 3] here, since fields[] starts at overall field 3
    // (state) once `pid (comm)` (fields 1-2) has been stripped above.
    const starttimeTicks = Number(fields[19]);
    if (!Number.isFinite(starttimeTicks)) return undefined;
    // Lead delta after Codex round 2 (MEDIUM-6): return the RAW ticks-since-boot, never an epoch
    // derived from `Date.now() - uptime()`. The derived epoch moves when the WALL CLOCK is stepped,
    // so the same still-running process appeared to have "started at a different time" and its LIVE
    // beacon was deleted as a pid-reuse. Ticks since boot are monotonic within a boot and identical
    // for the same process on every read; across a reboot the recorded pid is dead anyway, which the
    // liveness check catches first — WITHDRAWN by the lead after Codex round 4: that sentence was
    // wrong, because across a reboot the pid may ALREADY have been reused and can collide on start
    // ticks too; the honest scope is the NAMED LIMIT stated below. This also removes the CLK_TCK assumption entirely — no conversion
    // to milliseconds happens at all, the two values are compared in their own unit.
    // NAMED LIMIT (lead delta after Codex round 3, MEDIUM): identity holds WITHIN one boot. Across a
    // reboot both pid allocation and ticks-since-boot restart, so a beacon that somehow persisted
    // could in principle collide with a new process at the same pid and the same tick. A boot id
    // would close it; the honest scope today is "within one boot", and a reboot also means the
    // beacon's own TTL has almost certainly passed, which the TTL branch catches first.
    return starttimeTicks;
  } catch {
    return undefined;
  }
}

/** Fix round 1 (HIGH-6 residual): `process.kill(pid,0)` proves SOME process occupies `pid`, never
 * that it is the SAME process that wrote the beacon — PID reuse defeats the plain alive check named
 * as a residual limit in the review. Compares the LIVE process's own start time (from `/proc/<pid>/
 * stat`) against `recordedStartedMs` (the beacon's own `proc-start=` tag). A mismatch beyond {@link
 * PID_START_TOLERANCE_MS} means the pid was reused by an unrelated process — the true owner is
 * confirmed gone. `undefined` (stat unreadable) means "cannot prove either way" — the lead's decision
 * (fix round 1, item 6) is explicit: that MUST read as "do not remove" wherever it is consumed, never
 * as a pass. */
function isSameProcessInstance(pid: number, recordedStartTicks: number): boolean | undefined {
  const actualStartTicks = pidStartedAtMsFromProcStat(pid);
  if (actualStartTicks === undefined) return undefined;
  // Lead delta after Codex round 2 (MEDIUM-6): EXACT equality on ticks-since-boot. The old
  // ±5 000 ms tolerance existed only to absorb the CLK_TCK guess in the epoch conversion; with the
  // raw kernel value there is nothing to absorb, and a tolerance would re-admit the very pid-reuse
  // case it was meant to exclude (a reused pid started within the tolerance read as "same process").
  return actualStartTicks === recordedStartTicks;
}

/** {@link scavengeStaleProbeBeacons}'s result — FR-3: a scavenge error is a FACT the caller can
 * surface, never a swallowed exception (the pre-fix `catch { /* best-effort *\/ }` this replaces). */
export type ScavengeResult = { readonly ok: true; readonly removed: number } | { readonly ok: false; readonly error: string };

/**
 * FR-3/FR-4: remove only the STALE beacon-domain records in `root`'s store — owner dead
 * (`process.kill(pid, 0)` ⇒ ESRCH), older than `ttlMs`, OR (fix round 1, HIGH-6 residual) alive AND
 * within `ttlMs` but the live pid's OWN `/proc/<pid>/stat` start time no longer matches the beacon's
 * `proc-start=` tag — a confirmed PID-reuse case, where the recorded owner is provably gone even
 * though `pid` itself answers. An UNREADABLE stat at scavenge time never counts as reuse evidence —
 * it falls back to the plain alive+TTL verdict, per the lead's "cannot prove ⇒ do not remove"
 * decision. A beacon whose owner is alive, within TTL, and (when provable) confirmed the SAME
 * process is left untouched, even though it belongs to a different probe. An ownerless (pre-FR-3)
 * beacon is always treated as stale. `ttlMs` defaults to {@link PROBE_BEACON_TTL_FLOOR_MS} for a
 * caller that does not derive one (`apply-leg-beacon-owner.test.ts`'s own fixtures); `probeApplyLeg`
 * always passes its own derived value. Exported so `apply-leg-beacon-owner.test.ts` can exercise the
 * property directly, without needing a live hook/daemon (FR-4's red-first case needs only a store
 * and an injectable remover, never a real probe round-trip).
 */
export function scavengeStaleProbeBeacons(
  root: string,
  removeBeacon: (root: string, ids: ReadonlySet<string>) => RemovePatternsResult,
  ttlMs: number = PROBE_BEACON_TTL_FLOOR_MS,
): ScavengeResult {
  try {
    const beacons = loadStorePatternsSync(root).filter((p) => p.domain === PROBE_BEACON_DOMAIN);
    const staleIds: string[] = [];
    for (const beacon of beacons) {
      const owner = parseProbeOwner(beacon.pattern);
      if (owner === undefined) {
        staleIds.push(beacon.dzId ?? patternRecordId(beacon));
        continue;
      }
      const alive = isPidAlive(owner.pid);
      // Lead delta after Codex round 2 (HIGH-4): the beacon's OWN expiry wins over this scavenger's
      // `ttlMs`, which belongs to a DIFFERENT probe and knows nothing of this owner's budget.
      const ownExpiresAtMs = parseProbeExpires(beacon.pattern);
      const withinTtl = ownExpiresAtMs !== undefined
        ? Date.now() <= ownExpiresAtMs
        : Date.now() - owner.startedMs <= ttlMs;
      if (!alive || !withinTtl) {
        staleIds.push(beacon.dzId ?? patternRecordId(beacon));
        continue;
      }
      // alive AND within TTL — the plain check says "keep", but confirm it is the SAME process, not
      // a reused pid, whenever the beacon carries the (best-effort) proc-start tag.
      const procStart = parseProcStart(beacon.pattern);
      if (procStart !== undefined) {
        const same = isSameProcessInstance(owner.pid, procStart);
        if (same === false) staleIds.push(beacon.dzId ?? patternRecordId(beacon)); // confirmed reuse
        // same === true, or same === undefined (unreadable ⇒ cannot prove ⇒ do not remove): keep.
      }
    }
    if (staleIds.length === 0) return { ok: true, removed: 0 };
    const result = removeBeacon(root, new Set(staleIds));
    if (result.error !== undefined) return { ok: false, error: result.error };
    return { ok: true, removed: result.removed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Live, end-to-end proof that the apply leg actually injects — ADR-001 Decision 1. `applyLegStatus`
 * only proves FILES exist and are STRUCTURALLY wired (issue #2's whole defect: four green checks,
 * a leg that injected nothing in every session but one). This spawns the REAL configured hook
 * command from a TEMPORARY cwd with `CLAUDE_PROJECT_DIR` pointing at that same temp dir — the exact
 * shape of a real Claude Code session, which never runs a hook from the project root itself — and
 * asks it to recall a throwaway "beacon" lesson written into the store for the duration of the call.
 * `ok: true` only when the beacon's own SECRET token (fix round 1, AM-1 — never sent as input, only
 * stored) comes back inside `additionalContext`; every other outcome is `ok: false` with a `reason`,
 * never a silent guess.
 *
 * The beacon is written via {@link recordPattern} (the SAME lexical-store seam `dz teach` uses) and
 * removed via {@link removePatternsByIds} in a `finally` — a probe that throws, times out, or never
 * finds the leg alive still leaves the store exactly as it found it (proven by a count-before ==
 * count-after test, not merely claimed).
 *
 * `timeoutMs` bounds `probeHookLiveness`'s spawn. Measured (this environment, 2026-09-14, T1): a
 * `store-not-found`/`socket-absent` early exit returns in well under 200 ms; a live-daemon probe
 * answers in ~100-200 ms, matching ADR-001's own estimate. 8000 ms leaves roughly a 40x margin for a
 * loaded daemon without ever approaching `probeHookLiveness`'s own un-overridden 20 000 ms ceiling —
 * a genuinely dead probe still returns to `dz doctor`/`dz parity` in bounded time.
 *
 * `env` is a TEST-ONLY escape hatch (never used by `dz doctor`/`dz parity`, both call this with
 * default opts): it lets a test widen the HOOK's OWN internal socket-connect timeout
 * (`DZ_RECALL_HOOK_TIMEOUT_MS`) against a genuinely cold daemon, matching the same widening
 * `apply-leg-recall-parity.test.ts`/`apply-leg-install-root.test.ts` already apply to the daemon's
 * `HOOK_RECALL_BUDGET_MS`. Merged BEFORE `CLAUDE_PROJECT_DIR`, so a caller can never override the
 * one env var this probe's own honesty depends on.
 */
export async function probeApplyLeg(
  root: string,
  opts: {
    timeoutMs?: number;
    env?: Readonly<Record<string, string>>;
    /** TEST-ONLY seam (AM-2, fix round 1): a stand-in for {@link removePatternsByIds} so a test can
     * force cleanup to fail WITHOUT needing to corrupt the real store mid-call. Never set by
     * `dz doctor`/`dz parity` — both call with default opts, and the real function is the default. */
    removeBeacon?: (root: string, ids: ReadonlySet<string>) => RemovePatternsResult;
  } = {},
): Promise<ApplyLegProbeResult> {
  const started = Date.now();
  const elapsed = (): number => Date.now() - started;

  // Fix round 1 (HIGH-6): computed HERE, before the scavenger runs, so the scavenge TTL can be
  // derived from THIS probe's own budget rather than a flat constant blind to a caller-widened
  // timeout — see the `ttlMs` computation below, right before the beacon that carries its implicit
  // promise is written.
  const timeoutMs = opts.timeoutMs ?? 8000;

  const status = applyLegStatus(root);
  if (!status.installed) {
    return { ok: false, reason: 'apply-leg not installed', elapsedMs: elapsed() };
  }
  const command = findConfiguredRecallHookCommand(root);
  if (command === undefined) {
    return { ok: false, reason: 'no UserPromptSubmit entry invokes recall-hook.cjs (settings.json missing or unreadable)', elapsedMs: elapsed() };
  }
  // AM-4: the legacy relative form can never be reached from a foreign cwd by construction — see
  // isLegacyRelativeRecallCommand's own doc comment. Reported BEFORE any beacon is written: there is
  // nothing to clean up for a probe that never ran.
  if (isLegacyRelativeRecallCommand(command)) {
    return { ok: false, reason: 'legacy-relative-command', elapsedMs: elapsed() };
  }

  // AM-1 (CRITICAL, fix round 1): two INDEPENDENT tokens, not one. `queryToken` rides the PROMPT the
  // probe sends the hook — a dead/stub hook that merely echoes its own stdin back into
  // `additionalContext` makes THIS token reappear too, so it alone can never prove genuine
  // injection. `secretToken` exists ONLY inside the beacon's STORED pattern text and is never sent
  // to the hook as input — only a hook that actually queried the store and returned a matched
  // pattern's own text can produce it. `ok: true` therefore requires the SECRET, never the query.
  const queryToken = `dzapplylegquery${process.pid}${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  const secretToken = `dzapplylegsecret${process.pid}${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  // FR-3: the owner tag rides the SAME pattern text as the secret — a beacon's owner is knowable
  // from its store record alone, no side channel, no schema change (NFR-1).
  const ownerTag = formatProbeOwner(process.pid, started);
  // Fix round 1 (HIGH-6): TTL derives from THIS probe's own timeoutMs — a caller that widens
  // timeoutMs (this repo's own live tests widen it to 15_000 ms) widens its own protection window
  // too, rather than staying pinned to a flat constant blind to that widening. Floored at the
  // pre-fix-round 60_000 ms so the default (unwidened) case keeps its original generous margin.
  // Asserted, not merely trusted — an unreasoned future edit to the formula must fail loudly right
  // here, where the beacon carrying this TTL's implicit promise is about to be written, rather than
  // silently reintroducing the false-red-under-concurrency defect this closes.
  const ttlMs = Math.max(timeoutMs * 3, PROBE_BEACON_TTL_FLOOR_MS);
  if (!(timeoutMs < ttlMs)) {
    throw new Error(`invariant violated: timeoutMs (${String(timeoutMs)}) must be < ttlMs (${String(ttlMs)}) — scavenger TTL formula regressed`);
  }
  // Fix round 1 (HIGH-6 residual, best-effort): the writing process's OWN OS-level start time,
  // captured NOW so a later scavenger can tell a genuinely-still-alive owner apart from a DIFFERENT
  // process that merely reused this pid (isSameProcessInstance's own doc comment). Omitted entirely
  // when unreadable (non-Linux, permission) — the scavenger then falls back to the plain alive+TTL
  // check for this beacon, unchanged from before this residual hardening.
  const ownProcStart = pidStartedAtMsFromProcStat(process.pid);
  const procStartTag = ownProcStart !== undefined ? formatProcStart(ownProcStart) : '';
  // Lead delta after Codex round 2 (HIGH-4): this beacon states its OWN expiry, so a concurrent
  // probe with a different (shorter) budget can never out-vote this probe's protection window.
  const expiresTag = formatProbeExpires(started + ttlMs);
  const beaconPattern: PatternRecord = {
    pattern: `${PROBE_PROMPT_WORDS} ${queryToken} — dz doctor / dz parity live-probe marker, safe to remove. probe-secret=${secretToken} ${ownerTag}${procStartTag}${expiresTag}`,
    type: 'lesson-learned',
    reward: 0,
    domain: PROBE_BEACON_DOMAIN,
    ts: new Date().toISOString(),
    source: 'apply-leg-probe',
  };
  // Deterministic content-hash id (patternRecordId), computed from the SAME object recordPattern is
  // about to write — the id is a pure function of {pattern, ts, reward, domain, type}, so the value
  // computed here and the value the store assigns are guaranteed equal without a round-trip read.
  const beaconId = patternRecordId(beaconPattern);
  const probePrompt = `${PROBE_PROMPT_WORDS} ${queryToken}`;
  const removeBeacon = opts.removeBeacon ?? removePatternsByIds;

  // AM-2 (HIGH, fix round 1): `wrote` is armed BEFORE the write is even attempted, and cleanup below
  // runs off `wrote` alone — a `recordPattern` call that PARTIALLY lands and then rejects used to
  // skip cleanup entirely (the old code's `finally` only wrapped the code AFTER a successful
  // `await recordPattern`), leaking the beacon forever. A cleanup FAILURE (the store refuses the
  // delete) now overrides whatever `result` the probe body computed — `ok: true` is not honest if
  // the probe cannot even prove the store is clean afterward.
  let wrote = false;
  let cleanupFailed = false;
  let cleanupErrMsg = '';
  let tempCwd: string | undefined;
  let result!: ApplyLegProbeResult;

  // Codex round-2: a process killed mid-probe bypasses `finally`, so a beacon can outlive its probe.
  // Every probe therefore starts by SCAVENGING any beacon left behind by an earlier one (the probe
  // domain is reserved for beacons, never for user lessons) — the store is clean before AND after.
  // FR-3/FR-4: scavenging is no longer unconditional — a LIVE beacon from a DIFFERENT concurrent
  // probe (another session's `dz doctor`/`dz parity` against the same store) must survive; only a
  // beacon whose owner is dead or past its TTL is removed. A scavenge failure is a named FACT
  // (`scavengeError`), never a swallowed exception (the pre-fix `catch {}` this replaces).
  let scavengeError: string | undefined;
  const scavengeResult = scavengeStaleProbeBeacons(root, removeBeacon, ttlMs);
  if (!scavengeResult.ok) scavengeError = scavengeResult.error;

  try {
    wrote = true;
    let writeFailed: string | undefined;
    try {
      await recordPattern(root, beaconPattern);
    } catch (err) {
      writeFailed = err instanceof Error ? err.message : String(err);
    }

    if (writeFailed !== undefined) {
      result = { ok: false, reason: `beacon write failed: ${writeFailed}`, elapsedMs: elapsed() };
    } else {
      // AM-4: a bare empty temp dir does not model a FOREIGN session — a real foreign
      // CLAUDE_PROJECT_DIR names a DIFFERENT project with its own (empty-of-lessons, but present)
      // `.dz`/`.claude` tree, not "nothing at all". This closes the gap between "no project" and "a
      // different, empty project" a bare empty dir cannot distinguish, matching what the hook's own
      // SESSION_ROOT-derived reads (e.g. the retro-debt sentinel) would see in a real foreign session.
      tempCwd = mkdtempSync(join(tmpdir(), 'dz-apply-leg-probe-'));
      mkdirSync(join(tempCwd, '.dz'), { recursive: true });
      mkdirSync(join(tempCwd, '.claude'), { recursive: true });

      const { probeHookLiveness } = await import('./operations.js');
      const probeResult = probeHookLiveness(command, JSON.stringify({ prompt: probePrompt }), {
        cwd: tempCwd,
        env: { ...(opts.env ?? {}), CLAUDE_PROJECT_DIR: tempCwd },
        timeoutMs,
      });

      const stdoutLines = probeResult.stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '');
      let additionalContext: unknown;
      for (const line of stdoutLines) {
        try {
          const parsed = JSON.parse(line) as { hookSpecificOutput?: { additionalContext?: unknown } };
          if (typeof parsed?.hookSpecificOutput?.additionalContext === 'string') {
            additionalContext = parsed.hookSpecificOutput.additionalContext;
          }
        } catch {
          /* not a JSON line — the hook only ever emits at most one, but tolerate stray output */
        }
      }

      if (typeof additionalContext === 'string' && additionalContext.includes(secretToken)) {
        result = { ok: true, elapsedMs: elapsed(), groupKillAttempted: probeResult.groupKillAttempted };
      } else if (typeof additionalContext === 'string' && additionalContext.includes(queryToken)) {
        // AM-1: the QUERY came back but the SECRET did not — the hook (or a stub standing in for
        // it) echoed its own input instead of genuinely querying the store. Named distinctly from
        // every other red reason so a dead leg and a FAKING one never read the same.
        result = { ok: false, reason: 'echo-not-injection', elapsedMs: elapsed(), groupKillAttempted: probeResult.groupKillAttempted };
      } else {
        // FR-1's own reason line is the authoritative source — the hook names itself why it stayed
        // quiet. Falling back to a raw stderr/status summary keeps the probe honest even against an
        // OLDER deployed hook (pre-`apply-leg-never-silent`) that has not been upgraded yet.
        const skipMatch = /\[dz-recall\] skipped reason=(\S+)/.exec(probeResult.stderr);
        const skipReason = skipMatch?.[1];
        if (skipReason !== undefined) {
          result = { ok: false, reason: skipReason, elapsedMs: elapsed(), groupKillAttempted: probeResult.groupKillAttempted };
        } else if (probeResult.status === null) {
          result = { ok: false, reason: `probe did not complete (timeout or spawn error after ${timeoutMs} ms)`, elapsedMs: elapsed(), groupKillAttempted: probeResult.groupKillAttempted };
        } else {
          const stderrFirstLine = probeResult.stderr.trim().split('\n')[0];
          result = {
            ok: false,
            reason: stderrFirstLine && stderrFirstLine !== '' ? stderrFirstLine : 'no beacon in additionalContext (empty or non-matching reply)',
            elapsedMs: elapsed(),
            groupKillAttempted: probeResult.groupKillAttempted,
          };
        }
      }
    }
  } finally {
    if (tempCwd !== undefined) {
      try {
        rmSync(tempCwd, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup of the probe's own temp cwd */
      }
    }
    // Beacon removal is UNCONDITIONAL on `wrote` — success, failure, or a thrown probe all reach
    // here (AM-2). `removePatternsByIds` never throws (patterns.ts's own contract) — a failure is
    // reported through its RETURN VALUE's `.error`, checked below, never via a catch.
    if (wrote) {
      try {
        const removeResult = removeBeacon(root, new Set([beaconId]));
        if (removeResult.error !== undefined) {
          cleanupFailed = true;
          cleanupErrMsg = removeResult.error;
        }
      } catch (err) {
        // Codex round-2: a remover that THROWS (a foreign store implementation, a test seam) must not
        // escape past the cleanup accounting — it is a cleanup failure like any other.
        cleanupFailed = true;
        cleanupErrMsg = err instanceof Error ? err.message : String(err);
      }
    }
  }

  if (cleanupFailed) {
    // a cleanup failure can only happen after `result` was assigned (the finally block runs after
    // the try body) — carry the kill-attempt fact through rather than dropping it on this path.
    // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional field explicitly, so
    // the key is included only when `result.groupKillAttempted` actually has a value.
    return {
      ok: false,
      reason: `beacon-cleanup-failed: beacon ${beaconId} could not be removed (${cleanupErrMsg})`,
      elapsedMs: elapsed(),
      ...(result.groupKillAttempted !== undefined ? { groupKillAttempted: result.groupKillAttempted } : {}),
      ...(scavengeError !== undefined ? { scavengeError } : {}),
    };
  }
  // FR-3: a scavenge failure is surfaced on the SUCCESS path too — it does not override `ok`/
  // `reason` (this probe's own injection result may be perfectly genuine), but it is a fact a
  // caller should not lose.
  return scavengeError !== undefined ? { ...result, scavengeError } : result;
}
