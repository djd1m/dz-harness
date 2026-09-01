/**
 * Full environment setup — skills + hooks + memory + pretrain.
 *
 * Unlike `dz init` (skills only), `dz setup` configures the complete
 * self-learning environment:
 * 1. Skills installation (via init)
 * 2. Claude Code session hooks (start/end) — with `--memory agentdb`, a real vector-store
 *    write via `.dz/agentdb-writer.mjs`; otherwise a `.dz/sessions.jsonl` marker
 * 3. Memory store: `.dz/agentdb.db` (agentdb — the session-hook writer's OWN file; the agentdb
 *    MCP server gets a SEPARATE `.dz/agentdb-mcp.db` via AGENTDB_PATH, never this one)
 *    or `.dz/sessions.jsonl` + `.dz/patterns.jsonl` (jsonl default)
 * 4. Pretrain (project analysis → auto-recommend)
 *
 * All operations are additive — never overwrites existing files.
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import { mergeManagedHookEntries } from './managed-hooks.js';
import { applyIntegrationFragments, IntegrationApplyError } from './integration-apply.js';

/** Memory backend type. */
export type MemoryBackend = 'jsonl' | 'agentdb';

/** Setup options. */
export interface SetupOptions {
  readonly projectRoot: string;
  readonly target: string;
  readonly preset?: string | undefined;
  readonly memory?: MemoryBackend | undefined;
  readonly noHooks?: boolean | undefined;
  readonly noMemory?: boolean | undefined;
  readonly noPretrain?: boolean | undefined;
  readonly force?: boolean | undefined;
  /** Also deploy the operating-instructions "driver" skill + agent docs. */
  readonly installDriver?: boolean | undefined;
}

/** Setup result. */
export interface SetupResult {
  readonly steps: readonly SetupStep[];
  readonly totalSteps: number;
  readonly completed: number;
  readonly skipped: number;
}

/** A single setup step. */
export interface SetupStep {
  readonly name: string;
  readonly status: 'done' | 'skipped' | 'error';
  readonly detail: string;
}

/**
 * Absolute path to the store the generated session-hook writer opens NATIVELY (better-sqlite3).
 * It is the writer's own file: the agentdb MCP server must never be pointed at it — see
 * {@link agentdbMcpStorePath}.
 */
export function agentdbStorePath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'agentdb.db');
}

/**
 * Absolute path to the agentdb MCP server's OWN store — never the hook writer's
 * (ADR-001 `agentdb-setup-shared-store-fix`, 2026-08-26).
 *
 * WHY two files: a single SQLite file opened by two different engines is a measured data-loss
 * path. `agentdb` falls back to sql.js when better-sqlite3 has no usable binary (no prebuild for
 * Node 24+/ABI 137, no binary in the npm tarball) — and sql.js persists by rewriting the WHOLE
 * file from its in-memory image, discarding whatever the native writer committed meanwhile.
 * MEASURED in this repo 2026-07-09 (commits 1d47a916 / 9ede3fb5): of 20 samples, 5 were zero
 * bytes and 4 were torn. The cure is separation, not a lock: a lock cannot bind a third-party
 * `npx` process, and sql.js ignores SQLite locking outright.
 */
export function agentdbMcpStorePath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'agentdb-mcp.db');
}

/**
 * The ONE separation predicate — used by both printers (`runSetup`'s `agentdb wiring` step and
 * `runDoctor`'s `agentdb store separation` check), so a surface can never drift into its own
 * copied comparison.
 *
 * @param projectRoot the project whose `.mcp.json` was read
 * @param pinned the observed `mcpServers.agentdb.env.AGENTDB_PATH` (`undefined` when absent)
 * @returns `null` when the registration is correctly separated, else the WHY message
 */
export function agentdbStoreSeparationProblem(projectRoot: string, pinned: string | undefined): string | null {
  if (pinned === agentdbStorePath(projectRoot)) {
    return 'SHARED STORE — .mcp.json pins the agentdb MCP server at the same file the session-hook '
      + 'writer opens (.dz/agentdb.db). Two engines on one SQLite file: an agentdb server that '
      + 'falls back to sql.js rewrites the WHOLE file and discards the writer\'s pages. Measured '
      + '2026-07-09: 5 of 20 samples zero bytes, 4 torn. Re-run `dz setup --memory agentdb` to '
      + 'repoint the server at .dz/agentdb-mcp.db.';
  }
  if (pinned !== agentdbMcpStorePath(projectRoot)) {
    return '.mcp.json agentdb missing or not pinned to the MCP store (.dz/agentdb-mcp.db)';
  }
  return null;
}

/**
 * Absolute path to the throttle marker holding the epoch-ms timestamp of the last consolidate the
 * writer spawned. Read before every SessionEnd/PreCompact consolidate: within THROTTLE_MS the spawn
 * is skipped so rapid compactions of a long session don't repeatedly load the embedding model.
 */
function consolidateMarkerPath(projectRoot: string): string {
  return join(projectRoot, '.dz', '.last-consolidate');
}

/**
 * Version of the generated `.dz/agentdb-writer.mjs`. Bump on ANY change to
 * {@link generateAgentdbWriter}'s output — setup regenerates deployed writers whose
 * `dz-writer-version` stamp is older, WITHOUT requiring `--force` (audit gap G4: generated code
 * must not fossilize outside the package lifecycle).
 */
