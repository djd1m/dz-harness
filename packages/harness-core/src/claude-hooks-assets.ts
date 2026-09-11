/**
 * The Claude-side destructive-command guard, as an INSTALLABLE asset
 * (feature `destructive-command-guard`, task T8, cross-family review round 3, finding P1-1).
 *
 * ## Why this file exists
 *
 * The guard shipped as one file committed at this repository's root, registered in this
 * repository's `.claude/settings.json`. MEASURED 2026-09-05, running the documented command in a
 * clean project — `dz setup --target claude-code --project <tmp>`:
 *   the written `.claude/settings.json` carries SessionStart / SessionEnd / PreCompact and no
 *   `PreToolUse` key at all, and `.claude/hooks/` does not exist.
 * So the advertised Claude-side guard protected exactly one checkout: ours. A guard that only ever
 * guards its author is a demo.
 *
 * Setup therefore has to install BOTH halves into the consumer project — the body and the registry
 * entry — and the body must come from the INSTALLED package, never from a path inside our
 * repository, which a consumer does not have.
 *
 * ## Why the body carries an absolute path
 *
 * The emitted hook runs from `<consumer>/.claude/hooks/`, where `require('@dzhechkov/harness-core')`
 * cannot resolve: Node resolves a bare specifier upward from the FILE, and the package is not above
 * that file in a global install. The body therefore resolves by PATH, and the LAST candidate is the
 * absolute location of the installation that emitted it (see `harness-core-location.ts` for the
 * measurement that forced this). Project-local candidates come FIRST, so a consumer that installed
 * harness-core itself keeps using its own copy and is never pinned to ours.
 *
 * The generated text is behaviourally identical to this repository's own
 * `.claude/hooks/destructive-guard.cjs`, and a test drives BOTH bodies through the same matrix
 * rather than trusting that they stayed alike.
 *
 * @packageDocumentation
 */

import { harnessCoreDistDir } from './harness-core-location.js';

/** Bump when the emitted BODY changes. Unlike Codex, Claude has no trust gate — this is provenance. */
// Поднято до 2 (2026-09-08, фича guard-narrow-unarmed-refusal): урезанный режим меняет наблюдаемое
// поведение хука у ПОТРЕБИТЕЛЯ. Без подъёма версии установленный хук остаётся старым, блокирующим
// любую команду в дереве без решателя, и починка до него не доезжает — находка QE major #1.
export const DZ_CLAUDE_HOOK_VERSION = 2;

/**
 * The OWNERSHIP marker. A file carrying this line is one dz wrote and may replace; a file without it
 * belongs to the consumer and is never overwritten without `--force`.
 *
 * MEASURED 2026-09-05, before this existed: a hand-authored
 * `.claude/hooks/destructive-guard.cjs` was replaced by a routine `dz setup` run, no `--force`
 * involved — the one path in setup that was not additive. Ownership is asserted by a MARKER rather
 * than by a hash of the bytes we wrote, because an UPGRADE must still be able to replace an older
 * dz body; the cost of that choice is stated in the emitted file itself, on the marker line.
 */
export const CLAUDE_DESTRUCTIVE_HOOK_MARKER = 'dz-managed-hook: destructive-guard';

/** Is this file body one dz owns? Absence of the marker is the consumer's claim to the file. */
export function isDzManagedHookBody(body: string): boolean {
  return body.includes(CLAUDE_DESTRUCTIVE_HOOK_MARKER);
}

/** Where the body is installed inside a consumer project, and what the registry entry points at. */
export const CLAUDE_DESTRUCTIVE_HOOK_RELPATH = '.claude/hooks/destructive-guard.cjs';

