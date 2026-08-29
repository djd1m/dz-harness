// SPDX-License-Identifier: MIT
//
// Authoring-time claim-check HOOK POLICY — the pure decision core behind the
// `.claude/helpers/claim-check-hook.cjs` PreToolUse hook (feature: claim-check-authoring-time).
//
// This module does NOT re-implement or fork detection. It is a thin severity-POLICY layer over the
// FROZEN engine in `./claim-check.ts` (`claimCheck`): it runs `claimCheck(text)` and turns the
// findings into a hook decision. Its whole job is to resolve the ADR's core tension — a `high`
// finding (the retracted `100%`/`perfect` framing) must be surfaced, yet an agent legitimately
// QUOTING that framing while documenting the checker must NEVER be blocked, and the escape (backtick
// the literal) must be DISCOVERABLE from the output.
//
// Resolution (ADR Option A1):
//   • DEFAULT policy (`mode !== 'deny'`) NEVER returns `action:'deny'` — provable by construction, not
//     just by test. This is the load-bearing property NFR-1 names: the hook never blocks the agent.
//   • Every message ALWAYS teaches the backtick escape, so an agent that trips a `high` learns the
//     one-keystroke fix in the same turn and does not thrash.
//   • Opt-in strict mode (`mode:'deny'`) MAY deny a `high` finding, but only when it is (c) NOT inside
//     a fenced code block AND (d) a genuinely NEW line (an excerpt not already present in the Edit's
//     pre-image). Any ambiguity/parse difficulty in the guards falls back to `allow` — never a
//     spurious deny.
//
// Pure, never-throw, no I/O — all reading of stdin / files lives in the `.cjs` adapter, mirroring how
// the `dz claim-check` CLI and `dz publish` gate are thin adapters over the pure engine.
import { claimCheck } from './claim-check.js';
/**
 * The backtick-escape teaching, appended to EVERY finding report. This is the "escape discoverable
 * from the hook's own output" acceptance criterion — an agent that trips a finding while documenting
 * honesty is told exactly how to comply.
 */
export const ESCAPE_TEACHING = 'If a flagged line is legitimately QUOTING a forbidden claim as an example, wrap the literal in ' +
    'backticks (e.g. a backticked `100% coverage`) — a backticked span reads as a code literal, not an ' +
    'assertion, and is not flagged. That is the fix; do NOT weaken the checker. Otherwise state a ' +
    'measured number vs a baseline, tagged MEASURED and naming a reproducer (npx vitest run, coverage report).';
/** claimCheck is already never-throw; wrap defensively so hookDecision is never-throw even on abuse. */
function safeClaimCheck(text) {
    try {
        return claimCheck(text);
    }
    catch {
        return { ok: true, findings: [] };
    }
}
function safeBool(fn, fallback) {
    try {
        return fn();
    }
    catch {
        return fallback;
    }
}
function formatFinding(f) {
    return '  - L' + f.line + ': "' + f.excerpt + '" — ' + f.reason + ' -> ' + f.suggestion;
}
/**
 * Is the 1-based `line` inside a fenced code block within `text`?
 *
 * MOVED to `claim-check.ts` and re-exported here. The engine skips fenced lines and this hook exempts
 * them from its deny path — if the two ever computed "inside a fence" differently, the hook would deny
 * a line the engine had already dismissed, or vice versa. Two implementations WILL drift; one cannot.
 * The engine owns it because the engine is the pure module with no dependents.
 */
import { isFenced } from './claim-check.js';
export { isFenced };
/**
 * Is `excerpt` a NEW claim line (guard d)? True when there is no pre-image (`oldString` absent/empty —
 * e.g. a `Write`) or the pre-image does not already contain the excerpt. A trailing clip ellipsis
 * (the engine clips excerpts to 120 chars) is stripped before the containment check so an edited-around
 * long pre-existing line is still recognised. Never throws.
 */
export function isNewLine(excerpt, oldString) {
    if (typeof oldString !== 'string' || oldString.length === 0)
        return true;
    if (typeof excerpt !== 'string' || excerpt.length === 0)
        return true;
    let probe = excerpt;
    if (probe.charAt(probe.length - 1) === '…')
        probe = probe.slice(0, -1);
    if (probe.length === 0)
        return true;
    return oldString.indexOf(probe) === -1;
}
/**
 * The pure hook decision. Runs the FROZEN `claimCheck` over the pending text and applies the severity
 * policy. NEVER throws. Under the DEFAULT policy (`mode !== 'deny'`) it NEVER returns `action:'deny'`
 * — there is no code path to a deny unless `mode === 'deny'` AND a `high` finding clears BOTH guards.
 */
export function hookDecision(text, opts) {
    const result = safeClaimCheck(text);
    if (!result || result.ok || !Array.isArray(result.findings) || result.findings.length === 0) {
        return { action: 'allow', additionalContext: null, systemMessage: null };
    }
    const denyEnabled = !!(opts && opts.mode === 'deny');
    const oldString = opts ? opts.oldString : undefined;
    const highs = result.findings.filter((f) => f.severity === 'high');
    const mediums = result.findings.filter((f) => f.severity === 'medium');
    const lines = [];
    if (highs.length > 0) {
        lines.push('claim-check flagged ' +
            highs.length +
            ' HIGH finding(s) — the retracted perfect/100% framing the Integrity Rule forbids:');
        for (const f of highs)
            lines.push(formatFinding(f));
    }
    if (mediums.length > 0) {
        lines.push('claim-check flagged ' + mediums.length + ' medium finding(s) — untagged accuracy/count claim(s):');
        for (const f of mediums)
            lines.push(formatFinding(f));
    }
    lines.push('');
    lines.push(ESCAPE_TEACHING);
    const additionalContext = lines.join('\n');
    // DEFAULT policy: never deny. A deny is reachable ONLY when denyEnabled AND a high finding clears
    // BOTH guards (outside a fence AND a new line). Any guard exception falls back to allow.
    let action = 'allow';
    if (denyEnabled && highs.length > 0) {
        const blockable = highs.filter((f) => {
            if (safeBool(() => isFenced(text, f.line), false))
                return false;
            return safeBool(() => isNewLine(f.excerpt, oldString), true);
        });
        if (blockable.length > 0)
            action = 'deny';
    }
    let systemMessage = null;
    if (highs.length > 0) {
        systemMessage =
            'claim-check: ' +
                highs.length +
                ' HIGH finding(s) (perfect/100% framing) — ' +
                (action === 'deny'
                    ? 'BLOCKED under DZ_CLAIM_CHECK_HOOK=deny. '
                    : 'warning, not a block (set DZ_CLAIM_CHECK_HOOK=deny to enforce). ') +
                'Backtick the literal to quote it as an example, or state a MEASURED number vs a baseline.';
    }
    return { action, additionalContext, systemMessage };
}
//# sourceMappingURL=claim-check-hook-policy.js.map