export const AGENTDB_WRITER_VERSION = 5;

/**
 * Generate the `.dz/agentdb-writer.mjs` helper invoked by the session hooks.
 *
 * v2 (ADR-002, audit gaps G3 + code#1 + code#4): session markers are **metadata-only telemetry** —
 * a plain row in the `dz_session_events` table inside the writer's OWN `.dz/agentdb.db` (v5: the
 * MCP server is pinned to a SEPARATE `.dz/agentdb-mcp.db`). No embedding, no model load, no
 * `successRate`:
 * - ~ms latency (v1 loaded a ~90 MB transformers model → 12 s cold-timeout losing the marker);
 * - zero pollution of the HNSW index real learnings live in (those enter via `agentdb_*` MCP tools);
 * - uses better-sqlite3 DIRECTLY (WAL + busy_timeout) — if it is unavailable the writer falls back
 *   to the jsonl marker instead of ever touching the sql.js in-memory backend, whose
 *   last-write-wins semantics were the design's one real corruption vector.
 *
 * Best-effort and never throws: any failure degrades to a `.dz/sessions.jsonl` line labelled
 * `jsonl-fallback` (with the error), so the hook always exits 0 and never blocks a session.
 */
export function generateAgentdbWriter(projectRoot: string): string {
  const dbPath = agentdbStorePath(projectRoot);
  const sessionsPath = join(projectRoot, '.dz', 'sessions.jsonl');
  const markerPath = consolidateMarkerPath(projectRoot);
  return `#!/usr/bin/env node
// dz-writer-version: ${AGENTDB_WRITER_VERSION}
// Auto-generated by \`dz setup --memory agentdb\`. Do not edit — re-run \`dz setup\` to upgrade
// (setup regenerates automatically when this version stamp is outdated; --force not required).
// Writes a metadata-only session-event row into the writer's OWN AgentDB store (.dz/agentdb.db).
// This file is NEVER shared with the agentdb MCP server — that server has its own
// .dz/agentdb-mcp.db, because two engines on one SQLite file is a measured corruption path
// (2026-07-09: 5 of 20 samples zero bytes, 4 torn). Real learnings go into the vector index via
// the agentdb_* MCP tools; this is deliberately non-semantic telemetry.
// On SessionEnd AND PreCompact it ALSO fires a detached \`dz consolidate\` (Option C, ADR-003):
// harvest this session's learnings into the lexical store and mirror them — with real embeddings —
// into the shared AgentDB vector index. PreCompact is the RELIABLE periodic trigger: it fires on
// every compaction (manual /compact and auto-compact), so long/compacted/abnormally-terminated
// sessions — where SessionEnd frequently never fires — still consolidate. A .dz/.last-consolidate
// epoch-ms marker THROTTLES it (THROTTLE_MS): within the window the spawn is skipped so rapid
// compactions don't thrash the ~90 MB embedding-model load. Detached + unref'd: the hook returns
// immediately; the model-load cost happens off the session's critical path.
// Best-effort: on ANY error it appends a .dz/sessions.jsonl marker and exits 0 — never throws,
// never blocks the session.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const arg = process.argv[2];
const event = arg === 'end' ? 'end' : arg === 'precompact' ? 'precompact' : 'start';
const ts = new Date().toISOString();
// PINNED, deliberately NOT read from the ambient environment. Honouring an ambient store path re-opened the
// exact hole this feature closes: export AGENTDB_PATH=.dz/agentdb-mcp.db and the writer and the MCP
// server share ONE file again — two engines, one database — while the separation invariant still
// reports PASS, because it inspects the registration and not the writer's runtime resolution.
// Found by cross-family QE (Codex gpt-5.6-sol) against the first version of this fix. A store that
// needs to move is a REGENERATION (\`dz setup --memory agentdb\`), never an env override.
const DB = ${JSON.stringify(dbPath)};
const SESSIONS = ${JSON.stringify(sessionsPath)};
const ROOT = ${JSON.stringify(projectRoot)};
const CONSOLIDATE_MARKER = ${JSON.stringify(markerPath)};
const THROTTLE_MS = 15 * 60 * 1000; // 15 min — rapid compactions must not re-load the embed model

function note(extra) {
  try {
    appendFileSync(SESSIONS, JSON.stringify({ event, ts, ...extra }) + '\\n');
  } catch { /* last resort: swallow */ }
}
function fallback(err) {
  note({ backend: 'jsonl-fallback', error: String((err && err.message) || err) });
}

try {
  // Native better-sqlite3 ONLY (prebuilt; synchronous; WAL). Never the sql.js fallback — its
  // whole-file-in-memory persistence is the mechanism that corrupted a shared store.
  // Records start/end AND the lightweight precompact row via the SAME insert path.
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(DB);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000'); // wait out a brief MCP-server write lock instead of failing
  db.exec('CREATE TABLE IF NOT EXISTS dz_session_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, ts TEXT NOT NULL, source TEXT NOT NULL DEFAULT \\'dz-session-hook\\')');
  db.prepare('INSERT INTO dz_session_events (event, ts) VALUES (?, ?)').run(event, ts);
  db.close();
} catch (err) {
  fallback(err);
}

if (event === 'end' || event === 'precompact') {
  // Option C: harvest learnings + mirror to the vector index, DETACHED (fire-and-forget) so the
  // hook never waits on transcript parsing or the embedding model. Fires on BOTH SessionEnd and
  // PreCompact (the reliable trigger for long sessions) — THROTTLED via .dz/.last-consolidate so
  // rapid back-to-back compactions don't repeatedly pay the model-load cost.
  let last = 0;
  try { last = parseInt(String(readFileSync(CONSOLIDATE_MARKER, 'utf-8')).trim(), 10) || 0; } catch { last = 0; }
  if (Date.now() - last < THROTTLE_MS) {
    note({ consolidate: 'skipped-throttled' });
  } else {
    try { writeFileSync(CONSOLIDATE_MARKER, String(Date.now())); } catch { /* best-effort marker */ }
    // Uses the globally-installed \`dz\` from PATH. NO shell on posix: spawn's args-array +
    // shell:true silently word-splits a ROOT containing spaces AND is Node's documented
    // command-injection hazard (QE P1+P2); a plain spawn searches PATH itself and quotes nothing.
    // Windows needs a shell for the .cmd shim, so there we pass ONE pre-quoted string (") — quotes
    // are illegal in Windows paths, so wrapping is sufficient. Failure is detected via BOTH the
    // error event (posix ENOENT) and a non-zero exit code (shell-mediated "not found").
    try {
      const child = process.platform === 'win32'
        ? spawn('dz consolidate --project "' + ROOT + '"', { detached: true, stdio: 'ignore', shell: true, cwd: ROOT })
        : spawn('dz', ['consolidate', '--project', ROOT], { detached: true, stdio: 'ignore', cwd: ROOT });
      child.on('error', (err) => note({ consolidate: 'skipped', error: String((err && err.message) || err) }));
      child.on('exit', (code) => { if (code !== null && code !== 0) note({ consolidate: 'skipped', error: 'dz exited ' + code + ' (not on PATH?)' }); });
      child.unref();
    } catch (err) {
      note({ consolidate: 'skipped', error: String((err && err.message) || err) });
    }
  }
}
`;
}

