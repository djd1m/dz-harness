/**
 * Operator profile (feature operator-profile, ADR-001) — WHO the assistant is talking to,
 * stored per USER and delivered as a marked block in `~/.claude/CLAUDE.md`.
 *
 * The profile is a FILE the runtime loads, not a rule the agent remembers: a rule in agent
 * memory is layer 4 of the cost-of-detection ladder and failed three times in this repo before
 * this feature existed. The block lives at layer 2 — loaded once per session, in EVERY project
 * on the machine, including projects with no `.dz/` at all.
 *
 * Two axes (ADR Decision 2): a global register plus named domains that move it. `deepDomains`
 * upgrade to full pro; `weakDomains` make a plain sentence MANDATORY, not merely default — the
 * weak list is the load-bearing one, because there NOT explaining is the failure mode.
 *
 * Boundaries baked into every rendered block (ADR Decision 3), at every register:
 * - the register governs dialogue and owner-facing surfaces only — never ADRs, commit messages,
 *   code comments, QE reports or npm READMEs;
 * - the register changes FORM, never FACTS — numbers, caveats, risks and refutations survive
 *   every level. Without that sentence "simpler please" is a hole in the Integrity Rule.
 *
 * The store is per-user under `homedir()` — NEVER under a project root (`.dz/config.json` is
 * committed in this very repo; a personal file there leaks by construction) — and mode 0600
 * (the key-custody lesson of 2026-07-15 was a 0644 world-readable key).
 *
 * Nothing in this module throws on bad input: a missing file, unreadable JSON or a wrong shape
 * is an honest verdict (`problem`), never an exception.
 *
 * @packageDocumentation
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** Marker pair delimiting the profile block inside `~/.claude/CLAUDE.md`. The redaction in
 * feature-adr-checkpoints.ts keeps its OWN copies of these literals (that file stays import-free
 * so the workflow can mirror it inline); `test/profile-redaction.test.ts` pins the two pairs equal. */
export const PROFILE_MARKER_START = '<!-- dz:profile:start -->';
export const PROFILE_MARKER_END = '<!-- dz:profile:end -->';
/** The accepted register values, for refusal messages (teach-target precedent: an unknown value
 * is refused NAMING the accepted set, never silently defaulted). */
export const REGISTERS = ['pro', 'pro-lite', 'plain'];
/** Owner-word aliases for each register (the owner answers «профи», the store keeps 'pro').
 * Matching is case-insensitive and treats '-', '_' and spaces as one separator. */
const REGISTER_ALIASES = {
    'pro': 'pro',
    'профи': 'pro',
    'expert': 'pro',
    'pro lite': 'pro-lite',
    'prolite': 'pro-lite',
    'профи лайт': 'pro-lite',
    'plain': 'plain',
    'просто': 'plain',
    'simple': 'plain',
};
/** The owner-facing echo of a stored register — `show`/`set` print both directions. */
export function registerOwnerWord(register) {
    switch (register) {
        case 'pro': return 'профи';
        case 'pro-lite': return 'профи лайт';
        case 'plain': return 'просто';
    }
}
/** Parse a register from the owner's own words. Returns null for anything not in the accepted
 * set — the CALLER refuses, naming {@link REGISTERS}; this function never throws and never
 * silently defaults. */
export function parseRegister(raw) {
    if (typeof raw !== 'string')
        return null;
    const key = raw.trim().toLowerCase().replace(/[-_\s]+/g, ' ');
    const direct = REGISTER_ALIASES[key];
    if (direct !== undefined)
        return direct;
    // canonical spellings with the separator collapsed ('pro-lite' → 'pro lite' handled above)
    return null;
}
/**
 * Parse a human-typed, comma-separated domain list — the `init` onboarding answer
 * («networking (CCIE; NSX), cloud architecture»). Rules, each from a way people actually type:
 * - split on commas OUTSIDE parentheses ("networking (CCIE, NSX)" is ONE domain, not two);
 * - an optional trailing parenthetical is the note: `networking (CCIE; NSX)` → tag `networking`,
 *   note `CCIE; NSX`;
 * - the tag is kebab-cased (lowercased, whitespace runs → `-`) so `Cloud Architecture` and
 *   `cloud architecture` are the same domain;
 * - an empty/blank answer means NONE — an empty array, never an error (onboarding must not force
 *   an answer).
 * Never throws.
 */
