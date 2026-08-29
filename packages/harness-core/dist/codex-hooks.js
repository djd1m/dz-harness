/**
 * The Codex hook registry model (`crossrt-2-codex-hooks`, ADR-001).
 *
 * Pure: paths, the managed entry set, sha-based attribution, the manifest, drift, and the TOML text
 * of a trust block. Every filesystem and process action lives in `operations.ts`.
 *
 * ## Measured facts this module encodes (M0 spike, codex-cli 0.147.0 — see
 * `features/crossrt-2-codex-hooks/07_code_changes/probe-results/spike-arming.md`)
 *
 * - `$CODEX_HOME/hooks.json` is the user registry and **`CODEX_HOME` relocates discovery**, which is
 *   what makes every automated probe hermetic (G-H). `$CODEX_HOME/hooks/hooks.json` is the PLUGIN
 *   bundle layout and does not fire.
 * - Entries are trust-gated. An untrusted entry is silently not run. Trust is persisted per entry in
 *   `$CODEX_HOME/config.toml` as `[hooks.state."<key>"] trusted_hash = "<currentHash>"`, and both
 *   `key` and `currentHash` come from the runtime's own `hooks/list` RPC — they are **read, never
 *   computed**, because `currentHash`'s preimage is internal to codex.
 * - `timeout` is in SECONDS and IS honored (600 → 5, MEASURED). `timeoutSec` in an entry is
 *   **silently ignored** and leaves the 600 s default in place — which is why this module emits
 *   `timeout` and a test pins the key set (AM-15, now probe-proven by spike S2).
 * - The hook runner spawns via `$SHELL -lc`, so the emitted command is a SHELL string: the
 *   interpreter is an absolute `process.execPath` and both paths are single-quoted (AM-32/AM-35d).
 *
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mergeManagedHookEntries } from './managed-hooks.js';
/**
 * Bump when a helper BODY changes: a changed body changes codex's `currentHash` ⇒ re-trust.
 *
 * 2 — the independent-QE fix round: the veto note stopped persisting the raw command line and the
 * notes log/dir modes are now enforced on every write (finding 8).
 * 3 — fix round 2: the note's `commandSynopsis` is a binary NAME or `(redacted)` — an
 * env-assignment first token (`SECRET=xyz ssh …`) carried the credential the redaction removed
 * everywhere else (R2-8).
 */
export const DZ_HOOK_HELPER_VERSION = 3;
/** Seconds. Probe-proven (spike S2): `timeout` is honored, the unset default is 600 s. */
export const DZ_HOOK_TIMEOUT_SECONDS = 5;
/** The wide matcher (AM-8). Narrowing needs a recorded live probe; the guard keys on the payload. */
export const DZ_VETO_MATCHER = 'Bash|shell|local_shell';
/** Every path this leg touches, all `CODEX_HOME`-relative (AM-13). */
export function codexHooksPaths(codexHome) {
    const helperDir = join(codexHome, 'dz-hooks');
    return {
        codexHome,
        registry: join(codexHome, 'hooks.json'),
        configToml: join(codexHome, 'config.toml'),
        helperDir,
        vetoHelper: join(helperDir, 'dz-codex-veto.cjs'),
        recallHelper: join(helperDir, 'dz-codex-recall.cjs'),
        manifest: join(helperDir, 'manifest.json'),
        errorLog: join(helperDir, 'helper-errors.jsonl'),
    };
}
/** The EMITTER's write-set (AM-12). The RUNTIME's is stated separately — see {@link runtimeWriteSet}. */
export function emitterWriteSet(paths) {
    return [paths.registry, paths.vetoHelper, paths.recallHelper, paths.manifest];
}
/**
 * The RUNTIME's write-set (AM-33). Exactly one path beyond the emitter's, and it is
 * `CODEX_HOME`-local: a helper must never create a `.dz/` inside a repository the user merely ran
 * `codex` in. (Recall rows are the one exception and they are opt-in-gated: they land in an
 * ALREADY-EXISTING opted-in project's `.dz/`, so nothing is ever created.)
 */