/** Parse the `dz-writer-version` stamp from a deployed writer file ('' or absent → 0). */
export function writerVersionOf(content: string): number {
  const m = /^\/\/ dz-writer-version:\s*(\d+)/m.exec(content);
  return m ? parseInt(m[1] ?? '0', 10) : 0;
}

/** Generate Claude Code hooks configuration for self-learning. */
/**
 * Commands of a Claude Code hook entry in EITHER shape: the valid matcher-group form
 * `{matcher?, hooks:[{type,command}]}` or the legacy flat `{type,command}` that dz ≤0.3.43
 * emitted (Claude Code silently ignores flat entries — the writer-hooks bug; migrated on setup).
 */
export function commandsOf(entry: unknown): string[] {
  const e = entry as { command?: unknown; hooks?: { command?: unknown }[] };
  if (Array.isArray(e?.hooks)) return e.hooks.map((h) => String(h?.command ?? ''));
  return [String(e?.command ?? '')];
}

export function generateHooksConfig(projectRoot: string, backend: MemoryBackend): string {
  const dzDir = join(projectRoot, '.dz');

  if (backend === 'agentdb') {
    // agentdb backend: hooks invoke the generated writer, which does a REAL vector-store write
    // (ReasoningBank.storePattern) into the AGENTDB_PATH store the MCP server shares. The writer
    // self-degrades to a sessions.jsonl marker on any failure, so no hook ever throws.
    const writer = join(dzDir, 'agentdb-writer.mjs');
    // Claude Code's hooks schema requires MATCHER-GROUP entries: `[{ hooks: [{type, command}] }]`.
    // A flat `[{type, command}]` is silently ignored by Claude Code (QE find: writer hooks never
    // fired), so wrap every entry. Session events take no matcher.
    // PreCompact is MATCHER-LESS (matcher-group entry that omits the optional matcher field) and fires before EVERY
    // compaction — the reliable periodic trigger for long/compacted/abnormally-terminated sessions
    // where SessionEnd frequently never fires. runInBackground so it never blocks compaction; the
    // writer itself throttles + detaches the consolidate. SessionEnd stays as a belt-and-suspenders
    // trigger for clean exits.
    return JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: `node ${JSON.stringify(writer)} start` }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: `node ${JSON.stringify(writer)} end` }] }],
        PreCompact: [{ hooks: [{ type: 'command', command: `node ${JSON.stringify(writer)} precompact`, runInBackground: true }] }],
      },
    }, null, 2);
  }

  // JSONL backend (default) — honest session bookkeeping, no vector store involved.
  // Use a RELATIVE path (Claude Code runs hooks from the project root): interpolating the absolute
  // ${dzDir} into a single-quoted JS literal inside shell double-quotes breaks on Windows backslash
  // paths (\U, \b…) and on any path containing a quote. `.dz/sessions.jsonl` sidesteps all of it.
  const jsonlCmd = (event: 'start' | 'end' | 'precompact'): string =>
    `node -e "const fs=require('fs');const d=new Date().toISOString();fs.appendFileSync('.dz/sessions.jsonl',JSON.stringify({event:'${event}',ts:d,backend:'jsonl'})+'\\n')"`;
  // Matcher-less PreCompact mirrors the agentdb backend so long-session bookkeeping stays reliable
  // even without a vector store (jsonl has no consolidator — this is just an honest marker row).
  return JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: jsonlCmd('start') }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: jsonlCmd('end') }] }],
      PreCompact: [{ hooks: [{ type: 'command', command: jsonlCmd('precompact'), runInBackground: true }] }],
    },
  }, null, 2);
}

