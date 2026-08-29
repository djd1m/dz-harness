#!/usr/bin/env node
'use strict';

/**
 * state-update.cjs (v1.5.0) — write `.claude/.p-replicator-state.json`.
 *
 * Used by pipeline commands (/run, /go, /feature, /replicate) to publish
 * current command + phase + progress for the statusline to display.
 *
 * Usage:
 *   node .claude/hooks/state-update.cjs \
 *     --command /feature \
 *     --phase VALIDATE \
 *     --index 2 \
 *     --total 4 \
 *     --progress 0.5 \
 *     [--last-command /replicate] \
 *     [--last-feature auth-jwt]
 *
 * Or pass JSON in one arg:
 *   node .claude/hooks/state-update.cjs --json '{"currentCommand":"/run", ...}'
 *
 * Idempotent: overwrites the state file each call. Always exits 0 (best-effort).
 */

const fs = require('node:fs');
const path = require('node:path');

// The project root, never the process cwd: a `cd` inside any tool call moves cwd for the rest of
// the session, and these hooks are non-blocking, so a wrong anchor fails SILENTLY. CLAUDE_PROJECT_DIR
// first — the host is authoritative about what the project is. `__dirname` second: a hook always
// lives at <project>/.claude/hooks/<x>.cjs, so its own location settles the root with no cooperation
// from anyone, which is what keeps this working when the variable is absent (hand-run, older host).
const ENV_ROOT = process.env.CLAUDE_PROJECT_DIR;
// isAbsolute, not just truthy: a RELATIVE value would still be resolved against the drifting
// cwd, which is the very bug this anchor exists to remove.
const ROOT = (ENV_ROOT && path.isAbsolute(ENV_ROOT))
  ? ENV_ROOT
  : path.resolve(__dirname, '..', '..');

const STATE_FILE = path.resolve(ROOT, '.claude', '.p-replicator-state.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function main() {
  try {
    const args = parseArgs(process.argv);

    let state;
    if (args.json) {
      try { state = JSON.parse(args.json); }
      catch { state = {}; }
    } else {
      state = {
        currentCommand: args.command || null,
        currentPhase: args.phase ? {
          name: args.phase,
          index: args.index ? parseInt(args.index, 10) : null,
          total: args.total ? parseInt(args.total, 10) : null,
          progress: args.progress ? parseFloat(args.progress) : null,
        } : null,
        lastCommand: args['last-command'] || null,
        lastFeature: args['last-feature'] || null,
      };
    }

    state.updatedAt = new Date().toISOString();

    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (_err) {
    // Best-effort. Never fail the calling pipeline on state-write issues.
  }
}

main();
