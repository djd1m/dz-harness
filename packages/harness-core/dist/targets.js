/**
 * `--target` names → platform adapters.
 *
 * @packageDocumentation
 */
import { agentsMdAdapter } from '@dzhechkov/adapter-agents-md';
import { claudeAdapter } from '@dzhechkov/adapter-claude';
import { codexAdapter } from '@dzhechkov/adapter-codex';
import { copilotAdapter } from '@dzhechkov/adapter-copilot';
import { cursorAdapter } from '@dzhechkov/adapter-cursor';
import { geminiAdapter } from '@dzhechkov/adapter-gemini';
import { hermesAdapter } from '@dzhechkov/adapter-hermes';
import { opencodeAdapter } from '@dzhechkov/adapter-opencode';
import { openclaudeAdapter } from '@dzhechkov/adapter-openclaude';
import { windsurfAdapter } from '@dzhechkov/adapter-windsurf';
// Explicitly annotated (not `as const satisfies`) so the type is portable across
// the workspace — adapters compiled against slightly different `@dzhechkov/core`
// versions would otherwise make the inferred type un-nameable (TS2742).
export const TARGETS = {
    'claude-code': claudeAdapter,
    codex: codexAdapter,
    opencode: opencodeAdapter,
    hermes: hermesAdapter,
    openclaude: openclaudeAdapter,
    copilot: copilotAdapter,
    'agents-md': agentsMdAdapter,
    cursor: cursorAdapter,
    gemini: geminiAdapter,
    // windsurf: cursor with a different dir + `.md` extension + a `trigger`
    // frontmatter key. Per-skill transforming target (excluded from equivalence).
    windsurf: windsurfAdapter,
};
/** Every supported `--target` name. */
export const TARGET_NAMES = Object.keys(TARGETS);
/** Type guard: is `value` a supported `--target` name? */
export function isTargetName(value) {
    return Object.prototype.hasOwnProperty.call(TARGETS, value);
}
// ---------------------------------------------------------------------------
// `--target` resolution — alias table + did-you-mean (feature dz-cli-defects, D3)
//
// `isTargetName`, `TARGETS` and `TARGET_NAMES` above are UNCHANGED: `boundaries.json`
// names `isTargetName` as the scanned validation boundary for `--target`, and every
// resolution below ends in exactly that guard, so the security boundary is preserved
// rather than relocated (ADR-002 / architecture §3.1).
// ---------------------------------------------------------------------------
/** `TARGET_NAMES` sorted alphabetically, for display in error messages. */
export const TARGET_NAMES_SORTED = [...TARGET_NAMES].sort();
/**
 * Semantic `--target` aliases — DATA, not branching logic. Adding a row is one line
 * and zero control flow (ADR-002 §Rationale D5).
 *
 * Purely typographic variants (`Claude_Code`, `claudecode`, `agents.md`) are handled by
 * normalisation, not by rows; the rows below carry only meanings normalisation cannot
 * derive (`claude` ≠ `claude-code` by any string rule — it is an owner decision).
 */
export const TARGET_ALIASES = {
    claude: 'claude-code',
    cc: 'claude-code',
    agents: 'agents-md',
    gpt: 'codex',
    openai: 'codex',
};
/** Levenshtein suggestions are only offered at or below this edit distance. */
export const TARGET_SUGGESTION_MAX_DISTANCE = 3;
/**
 * Normalise a `--target` token for matching: byte-level lowercase (never
 * `toLocaleLowerCase` — behaviour must not vary with the host locale), trimmed, with
 * every separator dropped so `Claude_Code`, `claude-code` and `claudecode` collapse.
 *
 * Exported so the alias-REACHABILITY test can ask the production normaliser whether a
 * proposed alias row is already carried by precedence step 2, instead of keeping a
 * second copy of this rule in the test file (fix round 1, QE F7).
 */
export function normalizeTargetToken(value) {
    return value.trim().toLowerCase().replace(/[-_.\s]/g, '');
}
/** Iterative two-row Levenshtein. No dependency: harness-core ships no fuzzy matcher. */
function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    let curr = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i += 1) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
        }
        const swap = prev;
        prev = curr;
        curr = swap;
    }
    return prev[b.length] ?? 0;
}
/**
 * Suggest a canonical target for an input that did not resolve.
 *
 * Two legs, in order, and each closes a case the other cannot:
 *
 * - **unique normalised prefix** — carries `clau → claude-code`, which is edit distance 5
 *   and therefore unreachable by any sane Levenshtein threshold. An input that prefixes
 *   TWO OR MORE canonical names is AMBIGUOUS and terminates with **no** suggestion
 *   (`co` → `codex`/`copilot`): guessing between two live targets is worse than a
 *   round-trip, and the fall-through would otherwise hand `co` to `codex` on a distance
 *   of 3 — a confident answer to a question the user has not yet decided.
 * - **Levenshtein ≤ 3, strictly better than the runner-up** — carries the typo case
 *   `clade-code → claude-code`. A tie yields `null` for the same reason.
 */