/**
 * The command Claude Code runs — the EXACT documented placeholder, never a shell-only variant.
 *
 * Relative to the project rather than absolute: the settings file is committed by consumers and
 * shared across machines, and an absolute path in it breaks for every collaborator. The BODY may
 * carry an absolute fallback because it is generated per machine; the SETTINGS entry may not.
 *
 * WHY THE EXACT TOKEN [DOC, code.claude.com/docs/en/hooks, read 2026-09-06]. `${CLAUDE_PROJECT_DIR}`
 * is a PLACEHOLDER Claude Code substitutes itself — "Use these placeholders to reference hook
 * scripts relative to the project or plugin root, regardless of the working directory when the hook
 * runs: ${CLAUDE_PROJECT_DIR}: the project root where the session started" — and the documentation
 * describes NO default syntax. The previous `${CLAUDE_PROJECT_DIR:-.}` is therefore not the
 * placeholder at all; it worked only where a POSIX shell happened to expand the variable, and on a
 * host where Claude Code's own substitution is what fills the token in, it stays literal and the
 * hook cannot be found. NOT REPRODUCED LIVE: there is no Windows host here, so the Windows half of
 * this is documentation plus the reviewer's report, not a measurement of mine.
 *
 * MEASURED here (POSIX `sh`, 2026-09-06), which is the part that IS checkable: with the variable
 * set the two forms are identical (`/tmp/x/p`); with it unset the exact token yields `/p` while the
 * old form yielded `./p`. So on the only path this change can degrade — a hand-run command with no
 * variable and no substitution — the failure is a loud "cannot find module", never a silent pass.
 * The fallback that matters (finding the DECIDER) lives inside the body, where it can actually run.
 */
export const CLAUDE_DESTRUCTIVE_HOOK_COMMAND =
  'node "${CLAUDE_PROJECT_DIR}/' + CLAUDE_DESTRUCTIVE_HOOK_RELPATH + '"';

/** The PreToolUse matcher. Bash only — the decider skips every other tool without reading it. */
export const CLAUDE_DESTRUCTIVE_HOOK_MATCHER = '^Bash$';

export interface ClaudeHookAssetOptions {
  /**
   * Absolute directory holding the BUILT harness-core modules, baked in as the last resort.
   * Defaults to the installation generating the file. `null` omits it — used for a body that is
   * committed to a repository, where a machine-specific path would be wrong for everyone else.
   */
  readonly installedDistDir?: string | null | undefined;
}

/**
 * The emitted `.claude/hooks/destructive-guard.cjs`.
 *
 * Thin by contract: read stdin, hand the payload to `decideDestructiveHook`, print, exit. Runtime
 * failures of ours exit 0 with one loud line. Without the decision module, only literal recursive
 * deletion is refused; every other request passes with an explicit partial-protection warning.
 */
