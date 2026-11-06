#!/usr/bin/env node
// cloudru-ssh-guard — PreToolUse veto hook (Claude Code contract), ported from the
// upstream hooks/cloudru-ssh-guard.py per ADR-004 Decision 2(a).
//
// Contract differences vs the Hermes original (all three MEASURED in 00_research/02 §C? / 01 §7):
//   matcher        : tool_name === "Bash"      (Hermes: "terminal")
//   veto mechanism : exit 2 + stderr message   (Hermes: {"action":"block"} on stdout)
//   payload        : {tool_name, tool_input:{command}} on stdin (same shape, different names)
//
// Additionally guards mcp__cloudru-vm__k8s_kubectl (ADR-004 Decision 2(b)): kubectl
// `rollout` with any sub-verb other than status|history mutates production without the
// engine's confirmed-gate (MEASURED upstream hole, 05 §2.3) — deny here, independent of
// any upstream fix (two independent belts, ADR-010 Consequences).
//
// Fail-open ONLY for unparseable input (a broken hook must not brick every Bash call);
// a PARSED paid-step command is always answered deterministically. Exit codes:
//   0 = allow, 2 = deny (stderr explains to the model).
'use strict';

function readStdin() {
  const fs = require('fs');
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** @returns {string|null} deny reason, or null to allow */
function decide(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const tool = String(payload.tool_name || '');
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};

  if (tool === 'Bash') {
    const cmd = String(input.command || '');
    // Port of the two upstream regexes, verbatim semantics (ADR-004: "регэкспы переносятся как есть").
    if (/sshpass/.test(cmd) && /@\d+\.\d+\.\d+\.\d+/.test(cmd)) {
      return 'Парольный SSH (sshpass) к Cloud.ru ВМ запрещён. Ключ на ВМ ЕСТЬ — движок кладёт его сам. Возьми ssh-команду из ответа deploy_apply ДОСЛОВНО (в ней уже -i <deploy key>).';
    }
    if (/\bssh\b[^\n|;&]*\buser1@\d+\.\d+\.\d+\.\d+/.test(cmd) && !cmd.includes(' -i ')) {
      return 'SSH к Cloud.ru ВМ без деплой-ключа (-i) запрещён. Возьми ssh-команду из ответа deploy_apply ДОСЛОВНО: в ней уже -i <deploy key>.';
    }
    return null;
  }

  // ADR-004 2(b): close the measured `rollout` classification hole on OUR side.
  if (/^mcp__cloudru[-_]vm__k8s_kubectl$/.test(tool)) {
    const args = String(input.args || input.command || '');
    const m = /(?:^|\s)rollout\s+([a-z-]+)/.exec(args);
    if (m && m[1] !== 'status' && m[1] !== 'history') {
      return `kubectl rollout ${m[1]} мутирует прод без подтверждения (измеренная дыра классификатора движка). Разрешены только rollout status|history; для мутации получи явное "да" пользователя и вызови мутирующий тул с confirmed=true.`;
    }
    return null;
  }

  return null;
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write('cloudru-ssh-guard: PreToolUse veto hook — reads {tool_name, tool_input} JSON on stdin; exit 0 = allow, exit 2 = deny (reason on stderr).\n');
    process.exit(0);
  }
  let payload = null;
  try {
    payload = JSON.parse(readStdin());
  } catch {
    process.exit(0); // unparseable input: never brick the session (matches upstream behaviour)
  }
  const reason = decide(payload);
  if (reason) {
    process.stderr.write('⛔ ' + reason + '\n');
    process.exit(2);
  }
  process.exit(0);
}

if (require.main === module) main();
module.exports = { decide };