function suggestTargetName(normalized) {
    if (normalized.length === 0)
        return null;
    const prefixHits = TARGET_NAMES_SORTED.filter((name) => normalizeTargetToken(name).startsWith(normalized));
    if (prefixHits.length === 1)
        return prefixHits[0] ?? null;
    // Ambiguous prefix is TERMINAL, not a fall-through (see doc comment).
    if (prefixHits.length > 1)
        return null;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let runnerUpDistance = Number.POSITIVE_INFINITY;
    for (const name of TARGET_NAMES_SORTED) {
        const distance = levenshtein(normalized, normalizeTargetToken(name));
        if (distance < bestDistance) {
            runnerUpDistance = bestDistance;
            bestDistance = distance;
            best = name;
        }
        else if (distance < runnerUpDistance) {
            runnerUpDistance = distance;
        }
    }
    if (best === null)
        return null;
    if (bestDistance > TARGET_SUGGESTION_MAX_DISTANCE)
        return null;
    // Strictly better than the runner-up — a tie is not a suggestion.
    if (bestDistance === runnerUpDistance)
        return null;
    return best;
}
/**
 * Resolve a user-supplied `--target` value to a canonical {@link TargetName}.
 *
 * Total, pure, no I/O. Precedence (fixed and tested):
 *
 * 1. exact canonical hit → `{kind:'ok', via:'canonical'}` (`isTargetName` semantics);
 * 2. normalised canonical hit → `{kind:'ok', via:'alias'}` (`Claude_Code`, `agentsmd`);
 * 3. explicit {@link TARGET_ALIASES} row → `{kind:'ok', via:'alias'}`;
 * 4. unique normalised prefix → `{kind:'unknown', suggestion}`;
 * 5. Levenshtein ≤ 3 strictly better than the runner-up → `{kind:'unknown', suggestion}`;
 * 6. otherwise → `{kind:'unknown', suggestion:null}`.
 *
 * **Aliases ACCEPT; prefix and Levenshtein only SUGGEST.** An alias row is an owner
 * decision recorded in data; a fuzzy match is a guess, and silently installing to the
 * wrong target on a guess is worse than one round-trip.
 */
export function resolveTargetName(value) {
    if (isTargetName(value))
        return { kind: 'ok', target: value, via: 'canonical' };
    const normalized = normalizeTargetToken(value);
    for (const name of TARGET_NAMES) {
        if (normalizeTargetToken(name) === normalized) {
            return { kind: 'ok', target: name, via: 'alias' };
        }
    }
    const aliased = Object.prototype.hasOwnProperty.call(TARGET_ALIASES, normalized)
        ? TARGET_ALIASES[normalized]
        : Object.prototype.hasOwnProperty.call(TARGET_ALIASES, value.trim().toLowerCase())
            ? TARGET_ALIASES[value.trim().toLowerCase()]
            : undefined;
    if (aliased !== undefined)
        return { kind: 'ok', target: aliased, via: 'alias' };
    return { kind: 'unknown', input: value, suggestion: suggestTargetName(normalized) };
}
/**
 * Render the two-line failure for an unresolvable `--target`.
 *
 * Line 2 keeps the literal substring `--target must be one of:` — three shipped
 * assertions (`test/cli.test.ts`) pin it, and keeping the shape additive is what makes
 * the D3 change prove itself with NEW tests instead of rewriting old ones. The values
 * are {@link TARGET_NAMES_SORTED} (alphabetical), which the pre-change message was not.
 */
export function formatTargetProblem(command, resolution) {
    const suggestion = resolution.suggestion !== null ? ` — did you mean ${JSON.stringify(resolution.suggestion)}?` : '';
    return [
        `${command}: unknown --target ${JSON.stringify(resolution.input)}${suggestion}`,
        `  --target must be one of: ${TARGET_NAMES_SORTED.join(', ')}`,
    ];
}
/** The one-line diagnostic emitted (on stderr) when an alias was accepted. */
export function formatTargetAliasNote(command, input, target) {
    return `${command}: --target ${JSON.stringify(input)} → ${target} (alias)`;
}
//# sourceMappingURL=targets.js.map