export function runtimeWriteSet(paths) {
    return [paths.errorLog];
}
/* -------------------------------------------------------------------------- */
/* Quoting                                                                     */
/* -------------------------------------------------------------------------- */
/** A single quote inside a single-quoted shell word cannot be escaped — such a path is REFUSED. */
export function isSafeForSingleQuote(path) {
    return typeof path === 'string' && path !== '' && !path.includes("'") && !path.includes('\n');
}
export function singleQuote(path) {
    return `'${path}'`;
}
/**
 * The shell string codex runs. Absolute interpreter + single-quoted paths (AM-32/AM-35d).
 * @throws when either path cannot be safely quoted — never emit a broken entry that READS installed.
 */
export function buildHookCommand(nodePath, scriptPath) {
    if (!isSafeForSingleQuote(nodePath) || !isSafeForSingleQuote(scriptPath)) {
        throw new Error(`refusing to emit a hook command containing an unquotable path (single quote or newline): ${nodePath} ${scriptPath}`);
    }
    return `${singleQuote(nodePath)} ${singleQuote(scriptPath)}`;
}
/** The two entries this leg ships, and nothing else. */
export const CODEX_MANAGED_HOOKS = [
    { id: 'codex-veto', event: 'PreToolUse', matcher: DZ_VETO_MATCHER, script: 'veto' },
    { id: 'codex-recall', event: 'UserPromptSubmit', script: 'recall' },
];
/**
 * Build the managed entries.
 *
 * Key set is EXACTLY `{matcher?, hooks:[{type, command, timeout}]}` (AM-15). `timeout` is included
 * because spike S2 recorded a probe proving the registry loads with it AND honors it; every other
 * key stays out until it has its own probe.
 */
export function buildManagedEntries(opts) {
    return CODEX_MANAGED_HOOKS.map((spec) => {
        const script = spec.script === 'veto' ? opts.paths.vetoHelper : opts.paths.recallHelper;
        const command = buildHookCommand(opts.nodePath, script);
        const entry = {
            ...(spec.matcher !== undefined ? { matcher: spec.matcher } : {}),
            hooks: [{ type: 'command', command, timeout: DZ_HOOK_TIMEOUT_SECONDS }],
        };
        return { id: spec.id, event: spec.event, command, entry };
    });
}
/** `managed` in the shape {@link mergeManagedHookEntries} takes. */
export function managedByEvent(entries) {
    const out = {};
    for (const e of entries) {
        (out[e.event] ??= []).push(e.entry);
    }
    return out;
}
/* -------------------------------------------------------------------------- */
/* Manifest + attribution                                                      */
/* -------------------------------------------------------------------------- */
export function codexHookSha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
export function buildCodexHookManifest(opts) {
    return {
        version: 1,
        writtenAt: opts.writtenAt,
        codexVersion: opts.codexVersion,
        registryPath: opts.paths.registry,
        helperVersion: DZ_HOOK_HELPER_VERSION,
        nodePath: opts.nodePath,
        entries: opts.entries.map((e) => {
            const spec = CODEX_MANAGED_HOOKS.find((s) => s.id === e.id);
            const trustKey = opts.trustKeys?.[e.id];
            return {
                id: e.id,
                event: e.event,
                ...(spec?.matcher !== undefined ? { matcher: spec.matcher } : {}),
                commandSha256: codexHookSha256(e.command),
                ...(trustKey !== undefined ? { trustKey } : {}),
            };
        }),
        ...(opts.lastVerify !== undefined ? { lastVerify: opts.lastVerify } : {}),
    };
}
export function parseCodexHookManifest(text) {
    try {
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object')
            return undefined;
        const m = parsed;
        if (m.version !== 1 || !Array.isArray(m.entries))
            return undefined;
        return m;
    }
    catch {
        return undefined;
    }
}
function entryCommands(entry) {
    const e = entry;
    if (Array.isArray(e?.hooks))
        return e.hooks.map((h) => String(h?.command ?? ''));
    return [String(e?.command ?? '')];
}
/**
 * Attribution is `codexHookSha256(command) ∈ manifest` — never a substring guess.
 *
 * ADR-001 §3: dz deletes only what it can PROVE it wrote. An entry that merely looks like ours (it
 * mentions our helper filename) but whose command hash is absent from the manifest is KEPT, counted
 * in `unattributable`, and warned about. A hand-edited managed command therefore survives.
 */