export function parseDomainList(raw) {
    if (typeof raw !== 'string' || raw.trim() === '')
        return [];
    const pieces = [];
    let depth = 0;
    let current = '';
    for (const ch of raw) {
        if (ch === '(')
            depth++;
        else if (ch === ')')
            depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
            pieces.push(current);
            current = '';
        }
        else
            current += ch;
    }
    pieces.push(current);
    const out = [];
    for (const piece of pieces) {
        const trimmed = piece.trim();
        if (trimmed === '')
            continue;
        const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(trimmed);
        const rawTag = (m ? m[1] : trimmed) ?? '';
        const note = m ? (m[2] ?? '').trim() : '';
        const tag = rawTag.trim().toLowerCase().replace(/\s+/g, '-');
        if (tag === '')
            continue; // "(CCIE)" alone names nothing — skip, never throw
        out.push(note === '' ? { tag } : { tag, note });
    }
    return out;
}
/** The domains as the text a person would have typed — the re-init prompt default, so an Enter
 * keeps what is already stored. */
export function domainListText(domains) {
    return domains.map((d) => (d.note ? `${d.tag} (${d.note})` : d.tag)).join(', ');
}
/** Parse a yes/no answer in the owner's words. Returns null for anything unrecognised — the
 * caller re-asks or takes the documented default OUT LOUD; this function never guesses (the
 * measured failure: a domains line fed to a y/n question silently became `teaches: no`). */
export function parseYesNo(raw) {
    const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (['y', 'yes', 'да', 'true', 'on'].includes(t))
        return true;
    if (['n', 'no', 'нет', 'false', 'off'].includes(t))
        return false;
    return null;
}
/** Absolute path of the profile store: `<home>/.dz/profile.json`. Resolves under `homedir()`
 * and NEVER under a project root — there is deliberately no projectRoot parameter (AR-2:
 * `.dz/config.json` is committed in this repo, so personal data there is a leak by construction).
 * `home` exists as an explicit override so tests run against a scratch HOME. */
export function profileStorePath(home) {
    return join(home ?? homedir(), '.dz', 'profile.json');
}
/** Absolute path of the delivery target: `<home>/.claude/CLAUDE.md`. */
export function claudeMdPath(home) {
    return join(home ?? homedir(), '.claude', 'CLAUDE.md');
}
function validDomainList(v) {
    if (!Array.isArray(v))
        return null;
    const out = [];
    for (const item of v) {
        if (item === null || typeof item !== 'object')
            return null;
        const tag = item.tag;
        if (typeof tag !== 'string' || tag.trim() === '')
            return null;
        const note = item.note;
        if (note !== undefined && typeof note !== 'string')
            return null;
        out.push(note === undefined ? { tag } : { tag, note });
    }
    return out;
}
/** Validate an arbitrary value into an OperatorProfile, or say precisely why not.
 *
 * TOTAL by construction (round-6 finding): the shape checks below can themselves throw on hostile
 * input — `JSON.stringify(2n)` in a verdict message is a TypeError, a getter or Proxy can throw on
 * property access — and validateProfile is called OUTSIDE the try of every no-throw caller
 * (readProfile, writeProfile, syncProfileBlock), because it is the boundary those trys rely on.
 * So the boundary itself may never leak: any internal throw becomes a refusal verdict. */