/** Generate .dz/config.json with learning settings. */
function generateDzConfig(target: string, preset: string | undefined, backend: MemoryBackend): string {
  return JSON.stringify({
    version: '1.0.0',
    target,
    preset: preset ?? null,
    learning: {
      enabled: true,
      sessionTracking: true,
      // recommend() reads .dz/patterns.jsonl back as a ranking boost (audit #2).
      // Set false to disable the boost (recommend() reverts to pure keyword scoring).
      recommendBoost: true,
      // agentdb backend: the SessionEnd hook fires a detached `dz consolidate` that harvests
      // learnings and mirrors them into the vector index (Option C, ADR-003). jsonl backend has
      // no background consolidator — the flag must not advertise an unimplemented capability.
      patternConsolidation: backend === 'agentdb',
      // Store backend: 'auto' = SQLite (FTS5, scale) when better-sqlite3 is
      // available, else the JSON fallback. 'json'/'sqlite' force a backend (Tier-3).
      sqliteBackend: 'auto',
      // Honored at read time: records older than this are dropped (0 = keep forever).
      retentionDays: 90,
    },
    memory: {
      backend,
      // agentdb: the native SQLite vector store the session-hook writer opens. The agentdb MCP
      // server is pinned (via AGENTDB_PATH) to a SEPARATE file — see `mcpStorePath` below.
      path: backend === 'agentdb' ? '.dz/agentdb.db' : '.dz/sessions.jsonl',
      maxSizeMb: backend === 'agentdb' ? 100 : 10,
      agentdb: backend === 'agentdb' ? {
        learning: true,
        vectorDim: 384,
        mcpServer: 'agentdb',
        // The hook writer's own file. The MCP server gets `mcpStorePath` (env AGENTDB_PATH) —
        // the two are deliberately different files (ADR-001, 2026-08-26).
        storePath: '.dz/agentdb.db',
        mcpStorePath: '.dz/agentdb-mcp.db',
        embeddingModel: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        sessionHookWrites: true,
      } : undefined,
    },
    hooks: {
      sessionStart: true,
      sessionEnd: true,
    },
  }, null, 2);
}

/** True if `agentdb` resolves from the project's node_modules (the hook writer needs it there). */
function isAgentdbInstalledLocally(projectRoot: string): boolean {
  return existsSync(join(projectRoot, 'node_modules', 'agentdb', 'package.json'));
}

/**
 * The exact agentdb version installed in the project, or `'latest'` as a fallback. Used to pin the
 * MCP server spec (`agentdb@<version>`) so the long-running MCP server and the hook writer — which
 * imports the on-disk local copy — run the SAME schema against the shared DB (agentdb is alpha;
 * `@latest` could drift the MCP server's schema away from what the hook wrote).
 */
function installedAgentdbSpec(projectRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'node_modules', 'agentdb', 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version ? `agentdb@${pkg.version}` : 'agentdb@latest';
  } catch {
    return 'agentdb@latest';
  }
}

/**
 * Install `agentdb` + `better-sqlite3` as LOCAL project deps so the session-hook writer can
 * `import('agentdb')` and get a native SQLite store (better-sqlite3 ships prebuilt binaries — no
 * build tools — and gives true cross-process WAL concurrency so the hook and the MCP server share
 * one live store). Best-effort: returns false (caller degrades to jsonl) if install fails.
 */
function installAgentdbLocally(projectRoot: string): boolean {
  if (isAgentdbInstalledLocally(projectRoot)) return true;
  try {
    // Anchor npm to THIS project: without a package.json here, npm's prefix walk-up would
    // install into (and mutate the lockfile of) the nearest ANCESTOR project (audit code#2).
    const pkgJsonPath = join(projectRoot, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      writeFileSync(pkgJsonPath, JSON.stringify({ name: 'dz-harness-project', private: true, version: '0.0.0' }, null, 2) + '\n');
    }
    // NB: use the ESM-imported execSync — `require()` is undefined in this ESM module (the
    // original agentdb hooks failed silently for exactly this reason). stdio:'ignore' (not
    // 'pipe') avoids execSync's 1 MB maxBuffer aborting the child on npm's verbose output.
    // --save-exact: agentdb is alpha; a semver range would let a later `npm update` drift the
    // local copy away from the version the MCP registration pins (audit gap G7).
    execSync('npm install agentdb better-sqlite3 --save-exact --no-audit --no-fund --loglevel=error', {
      cwd: projectRoot,
      stdio: 'ignore',
      timeout: 300000,
    });
    return isAgentdbInstalledLocally(projectRoot);
  } catch {
    return false;
  }
}

