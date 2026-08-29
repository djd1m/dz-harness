/**
 * store-merge — read two learning stores together, and never merge them on disk.
 *
 * The design comes from our own shipped precedent, `learning_bridge.py:23`:
 *
 *   "the compounding objection was answered by making RECALL read both stores rather than by
 *    merging them"
 *
 * and `:880`: "two stores are different stores, whatever mechanism might have made them the same."
 *
 * That precedent records an ASYMMETRY, and it is the whole design here: WRITING needs a choice —
 * is this lesson about this project, or general? — while READING almost never does. You want your
 * project's specifics AND your accumulated expertise. So recall reads both, always, with no mode:
 * a mode here would only add a way to be wrong, and a mode set once and forgotten lies silently.
 *
 * The cross-project store is not a new kind of thing. MEASURED: `~/.dz` already exists, and
 * `loadPatterns(projectRoot)` already takes a root — so the global store is simply a project store
 * whose root is the home directory. Same code, same format, nothing to migrate.
 */
import { homedir } from 'node:os';
import { resolve } from 'node:path';
/**
 * The cross-project store's root: the home directory.
 *
 * Taken as a parameter rather than read from the environment inside the merge, so the pure half
 * stays testable without a filesystem and a caller cannot be surprised by which home it meant.
 */
export function globalStoreRoot(home = homedir()) {
    return resolve(home);
}
/**
 * Are these two roots the same store?
 *
 * If a user runs `dz recall` FROM their home directory, "read both" would read one file twice and
 * double every hit. Resolved-path comparison, before either read — cheaper and more certain than
 * de-duplicating afterwards.
 */
export function sameStore(projectRoot, globalRoot) {
    return resolve(projectRoot) === resolve(globalRoot);
}
/**
 * Merge two record sets into one origin-tagged list.
 *
 * `key` decides identity. It is supplied by the caller rather than assumed here, because two
 * lookalike identity rules is how a merge quietly starts treating one record as two — the class
 * this repo has already paid for.
 *
 * ORDER: project records first, then global-only ones. A project's own lessons are the more
 * specific answer to a question asked inside that project, and a reader scanning from the top
 * should meet them first. Records present in BOTH keep the project position and are labelled
 * `both`, because that is where the reader will look for them.
 */
export function mergeStoreHits(projectRecords, globalRecords, key) {
    const inGlobal = new Set(globalRecords.map(key));
    const seen = new Set();
    const out = [];
    for (const r of projectRecords) {
        const k = key(r);
        if (seen.has(k))
            continue; // a store with an internal duplicate stays one record here
        seen.add(k);
        out.push({ ...r, origin: inGlobal.has(k) ? 'both' : 'project' });
    }
    for (const r of globalRecords) {
        const k = key(r);
        if (seen.has(k))
            continue;
        seen.add(k);
        out.push({ ...r, origin: 'global' });
    }
    return out;
}
/** How the header should describe what was read — "1 store" is a fact worth stating, not assuming. */
export function storeCountLabel(count) {
    return count === 1 ? '1 store' : `${count} stores`;
}
//# sourceMappingURL=store-merge.js.map