export function validateProfile(v) {
    try {
        return validateProfileShape(v);
    }
    catch (e) {
        // The catch path may not throw either (round-7 finding): `String(e)` / `e.message` invoke
        // conversion and access hooks on the THROWN value, and a hostile getter can throw an
        // unstringifiable one (`Object.create(null)`) — formatting it under a fixed fallback keeps
        // the boundary total all the way down.
        let detail = 'unformattable error';
        try {
            // Coerce INSIDE the try, and only accept an actual string: a hostile `message` getter can
            // RETURN an unstringifiable object without throwing, which would otherwise blow up at
            // template interpolation below.
            const d = e instanceof Error ? e.message : e;
            detail = typeof d === 'string' ? d : String(d);
        }
        catch { /* keep the fixed fallback */ }
        return { profile: null, problem: `invalid shape: validation threw (${detail})` };
    }
}
function validateProfileShape(v) {
    if (v === null || typeof v !== 'object')
        return { profile: null, problem: 'invalid shape: not an object' };
    const o = v;
    if (o.version !== 1)
        return { profile: null, problem: `invalid shape: version must be 1, got ${JSON.stringify(o.version)}` };
    if (typeof o.updatedAt !== 'string')
        return { profile: null, problem: 'invalid shape: updatedAt must be a string' };
    if (typeof o.language !== 'string' || o.language.trim() === '')
        return { profile: null, problem: 'invalid shape: language must be a non-empty string' };
    if (o.register !== 'pro' && o.register !== 'pro-lite' && o.register !== 'plain') {
        return { profile: null, problem: `invalid shape: register must be one of ${REGISTERS.join(' | ')}, got ${JSON.stringify(o.register)}` };
    }
    const deep = validDomainList(o.deepDomains);
    if (deep === null)
        return { profile: null, problem: 'invalid shape: deepDomains must be an array of { tag, note? }' };
    const weak = validDomainList(o.weakDomains);
    if (weak === null)
        return { profile: null, problem: 'invalid shape: weakDomains must be an array of { tag, note? }' };
    if (typeof o.teaches !== 'boolean')
        return { profile: null, problem: 'invalid shape: teaches must be a boolean' };
    // No profile field may contain a block marker literal. A field has no legitimate reason to hold
    // one, and a marker smuggled into a value poisons everything downstream: the first sync writes it
    // INSIDE the generated block, and every later sync (and checkProfileDrift) then reads it as the
    // legacy nested state and refuses — a self-inflicted permanent malfunction (round-4 cross-family
    // finding, `dz profile set language '<!-- dz:profile:start -->'`). Refusal at the ONE validation
    // seam covers every entry path: init, set, --json, and a hand-edited store file.
    // `updatedAt` is included (round-5 P2-1): renderProfileBlock puts it into the heading when it
    // does not parse as a date, so a hand-edited store with a marker there poisons the block exactly
    // like language/tags/notes would.
    const fieldStrings = [o.updatedAt, o.language,
        ...deep.flatMap((d) => [d.tag, d.note ?? '']),
        ...weak.flatMap((d) => [d.tag, d.note ?? ''])];
    for (const f of fieldStrings) {
        if (f.includes(PROFILE_MARKER_START) || f.includes(PROFILE_MARKER_END)) {
            return { profile: null, problem: 'invalid shape: a field value may not contain a profile block marker' };
        }
    }
    return {
        profile: {
            version: 1,
            updatedAt: o.updatedAt,
            language: o.language,
            register: o.register,
            deepDomains: deep,
            weakDomains: weak,
            teaches: o.teaches,
        },
        problem: null,
    };
}
/** Read + validate the store. Missing file, unreadable JSON and a wrong shape are three DIFFERENT
 * problems, all reported, none thrown. */
