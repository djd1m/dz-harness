#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook — injects up to 3 most recent insights from
 * .claude/insights/index.md into Claude's initial session context (via stdout).
 *
 * Cross-platform: pure Node, no shell pipes. Silent on missing index.
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

const INDEX = path.resolve(ROOT, '.claude', 'insights', 'index.md');

try {
  if (!fs.existsSync(INDEX)) process.exit(0);
  const text = fs.readFileSync(INDEX, 'utf8');
  // Each insight starts with "## " heading (per insights-capture.md convention).
  const sections = text.split(/^## /m).filter(Boolean);
  const recent = sections.slice(-3).map((s) => '## ' + s.trim()).join('\n\n');
  if (recent.length > 0) {
    process.stdout.write('## Recent project insights\n\n' + recent + '\n');
  }
} catch (_err) {
  // Hook is advisory — never block the session on errors here.
  process.exit(0);
}
