/**
 * teach-target — which store does THIS lesson belong to, and who decided.
 *
 * The owner asked for a per-session choice: "in this session accumulate per project; in another,
 * across all projects." For a CLI every invocation is a fresh process, so there is no session
 * object to hold a mode. An environment variable IS a shell session — set once, governs every
 * command in that terminal, dies with it. A persisted file would outlive what the user meant by
 * "this session" and become a mode nobody remembers setting.
 *
 * This increment is third on purpose. A mode set once and forgotten lies silently, and it is safe
 * here only because `learning-store-says-where` already makes every write announce its destination.
 * This adds the other half of that sentence: not only WHERE the lesson landed, but WHY that store
 * was chosen. A fact that is not stated cannot be checked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/** Refusal, never a silent fallback. */
export class TeachTargetError extends Error {
}
export const TEACH_STORES = ['project', 'global'];
const VALID = new Set(TEACH_STORES);
/**
 * One level of input, validated.
 *
 * An unknown value is REFUSED and the source is named, because the cure differs: a bad flag is a
 * typo on this command line, a bad environment variable was exported hours ago in another window,
 * and a bad config is committed and affects everyone on the project.
 *
 * `DZ_LEARN=globl` quietly writing to the project store would be the invisible mislabel this whole
 * mode exists to prevent, arriving through the mode itself.
 */
function validate(value, source) {
    if (value === undefined)
        return undefined;
    const v = value.trim();
    if (v === '')
        return undefined; // an empty export is not a choice
    if (!VALID.has(v)) {
        throw new TeachTargetError(`${source}: unknown store ${JSON.stringify(v)} — expected one of: ${TEACH_STORES.join(', ')}`);
    }
    return v;
}
/**
 * Resolve the destination.
 *
 * Precedence, most specific first: `--to` → `DZ_LEARN` → project config → `project`.
 * That ordering is the only one a user can predict without reading the source.
 *
 * **The default does not move.** MEASURED: 361 records in this repo's own store were written under
 * today's behaviour, and every other user's store is the same. Redirecting an un-flagged `dz teach`
 * would silently change every existing workflow, and the user would find out when a lesson was not
 * where they expected it.
 */
export function resolveTeachTarget(input) {
    const flag = validate(input.flag, '--to');
    if (flag !== undefined)
        return { store: flag, reason: 'flag' };
    const env = validate(input.env, 'DZ_LEARN');
    if (env !== undefined)
        return { store: env, reason: 'environment' };
    const cfg = validate(input.config, '.dz/config.json learning.teachTo');
    if (cfg !== undefined)
        return { store: cfg, reason: 'config' };
    return { store: 'project', reason: 'default' };
}
/**
 * How the reason reads in the store line.
 *
 * Each phrase names WHERE the decision came from, so a user who set `DZ_LEARN=global` three hours
 * ago and forgot has something to recognise. `default` deliberately says nothing extra: adding a
 * phrase there would change the line for every user who set nothing, breaking the byte-identity
 * this feature promises them.
 */
export function teachReasonPhrase(reason) {
    switch (reason) {
        case 'flag': return 'chosen by --to';
        case 'environment': return 'chosen by DZ_LEARN in this shell';
        case 'config': return 'chosen by .dz/config.json';
        case 'default': return '';
    }
}
/**
 * Read the project default from `.dz/config.json` → `learning.teachTo`.
 *
 * Returns the RAW string, not a validated store: an unreadable file is "no opinion", but a file
 * that says `teachTo: "globl"` HAS an opinion and must be refused by `resolveTeachTarget` rather
 * than swallowed here. Those two cases are different and the caller can only tell them apart if
 * this function keeps them apart.
 */
export function readTeachToConfig(projectRoot) {
    try {
        const parsed = JSON.parse(readFileSync(join(projectRoot, '.dz', 'config.json'), 'utf-8'));
        const raw = parsed.learning?.teachTo;
        if (raw === undefined || raw === null)
            return undefined; // no key is no opinion
        // A present key of the WRONG TYPE (`teachTo: true`) is still an opinion, and a wrong one.
        // Returning undefined here would fall through to the project default silently — the exact
        // fail-open the resolver refuses everywhere else (cross-family QE, 2026-08-27).
        return typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
    catch {
        return undefined; // missing or unparseable config is no opinion at all
    }
}
//# sourceMappingURL=teach-target.js.map