export function isDzManagedEntry(entry, manifest) {
    if (manifest === undefined)
        return false;
    const known = new Set(manifest.entries.map((e) => e.commandSha256));
    return entryCommands(entry).some((cmd) => cmd !== '' && known.has(codexHookSha256(cmd)));
}
/**
 * Rebuild an OWNED entry from only the handlers that are NOT ours — per-HANDLER attribution.
 *
 * ADR-001 §5 promises that dz deletes only what it can prove it wrote. Attribution was applied to a
 * whole MATCHER GROUP: a group holding one dz handler and one of the user's was removed (or
 * replaced) wholesale, so a foreign handler was deleted by a rule written to protect it
 * (independent review, finding 6). One dz handler in the group must cost exactly that handler.
 *
 * Returns `null` when every handler in the entry was ours (the entry itself is then dropped), and
 * a rebuilt entry — same keys, same order, minus our handlers — when something foreign survives.
 * A legacy FLAT entry (`{type, command}`) is one handler and has nothing to salvage.
 */
export function retainForeignHandlers(entry, manifest) {
    if (manifest === undefined)
        return entry;
    const known = new Set(manifest.entries.map((e) => e.commandSha256));
    const isOurs = (cmd) => typeof cmd === 'string' && cmd !== '' && known.has(codexHookSha256(cmd));
    const e = entry;
    if (!Array.isArray(e?.hooks))
        return null; // flat shape: the entry IS the handler
    const kept = e.hooks.filter((h) => !isOurs(h?.command));
    if (kept.length === 0)
        return null;
    return { ...entry, hooks: kept };
}
/** Cheap resemblance test — drives the `unattributable` COUNT only, never a deletion. */
export function looksLikeDzEntry(entry) {
    return entryCommands(entry).some((cmd) => cmd.includes('dz-codex-veto.cjs') || cmd.includes('dz-codex-recall.cjs'));
}
/**
 * Parse an existing registry. An unparseable file is an ERROR, never an empty registry: silently
 * treating it as `{}` would overwrite entries we promised to preserve (I1).
 */
export function parseCodexRegistry(text) {
    if (text === undefined || text.trim() === '') {
        return { ok: true, registry: { rest: {}, hooks: {} } };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (err) {
        return { ok: false, error: `hooks.json is not valid JSON: ${err.message}` };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'hooks.json must be a JSON object' };
    }
    const obj = parsed;
    const rawHooks = obj['hooks'];
    if (rawHooks !== undefined && (rawHooks === null || typeof rawHooks !== 'object' || Array.isArray(rawHooks))) {
        return { ok: false, error: 'hooks.json "hooks" must be an object keyed by event name' };
    }
    const hooks = {};
    for (const [event, value] of Object.entries((rawHooks ?? {}))) {
        // REFUSE, never coerce. `Array.isArray(value) ? [...value] : []` silently turned a foreign
        // event whose value dz does not understand into an EMPTY list, and the next write persisted
        // that emptiness — configuration loss dressed as a merge (independent review, finding 5). An
        // unparseable shape is the same class of fact as unparseable JSON: refuse before planning.
        if (!Array.isArray(value)) {
            return {
                ok: false,
                error: `hooks.json event ${JSON.stringify(event)} must be an array of entries (found ${value === null ? 'null' : typeof value}) — dz refuses to rewrite a registry it cannot read without losing it`,
            };
        }
        hooks[event] = [...value];
    }
    const rest = {};
    for (const [k, v] of Object.entries(obj))
        if (k !== 'hooks')
            rest[k] = v;
    return { ok: true, registry: { rest, hooks } };
}
export function serializeCodexRegistry(registry) {
    return `${JSON.stringify({ ...registry.rest, hooks: registry.hooks }, null, 2)}\n`;
}
/**
 * Compute the merged registry.
 *
 * The merge itself is `mergeManagedHookEntries` — the SAME implementation the Claude path uses
 * (AM-3 / G-E). Only the attribution predicate differs.
 */