export function readProfile(home) {
    const path = profileStorePath(home);
    if (!existsSync(path))
        return { profile: null, path, problem: 'missing' };
    let raw;
    try {
        raw = readFileSync(path, 'utf-8');
    }
    catch (e) {
        return { profile: null, path, problem: `unreadable: ${e instanceof Error ? e.message : String(e)}` };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (e) {
        return { profile: null, path, problem: `unreadable JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    const { profile, problem } = validateProfile(parsed);
    return { profile, path, problem };
}
/** Write the store at mode 0600 (creating `<home>/.dz/` at 0700 if needed). The chmod runs even
 * when the file pre-existed: `writeFileSync`'s mode applies only at creation. */
export function writeProfile(profile, home) {
    // EVERY write revalidates. The round-4 live probe proved why: the marker-literal refusal was first
    // placed in validateProfile alone, and `dz profile set language '<!-- dz:profile:start -->'` still
    // sailed through with exit 0 — the CLI mutates an already-validated object and writes it here,
    // never re-entering validateProfile. A guard on a path a writer can skip is not a guard.
    const { profile: ok, problem } = validateProfile(profile);
    if (ok === null)
        return { path: profileStorePath(home), problem: problem ?? 'invalid profile' };
    const path = profileStorePath(home);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(ok, null, 2) + '\n', { mode: 0o600 });
    chmodSync(path, 0o600);
    return { path };
}
const LANGUAGE_NAMES = {
    ru: 'Russian', en: 'English', de: 'German', fr: 'French', es: 'Spanish', zh: 'Chinese',
};
function languageName(code) {
    return LANGUAGE_NAMES[code.trim().toLowerCase()] ?? code;
}
function domainLine(domains) {
    return domains.map((d) => (d.note ? `${d.tag} (${d.note})` : d.tag)).join(' · ');
}
function registerLine(register) {
    switch (register) {
        case 'pro':
            return '**Default register: pro** — full professional register: name the concept and move on; scaffolding reads as patronising.';
        case 'pro-lite':
            return '**Default register: pro-lite** — name the concept AND give one plain sentence of what it means here.';
        case 'plain':
            return '**Default register: plain** — everyday words first; introduce the technical term once, in parentheses, after the plain explanation.';
    }
}
/**
 * Render the block CONTENT (without the markers — {@link wrapProfileBlock} adds them).
 *
 * Invariants, each pinned by a test:
 * - both fixed rules (artifact scope; form-not-facts) appear at EVERY register — they are not
 *   user settings (ADR Decision 3);
 * - deep and weak domains render visibly DIFFERENT instructions: deep = full pro, no
 *   scaffolding; weak = one plain sentence EVERY time, unprompted — mandatory, not default.
 */
export function renderProfileBlock(profile) {
    const day = /^\d{4}-\d{2}-\d{2}/.exec(profile.updatedAt)?.[0] ?? profile.updatedAt;
    const parts = [];
    parts.push(`## Operator profile (generated by \`dz profile sync\` ${day} — edit with \`dz profile set\`, not by hand)`);
    parts.push(`**Dialogue language: ${languageName(profile.language)}.** Artifacts keep their own conventions (see the scope rule below).`);
    parts.push(registerLine(profile.register));
    if (profile.deepDomains.length > 0) {
        parts.push(`**Deep domains — go full pro here, no scaffolding:**\n${domainLine(profile.deepDomains)}.\n` +
            'Reach for analogies from these first: they land instantly and they are usually the shortest true explanation.');
    }
    if (profile.weakDomains.length > 0) {
        parts.push(`**Weak domains — one plain sentence EVERY time, unprompted, without waiting to be asked:**\n${domainLine(profile.weakDomains)}.\n` +
            'The plain sentence here is MANDATORY, not merely a default: not explaining is the failure mode, not over-explaining.');
    }
    // Self-containment is a FIXED rule (owner acceptance, CF-7, 2026-08-28): the live failure it
    // encodes was a term treated as established because it had been explained two hours earlier in
    // the SAME conversation — but the earlier text had scrolled away, and in a fresh session it
    // would never have existed. The rule is about the TERM and the TEXT, not the domain or the
    // conversation history; the weak-domains instruction above stays as the priority signal on top.
    parts.push('**An explanation is SELF-CONTAINED.** Every term introduced gets its gloss at first use IN THIS PASSAGE, ' +
        'regardless of whether it was explained earlier in the conversation. Do not assume a term is established ' +
        'because it was covered before — the earlier text has scrolled away, and in a new session it never existed.');
    if (profile.teaches) {
        parts.push('**The operator teaches — explanations must be RE-TELLABLE.** Give the formulation they could carry into a ' +
            'lecture, not just one that satisfies them in the moment. This makes self-containment STRICT: an explanation ' +
            'the reader cannot re-tell without the surrounding chat is not finished.');
    }
    // The three-point shape the owner judged clearer at the live acceptance step (CF-7) — named,
    // so the instruction is actionable rather than vague.
    parts.push('**The shape of a good pro-lite explanation:**\n' +
        '1. the term is defined at first use, inline, not deferred;\n' +
        '2. WHY before HOW — the reason the thing exists precedes its mechanism;\n' +
        '3. the conclusion is stated in words, not left for the reader to derive.');
    parts.push('**Scope of the register.** It governs DIALOGUE and owner-facing surfaces: answers, checkpoint questions, ' +
        'status reports, decision pages. It does NOT govern artifacts written for future readers — ADRs, commit messages, ' +
        'code comments, QE reports, npm READMEs — those keep their own conventions and audience. An ADR is not simplified ' +
        'because the current operator asked for a lower register.');
    parts.push('**The register changes FORM, never the FACTS.** Numbers, caveats, risks and refutations survive every level. ' +
        'Simplifying is not licence to drop a measurement or soften a bad result.');
    parts.push('**Escape hatches, effective immediately for the session:** «проще» / «подробнее» / «как профи» / «я это знаю». ' +
        'A register corrected twice in one session is evidence the profile is wrong — say so and propose the durable fix ' +
        '(`dz profile set`) rather than absorbing it silently.');
    return parts.join('\n\n');
}
/** Wrap rendered content in the marker pair, ready to merge into a target file. */
export function wrapProfileBlock(content) {
    return `${PROFILE_MARKER_START}\n${content}\n${PROFILE_MARKER_END}`;
}
/** Extract the CONTENT between the markers of `fileContent`, or null when no complete block
 * exists. Only the FIRST block is considered (sync never writes a second one). */
export function extractProfileBlock(fileContent) {
    const start = fileContent.indexOf(PROFILE_MARKER_START);
    if (start === -1)
        return null;
    const afterStart = start + PROFILE_MARKER_START.length;
    const end = fileContent.indexOf(PROFILE_MARKER_END, afterStart);
    if (end === -1)
        return null;
    return fileContent.slice(afterStart, end).replace(/^\n/, '').replace(/\n$/, '');
}
/** Pure marked-block merge (the `installDriverDocs` pattern from setup.ts, upgraded from
 * append-if-absent to replace-in-place). Foreign content — everything outside the marker pair —
 * is preserved BYTE-FOR-BYTE; `changed: false` means the file already carries exactly this
 * content (idempotence). `existing: null` means the target file does not exist yet.
 *
 * `malformed: true` (with the input returned untouched) means the file is in a state this merge
 * refuses to write over. `malformedKind` names which of the two known states it is:
 *
 * - `'dangling-start'` — a START marker with no END marker after it. The first version APPENDED
 *   a complete fresh block in that case — and the NEXT sync then paired the OLD dangling start
 *   with the NEW block's end and deleted everything between them, damaged foreign text included
 *   (the second-sync corruption, cross-family finding 2026-08-28).
 * - `'nested-markers'` — ANOTHER start marker between the chosen start and its end. This is the
 *   LEGACY residue of exactly that pre-fix append: dangling start … foreign text … appended
 *   complete block. Pairing the old start with the appended block's end would delete the foreign
 *   text (second cross-family finding, 2026-08-28), and the `dangling-start` refusal above does
 *   not fire because an end marker DOES exist after the start.
 *
 * Both states are REFUSED, never repaired automatically: nothing is written, no further nesting
 * can ever be created, and the caller reports the named verdict. A stray END marker with no
 * start before it stays harmless (the block we append is complete, and every later replace
 * anchors at OUR start marker), so it does not refuse. */
export function mergeProfileBlock(existing, content) {
    const block = wrapProfileBlock(content);
    if (existing === null) {
        return { merged: block + '\n', changed: true, hadBlock: false };
    }
    const start = existing.indexOf(PROFILE_MARKER_START);
    const end = start === -1 ? -1 : existing.indexOf(PROFILE_MARKER_END, start + PROFILE_MARKER_START.length);
    if (start !== -1 && end === -1) {
        return { merged: existing, changed: false, hadBlock: false, malformed: true, malformedKind: 'dangling-start' };
    }
    if (start !== -1) {
        const nested = existing.indexOf(PROFILE_MARKER_START, start + PROFILE_MARKER_START.length);
        if (nested !== -1 && nested < end) {
            return { merged: existing, changed: false, hadBlock: false, malformed: true, malformedKind: 'nested-markers' };
        }
    }
    if (start === -1) {
        // No block at all — append one.
        const sep = existing === '' || existing.endsWith('\n') ? '\n' : '\n\n';
        return { merged: existing + sep + block + '\n', changed: true, hadBlock: false };
    }
    const before = existing.slice(0, start);
    const after = existing.slice(end + PROFILE_MARKER_END.length);
    const merged = before + block + after;
    return { merged, changed: merged !== existing, hadBlock: true };
}
/** Write the rendered block into `<home>/.claude/CLAUDE.md`: idempotent, foreign content
 * byte-for-byte, timestamped backup before every MODIFYING write of an existing file.
 * Never throws — an I/O failure (and a malformed block, named as `malformed block:`) is a
 * `problem` verdict.
 *
 * Modes (the delivered COPIES carry the same personal profile as the 0600 store, so none of
 * them may be left to the ambient umask — the key-custody lesson again, one file over):
 * - a target this function CREATES is 0600, and a `.claude/` dir it creates is 0700;
 * - a PRE-EXISTING target keeps its owner bits exactly and loses only group/other bits
 *   (`mode & 0o700`). We deliberately do not force 0600 on a file the user owns — their owner
 *   permissions are their call — but leaving non-owner read on a file we just wrote the profile
 *   into would be the 0644 world-readable-key defect verbatim, so that much IS tightened;
 * - every backup is a fresh file of ours and is written 0600 unconditionally. */
export function syncProfileBlock(profile, home, now) {
    const target = claudeMdPath(home);
    // This is a PUBLIC write path, so it revalidates just like writeProfile does (round-5 P2-2 —
    // the same seam lesson one function over): a consumer calling it directly with an in-memory
    // profile carrying a marker literal would otherwise render that marker INSIDE the generated
    // block — the first sync writes the nested state, the second refuses it. Invalid → verdict,
    // no write, no backup.
    const { profile: valid, problem: invalid } = validateProfile(profile);
    if (valid === null) {
        return { target, changed: false, backup: null, problem: invalid ?? 'invalid profile' };
    }
    try {
        const existing = existsSync(target) ? readFileSync(target, 'utf-8') : null;
        const merge = mergeProfileBlock(existing, renderProfileBlock(valid));
        if (merge.malformed === true) {
            const detail = merge.malformedKind === 'nested-markers'
                ? `carries a NESTED ${PROFILE_MARKER_START} between a start marker and its end — likely legacy state from a pre-fix sync that appended a block after a dangling start; delete the stray markers or complete the block by hand`
                : `carries ${PROFILE_MARKER_START} with no ${PROFILE_MARKER_END} after it — delete or complete the dangling marker by hand`;
            return {
                target,
                changed: false,
                backup: null,
                problem: `malformed block: ${target} ${detail} — nothing was touched (foreign bytes stay byte-identical); then re-run \`dz profile sync\``,
            };
        }
        if (!merge.changed)
            return { target, changed: false, backup: null, problem: null };
        let backup = null;
        if (existing !== null) {
            const stamp = (now ?? new Date()).toISOString().replace(/[:.]/g, '-');
            backup = `${target}.dz-profile-backup-${stamp}`;
            writeFileSync(backup, existing, { mode: 0o600 });
            chmodSync(backup, 0o600); // writeFileSync's mode applies only at creation
        }
        if (existing === null) {
            mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
            writeFileSync(target, merge.merged, { mode: 0o600 });
            chmodSync(target, 0o600);
        }
        else {
            const prevMode = statSync(target).mode & 0o777;
            writeFileSync(target, merge.merged);
            const tightened = prevMode & 0o700;
            if (tightened !== prevMode)
                chmodSync(target, tightened);
        }
        return { target, changed: true, backup, problem: null };
    }
    catch (e) {
        return { target, changed: false, backup: null, problem: e instanceof Error ? e.message : String(e) };
    }
}
/** Does the block currently in `<home>/.claude/CLAUDE.md` match what `profile.json` would
 * render? Compares CONTENT (a hand-edited block that still says the same bytes is in sync;
 * anything else is drift). */
export function checkProfileDrift(home) {
    const { profile, path, problem } = readProfile(home);
    if (profile === null) {
        return problem === 'missing'
            ? { verdict: 'no-profile', detail: `no profile at ${path} — run \`dz profile init\`` }
            : { verdict: 'invalid-profile', detail: `${path}: ${problem ?? 'invalid'}` };
    }
    const target = claudeMdPath(home);
    if (!existsSync(target))
        return { verdict: 'no-target', detail: `${target} does not exist — run \`dz profile sync\`` };
    let fileContent;
    try {
        fileContent = readFileSync(target, 'utf-8');
    }
    catch (e) {
        return { verdict: 'no-target', detail: `${target}: ${e instanceof Error ? e.message : String(e)}` };
    }
    // The nested-markers legacy state extracts a "block" (a start … end pair exists), so it would
    // read as ordinary drift — whose advice is `dz profile sync`, the exact command that refuses on
    // this file. Name the damage instead, so the operator repairs the right thing.
    {
        const s = fileContent.indexOf(PROFILE_MARKER_START);
        const e = s === -1 ? -1 : fileContent.indexOf(PROFILE_MARKER_END, s + PROFILE_MARKER_START.length);
        const nested = s === -1 || e === -1 ? -1 : fileContent.indexOf(PROFILE_MARKER_START, s + PROFILE_MARKER_START.length);
        if (nested !== -1 && nested < e) {
            return { verdict: 'malformed-block', detail: `${target} carries a NESTED ${PROFILE_MARKER_START} between a start marker and its end (likely legacy state from a pre-fix sync) — delete the stray markers or complete the block by hand, then run \`dz profile sync\`` };
        }
    }
    const inFile = extractProfileBlock(fileContent);
    if (inFile === null) {
        // A start marker WITHOUT an end after it is not "no block" — it is damage `dz profile sync`
        // refuses to write over (see mergeProfileBlock). Name it, so the operator repairs the right thing.
        if (fileContent.includes(PROFILE_MARKER_START)) {
            return { verdict: 'malformed-block', detail: `${target} carries ${PROFILE_MARKER_START} with no ${PROFILE_MARKER_END} after it — delete or complete the dangling marker by hand, then run \`dz profile sync\`` };
        }
        return { verdict: 'no-block', detail: `${target} carries no ${PROFILE_MARKER_START} block — run \`dz profile sync\`` };
    }
    const expected = renderProfileBlock(profile);
    if (inFile === expected)
        return { verdict: 'in-sync', detail: 'block matches profile.json' };
    return { verdict: 'drift', detail: `block in ${target} differs from what profile.json renders — run \`dz profile sync\`` };
}
/** Whole-days age of the profile, or null when updatedAt does not parse. */
export function profileAgeDays(profile, now) {
    const t = Date.parse(profile.updatedAt);
    if (!Number.isFinite(t))
        return null;
    const ms = (now ?? new Date()).getTime() - t;
    return Math.floor(ms / 86_400_000);
}
//# sourceMappingURL=profile.js.map