/** Run full environment setup. */
/** Marker that brackets the dz-harness section in a shared CLAUDE.md/AGENTS.md. */
const DRIVER_MARKER_START = '<!-- dz-harness-driver:start -->';
const DRIVER_MARKER_END = '<!-- dz-harness-driver:end -->';

/**
 * Operating instructions for a coding agent that should *drive* the dz CLI
 * correctly. Inspired by Visa VVAH `--install-agents`: the toolkit ships its own
 * "how to operate me" doc so agents use the CLI as intended rather than guessing.
 */
function generateDriverInstructions(): string {
  return `# Operating dz-harness-hub (CLI driver)

You have the \`dz\` CLI (\`@dzhechkov/harness-cli\`) available. It manages cross-platform
AI skills (the agentskills.io \`SKILL.md\` format) across Claude Code, Codex, OpenCode,
Hermes, and OpenClaude.

## Core commands

| Command | Use it when |
|---------|-------------|
| \`dz recommend "<task>"\` | The user describes a task — suggests the right skills/preset/npx package. Start here. |
| \`dz setup --target <t> [--preset <p>] [--memory agentdb]\` | Bootstrap a project: config, hooks, learning memory. |
| \`dz init --target <t> [--preset <p>] [--select id,id]\` | Install skills into a project for a platform. |
| \`dz benchmark <skill-dir>\` | Score a skill (L0 structural checks, grade A–F, cost band). |
| \`dz pretrain\` | Detect the project's tech stack and pre-load relevant skills. |
| \`dz scout [--deep]\` | Discover new skill sources across the ecosystem. |
| \`dz import-ecc\` | Import skills from an ECC repo. |

## Rules for driving this CLI

1. **Do NOT hand-edit \`SKILL.md\` files to make a benchmark pass** — fix the underlying
   structure (missing frontmatter, sections, schema) instead.
2. **Do NOT hand-write \`.dz/config.json\`** — run \`dz setup\` and let it generate config.
3. **Skills are agentskills.io format** — YAML frontmatter (name, description, trust_tier,
   validation) + a Markdown body with a Protocol and Anti-Patterns section.
4. **Presets bundle skills**; prefer \`--preset\` over selecting individual skills unless the
   user wants a minimal install.
5. **Trust tiers**: tier 1 (Structured) → run \`/bto-test\` to promote to tier 2 (Validated).
6. When unsure which skills fit, run \`dz recommend\` first and follow its output.

## Targets (platform install dirs)

claude-code → \`.claude/skills/\` · codex → \`.agents/skills/\` · opencode → \`.opencode/\` ·
hermes → \`.hermes/\` · openclaude → \`.claude/skills/\` · copilot → \`.github/instructions/\` ·
agents-md → \`AGENTS.md\` (single root file) · cursor → \`.cursor/rules/\` (one \`.mdc\` per skill) ·
gemini → \`GEMINI.md\` (single root file, Gemini CLI / Code Assist) ·
windsurf → \`.windsurf/rules/\` (one \`.md\` per skill, Windsurf \`trigger\` frontmatter).
The SKILL.md format is identical across the five tree targets — only the directory differs;
copilot, agents-md, cursor, gemini, and windsurf are transforming/lossy targets (agents-md and gemini
merge ALL selected skills into one root \`AGENTS.md\` / \`GEMINI.md\`, preserving your own content; cursor
emits one \`.cursor/rules/<id>.mdc\` per skill with Cursor's 3-key frontmatter; windsurf emits one
\`.windsurf/rules/<id>.md\` per skill with Windsurf's \`trigger\`/\`description\` frontmatter).
`;
}

/** The same instructions packaged as a loadable Claude Code skill. */
function generateDriverSkill(): string {
  return `---
name: dz-harness-driver
description: >
  Operating instructions for the dz-harness-hub CLI (@dzhechkov/harness-cli). Load this when
  asked to install/manage AI skills, set up a project with dz, benchmark a skill, or pick
  the right preset. Tells you which dz command to run and the rules for driving the toolkit.
  Triggers on: "dz setup", "install skills", "benchmark skill", "which preset", "dz recommend".
trust_tier: 0
trust_tier_label: "Reference"
---

${generateDriverInstructions()}
`;
}

/**
 * Write the driver docs non-destructively. New files are created; an existing
 * CLAUDE.md/AGENTS.md gets a marked section appended only if not already present.
 * Returns a short detail string for the setup step.
 */
function installDriverDocs(projectRoot: string, force: boolean): string {
  const written: string[] = [];
  const skipped: string[] = [];

  // 1. The loadable skill (own directory — always safe to write/refresh)
  const skillDir = join(projectRoot, '.claude', 'skills', 'dz-harness-driver');
  const skillPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillPath) || force) {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillPath, generateDriverSkill());
    written.push('skill');
  } else {
    skipped.push('skill');
  }

  // 2. Standalone agent docs — create only if absent (never clobber the user's).
  const instructions = generateDriverInstructions();
  for (const name of ['AGENTS.md', 'GEMINI.md']) {
    const p = join(projectRoot, name);
    if (!existsSync(p)) {
      writeFileSync(p, instructions);
      written.push(name);
    } else {
      skipped.push(name);
    }
  }

  // 3. CLAUDE.md — append a marked block if the file lacks one (additive, idempotent).
  const claudePath = join(projectRoot, 'CLAUDE.md');
  const block = `\n${DRIVER_MARKER_START}\n\n${instructions}\n${DRIVER_MARKER_END}\n`;
  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, block.trimStart());
    written.push('CLAUDE.md');
  } else {
    const existing = readFileSync(claudePath, 'utf-8');
    if (!existing.includes(DRIVER_MARKER_START)) {
      writeFileSync(claudePath, existing + block);
      written.push('CLAUDE.md(appended)');
    } else {
      skipped.push('CLAUDE.md');
    }
  }

  const parts: string[] = [];
  if (written.length) parts.push(`wrote ${written.join(', ')}`);
  if (skipped.length) parts.push(`skipped ${skipped.join(', ')}`);
  return parts.join('; ') || 'no changes';
}