export function planCodexHooks(input) {
    const parsed = parseCodexRegistry(input.currentText);
    if (!parsed.ok)
        return { ok: false, error: parsed.error };
    // The union of the manifest's hashes and the ones we are about to write: on a re-run the manifest
    // is current, on a helper-version bump it is not, and BOTH vintages of our own entry must be
    // replaced rather than duplicated.
    const selfManifest = {
        version: 1,
        writtenAt: '',
        codexVersion: '',
        registryPath: '',
        helperVersion: DZ_HOOK_HELPER_VERSION,
        nodePath: '',
        entries: [
            ...(input.manifest?.entries ?? []),
            ...input.entries.map((e) => ({ id: e.id, event: e.event, commandSha256: codexHookSha256(e.command) })),
        ],
    };
    const plan = mergeManagedHookEntries(parsed.registry.hooks, managedByEvent(input.entries), {
        isManaged: (entry) => isDzManagedEntry(entry, selfManifest),
        looksLikeOurs: (entry) => looksLikeDzEntry(entry) && !isDzManagedEntry(entry, selfManifest),
        // Per-HANDLER salvage (finding 6): an owned entry that also carries the user's own handler is
        // rebuilt without ours, never dropped whole. The Claude path passes no salvage and is
        // byte-identical to before (AM-3).
        retainForeign: (entry) => retainForeignHandlers(entry, selfManifest),
        reportLabel: 'codex',
    });
    const registry = { rest: parsed.registry.rest, hooks: plan.hooks };
    return {
        ok: true,
        plan: {
            registry,
            text: serializeCodexRegistry(registry),
            changed: plan.changed,
            foreignPreserved: plan.foreignPreserved,
            unattributable: plan.unattributable,
        },
    };
}
/**
 * `--remove`: delete ONLY manifest-attributed entries.
 *
 * With the manifest deleted this removes **zero** entries and reports them all as `unattributable`.
 * That is the intended, conservative behaviour: dz never deletes what it cannot prove it wrote.
 */
export function removeCodexHooks(currentText, manifest) {
    const parsed = parseCodexRegistry(currentText);
    if (!parsed.ok)
        return { ok: false, error: parsed.error };
    const hooks = {};
    let removed = 0;
    let unattributable = 0;
    for (const [event, entries] of Object.entries(parsed.registry.hooks)) {
        const kept = [];
        for (const entry of entries) {
            if (isDzManagedEntry(entry, manifest)) {
                removed += 1;
                // Per-HANDLER removal (finding 6): a mixed matcher group keeps every handler that is not
                // ours. Removing dz's guard must never remove the user's alongside it.
                const salvaged = retainForeignHandlers(entry, manifest);
                if (salvaged !== null)
                    kept.push(salvaged);
                continue;
            }
            if (looksLikeDzEntry(entry))
                unattributable += 1;
            kept.push(entry);
        }
        hooks[event] = kept;
    }
    const registry = { rest: parsed.registry.rest, hooks };
    return {
        ok: true,
        result: { registry, text: serializeCodexRegistry(registry), removed, changed: removed > 0, unattributable },
    };
}
/** `--check` recomputes from the FILE; it never trusts the manifest's claim on its own. */
export function diffCodexHooks(currentText, entries, manifest) {
    const parsed = parseCodexRegistry(currentText);
    const hooks = parsed.ok ? parsed.registry.hooks : {};
    const present = [];
    const drifted = [];
    let foreignPreserved = 0;
    let unattributable = 0;
    const wantByEvent = new Map(entries.map((e) => [e.event, e]));
    for (const [event, list] of Object.entries(hooks)) {
        for (const entry of list) {
            const want = wantByEvent.get(event);
            const cmds = entryCommands(entry);
            if (want !== undefined && cmds.includes(want.command)) {
                present.push(want.id);
                continue;
            }
            if (isDzManagedEntry(entry, manifest)) {
                // Ours by manifest, but not the command we would write now: an old helper version.
                const id = manifest?.entries.find((m) => cmds.some((c) => codexHookSha256(c) === m.commandSha256))?.id;
                if (id !== undefined)
                    drifted.push(id);
                continue;
            }
            foreignPreserved += 1;
            if (looksLikeDzEntry(entry))
                unattributable += 1;
        }
    }
    const missing = entries.map((e) => e.id).filter((id) => !present.includes(id));
    return {
        installed: missing.length === 0,
        presentIds: present,
        missingIds: missing,
        foreignPreserved,
        unattributable,
        drifted,
    };
}
/* -------------------------------------------------------------------------- */
/* Trust (the M0 arming route)                                                 */
/* -------------------------------------------------------------------------- */
/** codex's snake_case event spelling inside a trust key (MEASURED from `hooks/list`). */
export function trustEventName(event) {
    return event === 'PreToolUse' ? 'pre_tool_use' : 'user_prompt_submit';
}
/**
 * Compare two event spellings the way the runtime actually spells them.
 *
 * MEASURED, both on this machine, on the SAME response shape:
 * - the trust KEY embeds `pre_tool_use` / `user_prompt_submit` (snake_case);
 * - `hooks/list`'s `eventName` FIELD is `preToolUse` / `userPromptSubmit` on **codex-cli 0.148.0**
 *   (reproducer: `listCodexHooks(<temp home>)` after an install — the rows are printed verbatim in
 *   `07_code_changes/probe-results/fixround/trust-diagnosis.txt`).
 *
 * Pinning either spelling alone silently drops every row: the fix round's first cut compared the
 * field against the KEY spelling, `hooks/list` matched 0 of 2 entries, trust was never written, and
 * the live probe's ARMED leg stopped blocking. Case and separators are therefore normalised away —
 * the spelling is the runtime's cosmetic choice, the EVENT is the fact.
 */