export function generateClaudeDestructiveHook(opts: ClaudeHookAssetOptions = {}): string {
  const installed = opts.installedDistDir === undefined ? harnessCoreDistDir() : opts.installedDistDir;
  const bakedLine =
    installed === null
      ? '  // No installed path was baked in (a body committed to a repository): project-local only.\n'
      : `  candidates.push(${JSON.stringify(installed)} + '/destructive-guard-hook.js'); // the installation that emitted this file\n`;

  return `#!/usr/bin/env node
// GENERATED by @dzhechkov/harness-core — dz-claude-hook-version: ${DZ_CLAUDE_HOOK_VERSION}
// ${CLAUDE_DESTRUCTIVE_HOOK_MARKER}
// Do not edit: this marker line is what tells dz the file is ITS OWN, so dz rewrites it on the next
// 'dz setup --target claude-code'. Delete the marker line to claim the file: dz then leaves it
// alone and only '--force' replaces it, after a timestamped backup.
//
// PreToolUse guard on Bash: a deletion by a LITERAL path into a protected store never runs.
// The full policy — the three outcomes, the refusal text, the limits the guard must name — lives
// in @dzhechkov/harness-core (destructive-guard.js classifies, destructive-guard-hook.js decides).
// The same module decides for the Codex host, so both runtimes refuse the same commands in the
// same words.
'use strict';

const path = require('node:path');
const { writeSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

/**
 * Load the decision module by PATH, project-local first, then the installation that emitted this
 * file. 'import()' and never 'require()': harness-core is "type": "module", and require() of an ES
 * module throws ERR_REQUIRE_ESM below Node 20.19 / 22.12 — which used to be caught and turned into
 * a silent allow.
 */
async function loadDecider() {
  // CLAUDE_PROJECT_DIR when the host set it, else this file's own location. The env var is the
  // host's own statement of where the project root is; __dirname is what still works when nobody
  // said anything, including when this hook is run by hand.
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
  // DZ_GUARD_TRUSTED_ONLY is set by 'dz setup' while it certifies this file. The probe SPAWNS the
  // hook, so with project-local candidates first it would import — and execute the top level of —
  // whatever a cloned repository committed at packages/@dzhechkov/harness-core/dist/, during setup
  // and outside the host's hook-trust flow. The receipt must certify the TRUSTED installation, so
  // for the probe the project's own copies are switched off. At RUNTIME they stay first: a project
  // that ships its own harness-core is exactly who should decide there.
  const trustedOnly = process.env.DZ_GUARD_TRUSTED_ONLY === '1';
  const candidates = trustedOnly ? [] : [
    path.join(projectRoot, 'node_modules', '@dzhechkov', 'harness-core', 'dist', 'destructive-guard-hook.js'),
    path.join(projectRoot, 'packages', '@dzhechkov', 'harness-core', 'dist', 'destructive-guard-hook.js'),
  ];
${bakedLine}  const failures = [];
  for (const candidate of candidates) {
    try {
      const mod = await import(pathToFileURL(candidate).href);
      const decide = mod.decideDestructiveHook || (mod.default && mod.default.decideDestructiveHook);
      if (typeof decide === 'function') return { decide: decide, reason: null };
      failures.push(candidate + ': загружен, но decideDestructiveHook не экспортирован');
    } catch (err) {
      const code = (err && err.code) || 'ERR_UNKNOWN';
      failures.push(candidate + ': ' + code + ' ' + String((err && err.message) || err));
    }
  }
  return { decide: null, reason: failures.join(' | ').replace(/\\s*\\n\\s*/g, ' ') };
}

let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch (_) {
    payload = null; // handed over as-is: the decider owns the "unreadable" wording too.
  }
  loadDecider().then(
    (loaded) => onDecider(loaded, payload),
    (err) => failOpen('страж опасных команд не смог загрузиться: ' + String((err && err.message) || err)),
  );
});

/** One line, exit 0. Every failure of OURS ends here — loudly, and never as a refusal. */
function failOpen(what) {
  process.stderr.write(
    'DZ-DESTRUCTIVE-WARN: ' + String(what).replace(/\\s*\\n\\s*/g, ' ') + ' — команда ПРОПУЩЕНА без проверки.\\n',
  );
  process.exit(0);
}

/** Textual literal check only: no quoting, expansion or nested-shell parsing. */
function failUnarmed(reason, payload) {
  const command = payload && ['Bash', 'bash', 'shell', 'local_shell'].includes(payload.tool_name) &&
    payload.tool_input && typeof payload.tool_input.command === 'string' ? payload.tool_input.command : '';
  const literalRecursive = /(?:^|[\\s;&|()])rm[ \\t]+(?:(?:-[a-zA-Z]+|--[a-z-]+)[ \\t]+)*(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(?=[ \\t])/;
  // Инструмент не из семейства Bash страж не судит НИ В ОДНОМ режиме, поэтому и предупреждать тут
  // не о чем: в полном режиме такой вызов пропускается молча. Предупреждение обязано означать
  // «я не смог рассудить КОМАНДУ ОБОЛОЧКИ», иначе оно станет фоном и перестанет читаться
  // (риск R5 шага 3.5) — находка QE minor #3.
  if (command === '') process.exit(0);
  const refuse = literalRecursive.test(command);
  const line = (refuse
    ? 'DZ-DESTRUCTIVE: урезанный режим — буквальное рекурсивное удаление; команда НЕ ВЫПОЛНЕНА. '
    : 'DZ-DESTRUCTIVE-WARN: урезанный режим, защита частичная — проверено только буквальное рекурсивное удаление, без разбора оболочки; команда ПРОПУЩЕНА. ') +
    'Для полной защиты нужен решатель. Причина: ' + String(reason).replace(/\\s*\\n\\s*/g, ' ') +
      ' Починка: npm install -g @dzhechkov/harness-cli@latest, затем dz setup --target claude-code.\\n';
  // Hook stderr is a pipe under the host and under spawnSync. An immediate process.exit can drop a
  // buffered write entirely, so write this installation verdict synchronously before exiting.
  writeSync(2, line);
  process.exit(refuse ? 2 : 0);
}

function onDecider(loaded, payload) {
  const decide = loaded.decide;
  if (decide === null) {
    failUnarmed(loaded.reason, payload);
    return;
  }

  let out = '';
  let code = 0;
  try {
    const decision = decide(payload, 'claude');
    if (!decision || typeof decision.stderr !== 'string') {
      throw new TypeError('решение стража нечитаемо: ' + JSON.stringify(decision));
    }
    out = decision.stderr;
    code = decision.exitCode === 2 ? 2 : 0; // 2 = block the call and show the reason.
  } catch (err) {
    failOpen('страж опасных команд упал (' + String((err && err.message) || err) + ')');
    return;
  }

  if (out !== '') process.stderr.write(out);
  process.exit(code);
}
`;
}