export function runSetup(opts: SetupOptions): SetupResult {
  const steps: SetupStep[] = [];
  const dzDir = join(opts.projectRoot, '.dz');
  const backend: MemoryBackend = opts.memory ?? 'jsonl';

  // Step 0: Install agentdb + better-sqlite3 locally so the session-hook writer can import them
  // and share a native store with the MCP server. Best-effort — the writer self-degrades to a
  // jsonl marker (and self-heals once the deps exist) if this fails.
  if (backend === 'agentdb') {
    const ready = installAgentdbLocally(opts.projectRoot);
    if (ready) {
      steps.push({ name: 'Install agentdb + better-sqlite3', status: 'done', detail: 'local deps for real vector writes' });
    } else {
      steps.push({
        name: 'Install agentdb + better-sqlite3',
        status: 'error',
        detail: 'install failed — hooks log to sessions.jsonl until you run: npm i agentdb better-sqlite3',
      });
    }
  }

  // Step 1: Create .dz directory
  if (!existsSync(dzDir)) {
    mkdirSync(dzDir, { recursive: true });
    steps.push({ name: 'Create .dz directory', status: 'done', detail: dzDir });
  } else {
    steps.push({ name: 'Create .dz directory', status: 'skipped', detail: 'already exists' });
  }

  // Step 2: Write .dz/config.json
  const configPath = join(dzDir, 'config.json');
  if (!existsSync(configPath) || opts.force) {
    writeFileSync(configPath, generateDzConfig(opts.target, opts.preset, backend));
    steps.push({ name: 'Write .dz/config.json', status: 'done', detail: `${backend} backend` });
  } else {
    steps.push({ name: 'Write .dz/config.json', status: 'skipped', detail: 'already exists (use --force)' });
  }

  // Step 3: Initialize session log
  const sessionsPath = join(dzDir, 'sessions.jsonl');
  if (!existsSync(sessionsPath)) {
    writeFileSync(sessionsPath, '');
    steps.push({ name: 'Initialize sessions.jsonl', status: 'done', detail: 'session tracking ready' });
  } else {
    steps.push({ name: 'Initialize sessions.jsonl', status: 'skipped', detail: 'already exists' });
  }

  // Step 4: Initialize memory store
  if (backend === 'agentdb') {
    // Write the session-hook writer. The agentdb.db store itself is auto-created on first write
    // by createDatabase() (both the writer and the MCP server init the schema), so there is no
    // orphan placeholder file — the writer targets the real, shared native store.
    const writerPath = join(dzDir, 'agentdb-writer.mjs');
    // Regenerate when missing, forced, OR the deployed stamp is older than the current
    // generator — deployed writers must not fossilize outside the package lifecycle (gap G4).
    const deployedVersion = existsSync(writerPath) ? writerVersionOf(readFileSync(writerPath, 'utf-8')) : -1;
    if (deployedVersion === -1 || opts.force || deployedVersion < AGENTDB_WRITER_VERSION) {
      writeFileSync(writerPath, generateAgentdbWriter(opts.projectRoot));
      steps.push({
        name: 'Write agentdb-writer.mjs',
        status: 'done',
        detail: deployedVersion > -1 && deployedVersion < AGENTDB_WRITER_VERSION
          ? `upgraded v${deployedVersion} → v${AGENTDB_WRITER_VERSION}`
          : `session telemetry writer v${AGENTDB_WRITER_VERSION}`,
      });
    } else {
      steps.push({ name: 'Write agentdb-writer.mjs', status: 'skipped', detail: `current (v${deployedVersion})` });
    }
    // Keep the jsonl fallback log available for the writer's degraded path.
    const sessionsPath = join(dzDir, 'sessions.jsonl');
    if (!existsSync(sessionsPath)) writeFileSync(sessionsPath, '');
  } else {
    // JSONL backend
    const sessionsPath = join(dzDir, 'sessions.jsonl');
    if (!existsSync(sessionsPath)) {
      writeFileSync(sessionsPath, '');
      steps.push({ name: 'Initialize sessions.jsonl', status: 'done', detail: 'session tracking ready' });
    } else {
      steps.push({ name: 'Initialize sessions.jsonl', status: 'skipped', detail: 'already exists' });
    }
    const patternsPath = join(dzDir, 'patterns.jsonl');
    if (!existsSync(patternsPath)) {
      writeFileSync(patternsPath, '');
      steps.push({ name: 'Initialize patterns.jsonl', status: 'done', detail: 'pattern learning ready' });
    } else {
      steps.push({ name: 'Initialize patterns.jsonl', status: 'skipped', detail: 'already exists' });
    }
  }

  // Step 5: Configure hooks (write to .claude/settings.json) — EVENT-LEVEL merge (gap G2):
  // dz-generated entries (recognized by signature, incl. the broken legacy `agentdb add` hooks
  // this feature fixes) are replaced in place WITHOUT --force; the user's own hooks and every
  // other settings key are preserved. Full-file overwrite happens only when the file is absent.
  if (!opts.noHooks) {
    const settingsDir = join(opts.projectRoot, '.claude');
    const settingsPath = join(settingsDir, 'settings.json');
    const generated = JSON.parse(generateHooksConfig(opts.projectRoot, backend)) as {
      hooks: Record<string, { hooks: { type: string; command: string; runInBackground?: boolean }[] }[]>;
    };

    if (!existsSync(settingsPath)) {
      mkdirSync(settingsDir, { recursive: true });
      writeFileSync(settingsPath, JSON.stringify({ hooks: generated.hooks }, null, 2));
      steps.push({ name: 'Configure hooks', status: 'done', detail: `${backend} session hooks` });
    } else {
      try {
        const existing = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
        // ONE merge implementation, shared with the Codex target (AM-3 / G-E). The Claude path's
        // historical SUBSTRING attribution is passed IN verbatim rather than reimplemented, so the
        // emitted bytes, the report tail string and the no-write path all stay identical (AM-37).
        const plan = mergeManagedHookEntries(
          (existing['hooks'] ?? {}) as Record<string, unknown[]>,
          generated.hooks as unknown as Record<string, unknown[]>,
          {
            // Drop dz-generated entries (any vintage, either shape) — keep the user's own hooks
            // untouched. Flat dz entries (≤0.3.43) are dropped too, migrating them to the valid
            // matcher-group shape appended below.
            isManaged: (entry) =>
              commandsOf(entry).some(
                (cmd) => cmd.includes('agentdb add') || cmd.includes('agentdb-writer.mjs') || cmd.includes('sessions.jsonl'),
              ),
            isLegacy: (entry) =>
              !Array.isArray((entry as { hooks?: unknown[] })?.hooks) ||
              commandsOf(entry).some((cmd) => cmd.includes('agentdb add')),
            reportLabel: backend,
          },
        );
        if (plan.changed) {
          existing['hooks'] = plan.hooks;
          writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
          steps.push({ name: 'Configure hooks', status: 'done', detail: plan.report });
        } else {
          steps.push({ name: 'Configure hooks', status: 'skipped', detail: plan.report });
        }
      } catch {
        steps.push({ name: 'Configure hooks', status: 'error', detail: 'could not parse existing settings.json — fix it and re-run' });
      }
    }
  } else {
    steps.push({ name: 'Configure hooks', status: 'skipped', detail: '--no-hooks' });
  }

  // Step 5.5: Register agentdb MCP through the SAME ownership-aware transaction used by `dz init`.
  // `.mcp.json` is the project-scope carrier Claude Code actually loads. A known historical dz
  // agentdb shape is adopted; an ambiguous hand-authored entry is preserved and named as an error.
  if (backend === 'agentdb') {
    const agentdbEntry = {
      command: 'npx',
      // Pin to the INSTALLED agentdb version (not @latest) so the MCP server and the hook
      // writer run the same alpha schema against one DB.
      args: [installedAgentdbSpec(opts.projectRoot), 'mcp', 'start'],
      // Pin the server to its OWN store — NEVER the writer's .dz/agentdb.db. Two engines on one
      // SQLite file (native better-sqlite3 + a silent sql.js fallback) whole-file-rewrite each
      // other: measured 2026-07-09, 5 of 20 samples zero bytes and 4 torn (ADR-001, 2026-08-26).
      env: { AGENTDB_PATH: agentdbMcpStorePath(opts.projectRoot) },
    };
    try {
      const applied = applyIntegrationFragments({
        projectRoot: opts.projectRoot,
        fragments: [{
          component: 'mcp',
          carrierPath: '.mcp.json',
          scope: 'project',
          format: 'json',
          rootKey: 'mcpServers',
          entries: { agentdb: agentdbEntry },
        }],
      });
      if (applied.written.includes('.mcp.json')) {
        steps.push({
          name: 'Register agentdb MCP',
          status: 'done',
          // No tool count: a hardcoded number is a lie waiting to age (the live server answered
          // 35 while its own banner said 32 and the README said 41 — measured 2026-08-26).
          detail: `.mcp.json: ${installedAgentdbSpec(opts.projectRoot)} → .dz/agentdb-mcp.db (own store; hooks keep .dz/agentdb.db)`,
        });
      } else {
        steps.push({ name: 'Register agentdb MCP', status: 'skipped', detail: 'already registered and current' });
      }
    } catch (error) {
      const reason = error instanceof IntegrationApplyError ? error.reasonCode : 'APPLY_FAILED';
      const detail = error instanceof Error ? error.message : String(error);
      steps.push({ name: 'Register agentdb MCP', status: 'error', detail: `${reason}: ${detail}` });
    }
    // Migrate off the legacy location: `.claude/mcp.json` is not loaded by Claude Code. If it
    // holds ONLY our old agentdb registration, remove the file; otherwise leave it and warn.
    const legacyPath = join(opts.projectRoot, '.claude', 'mcp.json');
    if (existsSync(legacyPath)) {
      try {
        const legacy = JSON.parse(readFileSync(legacyPath, 'utf-8')) as { mcpServers?: Record<string, unknown> };
        const keys = Object.keys(legacy.mcpServers ?? {});
        if (keys.length === 1 && keys[0] === 'agentdb') {
          rmSync(legacyPath);
          steps.push({ name: 'Migrate legacy .claude/mcp.json', status: 'done', detail: 'removed (not loaded by Claude Code); registration now in .mcp.json' });
        } else {
          steps.push({ name: 'Migrate legacy .claude/mcp.json', status: 'error', detail: 'contains other servers — Claude Code does NOT load this file; move them to .mcp.json' });
        }
      } catch {
        steps.push({ name: 'Migrate legacy .claude/mcp.json', status: 'error', detail: 'unparseable legacy file — Claude Code does not load it; review manually' });
      }
    }
  }

  // Step 5.9: agentdb wiring invariant check (audit code#3). Skip-branches across repeated runs
  // can leave inconsistent combinations (e.g. writer+MCP present but hooks still jsonl). Verify
  // the three-way invariant explicitly and surface a loud error step instead of silent "skipped"s.
  if (backend === 'agentdb' && !opts.noHooks) {
    const problems: string[] = [];
    if (!isAgentdbInstalledLocally(opts.projectRoot)) problems.push('deps missing (npm i agentdb better-sqlite3)');
    try {
      const settings = JSON.parse(readFileSync(join(opts.projectRoot, '.claude', 'settings.json'), 'utf-8')) as {
        hooks?: Record<string, unknown[]>;
      };
      const refs = ['SessionStart', 'SessionEnd', 'PreCompact'].every((ev) =>
        (settings.hooks?.[ev] ?? []).some((h) => commandsOf(h).some((cmd) => cmd.includes('agentdb-writer.mjs'))));
      if (!refs) problems.push('hooks do not invoke the writer (SessionStart/SessionEnd/PreCompact)');
    } catch {
      problems.push('settings.json unreadable');
    }
    try {
      const mcp = JSON.parse(readFileSync(join(opts.projectRoot, '.mcp.json'), 'utf-8')) as {
        mcpServers?: Record<string, { env?: Record<string, string> }>;
      };
      // Separation is the REQUIRED state; a shared store is the error (inverted 2026-08-26).
      const sep = agentdbStoreSeparationProblem(opts.projectRoot, mcp.mcpServers?.['agentdb']?.env?.['AGENTDB_PATH']);
      if (sep) problems.push(sep);
    } catch {
      problems.push('.mcp.json unreadable');
    }
    steps.push(problems.length === 0
      ? { name: 'agentdb wiring', status: 'done', detail: 'hooks → writer → .dz/agentdb.db   ·   MCP → .dz/agentdb-mcp.db (separate stores, by design)' }
      : { name: 'agentdb wiring', status: 'error', detail: `INCOMPLETE: ${problems.join('; ')}` });
  }

  // Step 6: Update .gitignore. Append only the ENTRIES that are actually missing — a single
  // sentinel check (e.g. sessions.jsonl, present in both backends) would skip agentdb.db/-wal/-shm
  // on the documented jsonl→agentdb `--force` switch, leaking the binary store into git.
  const gitignorePath = join(opts.projectRoot, '.gitignore');
  const dzIgnoreLines = backend === 'agentdb'
    ? ['.dz/agentdb.db', '.dz/agentdb.db-wal', '.dz/agentdb.db-shm',
       '.dz/agentdb-mcp.db', '.dz/agentdb-mcp.db-wal', '.dz/agentdb-mcp.db-shm',
       '.dz/sessions.jsonl']
    : ['.dz/sessions.jsonl', '.dz/patterns.jsonl'];
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const missing = dzIgnoreLines.filter((line) => !existing.split(/\r?\n/).includes(line));
  if (missing.length > 0) {
    const prefix = existing === '' ? '' : (existing.endsWith('\n') ? '' : '\n');
    const block = `${prefix}\n# DZ Harness learning data\n${missing.join('\n')}\n`;
    writeFileSync(gitignorePath, existing + block);
    steps.push({
      name: existsSync(gitignorePath) && existing !== '' ? 'Update .gitignore' : 'Create .gitignore',
      status: 'done',
      detail: `added ${missing.join(', ')}`,
    });
  } else {
    steps.push({ name: 'Update .gitignore', status: 'skipped', detail: 'already ignoring .dz data' });
  }

  // Step 7: Install the CLI-driver skill + agent docs (--install-driver)
  if (opts.installDriver) {
    const detail = installDriverDocs(opts.projectRoot, opts.force ?? false);
    steps.push({ name: 'Install driver skill', status: 'done', detail });
  }

  return {
    steps,
    totalSteps: steps.length,
    completed: steps.filter((s) => s.status === 'done').length,
    skipped: steps.filter((s) => s.status === 'skipped').length,
  };
}