export function sameHookEvent(a, b) {
    const norm = (v) => v.toLowerCase().replace(/[-_\s]/g, '');
    return norm(a) === norm(b);
}
/**
 * The trust key codex uses: `<sourcePath>:<snake_event>:<groupIndex>:<hookIndex>`.
 *
 * This is the EXPECTED spelling, used only to cross-check what `hooks/list` reports. The install
 * path uses the reported key verbatim — a computed key that drifts from the runtime's would arm
 * nothing while reading like success.
 */
export function expectedTrustKey(registryPath, event, groupIndex, hookIndex) {
    return `${registryPath}:${trustEventName(event)}:${groupIndex}:${hookIndex}`;
}
/**
 * Split a `hooks/list` trust key into its parts, or `null` when it is not one.
 *
 * MEASURED shape: `<sourcePath>:<snake_event>:<groupIndex>:<hookIndex>`. The path may itself carry
 * a colon, so the split is anchored at the END — the last two fields are the indices and the third
 * from the end is the event.
 *
 * The INDICES are deliberately not predicted: they are positions inside the user's registry, and a
 * foreign entry shifts them. What IS ours to require is the rest — this key names OUR registry and
 * OUR event (fix round 2, R2-7: a row carrying an arbitrary key was selected on path+event+command
 * alone, and the key is what dz then writes trust against).
 */
export function parseTrustKey(key) {
    const m = /^(.*):([A-Za-z_][A-Za-z_]*):(\d+):(\d+)$/.exec(key);
    if (m === null)
        return null;
    return { sourcePath: m[1] ?? '', event: m[2] ?? '', groupIndex: Number(m[3]), hookIndex: Number(m[4]) };
}
/** TOML-escape a bare-string key (the key is an absolute path plus `:` separators). */
function tomlQuote(value) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
export const DZ_TRUST_BEGIN = '# --- dz codex hooks trust (managed block, dz-rewritten) ---';
export const DZ_TRUST_END = '# --- end dz codex hooks trust ---';
/**
 * Render dz's trust rows as a MANAGED BLOCK in `config.toml`.
 *
 * A managed block, not a whole-file rewrite: `~/.codex/config.toml` already carries a
 * `ruvnet-brain` managed block and seven `[projects."…"]` trust rows on this machine (MEASURED),
 * and dz is not the only writer. The block is delimited so a re-run replaces exactly dz's rows and
 * nothing else.
 */
export function renderTrustBlock(rows) {
    if (rows.length === 0)
        return '';
    const body = rows
        .map((r) => `[hooks.state.${tomlQuote(r.key)}]\ntrusted_hash = ${tomlQuote(r.trustedHash)}`)
        .join('\n');
    return `${DZ_TRUST_BEGIN}\n${body}\n${DZ_TRUST_END}\n`;
}
function countOccurrences(haystack, needle) {
    let n = 0;
    let i = haystack.indexOf(needle);
    while (i >= 0) {
        n += 1;
        i = haystack.indexOf(needle, i + needle.length);
    }
    return n;
}
/**
 * Replace (or append) dz's managed trust block, leaving every other byte of config.toml alone.
 *
 * The fence must be **exactly one well-ordered pair**, or dz refuses (independent review, finding
 * 9). The old `indexOf`-pair logic was satisfiable by a damaged file in three ways, and each one
 * eats the user's TOML on the NEXT sync: a lone BEGIN made the rewrite append a second block, so
 * the following run's `begin…end` window spanned everything between the orphan marker and the new
 * block's END; a reversed pair did the same; duplicate pairs left an orphan block behind. Refusing
 * costs one manual edit — the alternative silently deletes `[projects."…"]` trust rows.
 */
export function upsertTrustBlock(configToml, rows) {
    const block = renderTrustBlock(rows);
    const begins = countOccurrences(configToml, DZ_TRUST_BEGIN);
    const ends = countOccurrences(configToml, DZ_TRUST_END);
    const heal = `heal by hand: leave exactly one ${JSON.stringify(DZ_TRUST_BEGIN)} … ${JSON.stringify(DZ_TRUST_END)} pair (or delete both markers) and re-run`;
    if (begins > 1 || ends > 1) {
        return { ok: false, error: `config.toml carries ${begins} dz trust BEGIN and ${ends} END markers — dz refuses to guess which block is its own. ${heal}` };
    }
    if (begins !== ends) {
        return { ok: false, error: `config.toml carries an UNPAIRED dz trust marker (${begins} BEGIN, ${ends} END) — rewriting it would consume unrelated TOML. ${heal}` };
    }
    if (begins === 1) {
        const begin = configToml.indexOf(DZ_TRUST_BEGIN);
        const end = configToml.indexOf(DZ_TRUST_END);
        if (end < begin) {
            return { ok: false, error: `config.toml carries the dz trust END marker BEFORE its BEGIN — the fence is inverted and the span between them is not dz's. ${heal}` };
        }
        const before = configToml.slice(0, begin);
        const after = configToml.slice(end + DZ_TRUST_END.length).replace(/^\n/, '');
        return { ok: true, text: `${before}${block}${after}` };
    }
    const base = configToml === '' || configToml.endsWith('\n') ? configToml : `${configToml}\n`;
    return { ok: true, text: `${base}${base === '' ? '' : '\n'}${block}` };
}
/**
 * Pick, from a `hooks/list` response, the metadata of the entries WE wrote.
 *
 * The match is on THREE facts, not one (independent review, finding 7): the row's `sourcePath` is
 * the registry dz wrote, its `eventName` is the event dz registered the entry under, and the
 * command string is byte-equal. Command alone was not enough — a project-scoped
 * `<repo>/.codex/hooks.json` DOES load on codex 0.148 (MEASURED, see ADR-004's addendum), so a
 * shadow copy of dz's own command line could supply the `trusted` row that armed the user-global
 * entry nobody had approved.
 *
 * AMBIGUITY IS REFUSED, not resolved: two rows claiming the same entry drop BOTH, because the one
 * dz would arm is then a coin flip and the trust write is keyed by the row it picked.
 */
export function selectOwnHookMetadata(hooks, entries, options) {
    const byCommand = new Map(entries.map((e) => [e.command, e]));
    const claims = new Map();
    for (const meta of hooks) {
        if (typeof meta.command !== 'string')
            continue;
        const entry = byCommand.get(meta.command);
        if (entry === undefined)
            continue;
        if (meta.sourcePath !== options.registryPath)
            continue;
        if (!sameHookEvent(meta.eventName, trustEventName(entry.event)))
            continue;
        // The KEY is the thing dz writes trust against, so it — not just the row's other fields — has
        // to be the key our entry would own (R2-7). An arbitrary or foreign key is ambiguous by
        // construction: arming it would persist trust for something we cannot identify.
        const parsedKey = typeof meta.key === 'string' ? parseTrustKey(meta.key) : null;
        if (parsedKey === null)
            continue;
        if (parsedKey.sourcePath !== options.registryPath)
            continue;
        if (!sameHookEvent(parsedKey.event, trustEventName(entry.event)))
            continue;
        (claims.get(entry.id) ?? claims.set(entry.id, []).get(entry.id)).push({ id: entry.id, meta });
    }
    const out = [];
    for (const rows of claims.values()) {
        if (rows.length === 1)
            out.push(rows[0]);
    }
    return out;
}
//# sourceMappingURL=codex-hooks.js.map