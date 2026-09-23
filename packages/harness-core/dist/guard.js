// `dz guard` — a declarative constraint layer that runs BEFORE self-mutating operations (publish, teach,
// consolidate, reindex) and refuses when a HARD invariant is violated. Convergent shape from two RuvNet sources
// (SAFLA's Safety & Validation Framework + daa-rules v0.2.1): declarative rules + a pure evaluator + an
// append-only audit log. We DEPEND ON NEITHER — the engine is dz-native and reuses dz's own existing checks
// (skill-drift, publish gate) rather than reinventing them.
//
// COMPLEX INSIDE, SIMPLE OUTSIDE: the engine below is a fail-safe, op-scoped, HARD/SOFT rule evaluator; the CLI
// surface is just `dz guard check --op <op>` with built-in defaults that need zero configuration. `.dz/guard.json`
// only exists if you want to override a severity, disable a rule, or tune a parameter.
//
// PURE: `evaluateGuard` operates over INJECTED FACTS (package.json deps, a drift result, lesson text, README
// counts, store size) that the CLI gathers. No filesystem here → deterministic + unit-testable without a repo.
import { lessonRuleContentAnchor, templateFires, validTemplateParams } from './guard-promotion.js';
import { STUB_MARKERS, STUB_PHRASES, checkNoStubs } from './no-stubs.js';
import { VOLUME_SHADOW_RULE_IDS, evaluateVolumeShadow, unknownVolumeShadow, } from './guard-volume.js';
import { findReleaseLine } from './release-line.js';
// The 'code' operation checks facts already established when code changes, such as shared skill-copy
// drift or a stale signature on a pack whose files changed. Publication readiness (README, release
// lines, versions) belongs to publish. On 2026-09-21, story-page's stale signature surfaced six hours
// after the edit in harness-cli's tests, demonstrating why edit-time facts need an edit-time gate.
export const GUARD_OPS = [
    'publish',
    'teach',
    'consolidate',
    'reindex',
    'code',
];
/** The lowest `lockfileVersion` whose importers carry the `specifier:`/`version:` pair this parser reads. */
export const MIN_RECOGNISED_LOCKFILE_VERSION = 9;
/**
 * RECOGNISE-OR-REFUSE `pnpm-lock.yaml` importers parser — PURE, no YAML dependency. Reads exactly one
 * shape: `importers:` → `<path>:` → `<section>:` → `'<dep>':` → `specifier: <value>` (lockfileVersion 9+).
 *
 * "Tolerant" must mean *refuses to guess*, NOT *guesses quietly*. A half-parse is the dangerous outcome:
 * a lockfileVersion-6 file lists deps as `dep: version` one-liners under a separate `specifiers:` map, so
 * a lenient reader finds the importer KEYS, records ZERO specifiers, and the rule then reports every real
 * dependency as *"not recorded in pnpm-lock.yaml"* — a false-positive storm dressed up as fail-open. So we
 * return `undefined` (⇒ the rule reports NOTHING) unless every one of these holds:
 *   1. `lockfileVersion` is present and ≥ {@link MIN_RECOGNISED_LOCKFILE_VERSION};
 *   2. an `importers:` section exists and yields at least one importer;
 *   3. no legacy inline `dep: value` line appears at dependency depth (the v5/v6 shape);
 *   4. at least one `specifier:` was read, and NO importer came out empty (a truncated file, or a shape
 *      we do not understand, always trips this).
 *
 * `dependencies` and `devDependencies` are merged: a dep appears in only one of them per importer, and
 * the rule compares specifier strings only.
 */
export function parsePnpmLockImporters(lockText) {
    if (typeof lockText !== 'string' || lockText === '')
        return undefined;
    // (1) version gate — the ONLY layout this parser claims to understand.
    const versionLine = lockText.match(/^lockfileVersion:\s*['"]?([0-9]+(?:\.[0-9]+)?)['"]?\s*$/m);
    const version = versionLine?.[1] !== undefined ? Number.parseFloat(versionLine[1]) : Number.NaN;
    if (!Number.isFinite(version) || version < MIN_RECOGNISED_LOCKFILE_VERSION)
        return undefined;
    const importers = {};
    let inImporters = false;
    let current;
    let currentDep;
    let specifiersSeen = 0;
    let sawImportersKey = false;
    for (const line of lockText.split('\n')) {
        if (/^importers:\s*$/.test(line)) {
            inImporters = true;
            sawImportersKey = true;
            continue;
        }
        if (!inImporters)
            continue;
        if (/^\S/.test(line))
            break; // a new top-level key ends the importers section
        if (line.trim() === '')
            continue;
        const importer = line.match(/^ {2}(\S.*?):\s*$/);
        if (importer && importer[1] !== undefined) {
            current = unquoteYaml(importer[1]);
            importers[current] = importers[current] ?? {};
            currentDep = undefined;
            continue;
        }
        if (current === undefined)
            continue;
        // (3) a dependency-depth line that carries an INLINE value is the pre-v9 shape → refuse outright
        // rather than silently recording nothing for this importer.
        if (/^ {6}\S.*?:\s+\S/.test(line))
            return undefined;
        const dep = line.match(/^ {6}(\S.*?):\s*$/);
        if (dep && dep[1] !== undefined) {
            // A dep line while the PREVIOUS dep never got its specifier = a truncated/unrecognized shape —
            // refuse the whole parse rather than warn on a half-read (Codex re-QE: pending currentDep).
            if (currentDep !== undefined)
                return undefined;
            currentDep = unquoteYaml(dep[1]);
            continue;
        }
        const spec = line.match(/^ {8}specifier:\s*(.+?)\s*$/);
        if (spec && spec[1] !== undefined && currentDep !== undefined) {
            importers[current][currentDep] = unquoteYaml(spec[1]);
            specifiersSeen += 1;
            currentDep = undefined;
        }
    }
    // EOF with a dep still awaiting its specifier: truncated — refuse, never warn on a half-parse.
    if (currentDep !== undefined)
        return undefined;
    // (2) + (4) structural confidence: no importers, no specifiers, or ANY importer that came out empty
    // (truncation, an unread section shape) means we did not really parse this file — report nothing.
    if (!sawImportersKey || Object.keys(importers).length === 0 || specifiersSeen === 0)
        return undefined;
    for (const deps of Object.values(importers))
        if (Object.keys(deps).length === 0)
            return undefined;
    return importers;
}
function unquoteYaml(s) {
    const t = s.trim();
    if ((t.startsWith("'") && t.endsWith("'") && t.length >= 2) || (t.startsWith('"') && t.endsWith('"') && t.length >= 2)) {
        return t.slice(1, -1);
    }
    return t;
}
function inspectReleaseLines(evidence, severity) {
    const expected = evidence.coreVersion !== null && evidence.cliVersion !== null
        ? { core: evidence.coreVersion, cli: evidence.cliVersion }
        : null;
    const violations = [];
    const observations = [];
    for (const readme of evidence.readmes) {
        if (readme.text === null) {
            observations.push({
                schemaVersion: 'volume-shadow/v1', rule: 'release-line-in-sync',
                metric: 'release-line-version-sync', scope: readme.path, status: 'unknown', value: null,
                unit: 'artifact_set', signal: false, operands: {}, method: 'release-line-regex/v1',
                detail: 'файл не прочитан',
            });
            continue;
        }
        const found = findReleaseLine(readme.text);
        if (found === null) {
            observations.push({
                schemaVersion: 'volume-shadow/v1', rule: 'release-line-in-sync',
                metric: 'release-line-version-sync', scope: readme.path, status: 'unknown', value: null,
                unit: 'artifact_set', signal: false, operands: {}, method: 'release-line-regex/v1',
                detail: 'строка релиза не найдена',
            });
            continue;
        }
        if (evidence.workspaceVersions !== undefined) {
            const stale = [];
            const actual = [];
            const versions = [];
            const unknown = (detail) => {
                observations.push({
                    schemaVersion: 'volume-shadow/v1', rule: 'release-line-in-sync',
                    metric: 'release-line-version-sync', scope: readme.path, status: 'unknown', value: null,
                    unit: 'artifact_set', signal: false, operands: {}, method: 'release-line-regex/v1', detail,
                });
            };
            for (const token of found.tokens) {
                if (!Object.hasOwn(evidence.workspaceVersions, token.name)) {
                    unknown(`пакет \`${token.name}\` не собирается в этом монорепо — сверить не с чем`);
                    continue;
                }
                const version = evidence.workspaceVersions[token.name];
                if (typeof version !== 'string') {
                    unknown(`${token.name} package.json version не прочитана — сверить не с чем`);
                    continue;
                }
                actual.push(`${token.name} v${token.version}`);
                versions.push(`${token.name} v${version}`);
                if (token.version !== version) {
                    stale.push(`строка релиза говорит ${token.name} v${token.version}, package.json — v${version}`);
                }
            }
            if (found.wrapped)
                unknown('цепочка перенесена на следующую строку — продолжение вне охвата правила');
            if (actual.length > 0) {
                const mismatch = stale.length > 0;
                const detail = mismatch
                    ? `${readme.path}: ${stale.join('; ')}`
                    : `${readme.path}: строка релиза совпадает с package.json (${versions.join(', ')})`;
                observations.push({
                    schemaVersion: 'volume-shadow/v1', rule: 'release-line-in-sync',
                    metric: 'release-line-version-sync', scope: readme.path,
                    status: mismatch ? 'outside-reference' : 'within-reference', value: actual,
                    unit: 'artifact_set', signal: mismatch, operands: { actual, expected: versions },
                    method: 'release-line-regex/v1', detail,
                });
                if (mismatch)
                    violations.push({ rule: 'release-line-in-sync', severity, detail });
            }
            continue;
        }
        if (expected === null) {
            const missing = [
                ...(evidence.coreVersion === null ? ['harness-core package.json version'] : []),
                ...(evidence.cliVersion === null ? ['harness-cli package.json version'] : []),
            ];
            observations.push({
                schemaVersion: 'volume-shadow/v1', rule: 'release-line-in-sync',
                metric: 'release-line-version-sync', scope: readme.path, status: 'unknown', value: [found.core, found.cli],
                unit: 'artifact_set', signal: false, operands: { actual: [found.core, found.cli] },
                method: 'release-line-regex/v1', detail: `${missing.join(' и ')} не прочитана или не имеет форму N.N.N`,
            });
            continue;
        }
        const mismatch = found.core !== expected.core || found.cli !== expected.cli;
        const detail = mismatch
            ? `${readme.path}: строка релиза говорит core v${found.core}/cli v${found.cli}, package.json — v${expected.core}/v${expected.cli}`
            : `${readme.path}: строка релиза совпадает с package.json (${expected.core}/${expected.cli})`;
        observations.push({
            schemaVersion: 'volume-shadow/v1', rule: 'release-line-in-sync',
            metric: 'release-line-version-sync', scope: readme.path,
            status: mismatch ? 'outside-reference' : 'within-reference', value: [found.core, found.cli],
            unit: 'artifact_set', signal: mismatch,
            operands: { actual: [found.core, found.cli], expected: [expected.core, expected.cli] },
            method: 'release-line-regex/v1', detail,
        });
        if (mismatch)
            violations.push({ rule: 'release-line-in-sync', severity, detail });
    }
    return { violations, observations };
}
function inspectSignatureFresh(evidence, severity) {
    const violations = [];
    const observations = [];
    for (const pack of evidence) {
        if (!pack.changed)
            continue;
        if (pack.ok === false) {
            const firstFailure = pack.failures[0] ?? 'verification failed without a named reason';
            violations.push({
                rule: 'signature-fresh',
                severity,
                detail: `${pack.name}: files changed but the signed manifest is stale (${firstFailure}) — re-sign: dz sign --pack ${pack.dir} --key <key>`,
            });
        }
        else if (pack.ok === true) {
            observations.push({
                schemaVersion: 'volume-shadow/v1', rule: 'signature-fresh',
                metric: 'signed-manifest-freshness', scope: pack.name, status: 'within-reference', value: 1,
                unit: 'artifact_set', signal: false, operands: { changed: 1, verified: 1 },
                method: 'verify-manifest/v1', detail: `${pack.name}: ${pack.note ?? 'changed files still match its signed manifest'}`,
            });
        }
    }
    return { violations, observations };
}
/** The built-in rule set (works with no config). Ops are the mutating operations each rule guards. */
export const DEFAULT_RULES = [
    { id: 'rounds-closed', severity: 'soft', ops: ['publish'], description: 'focused rounds older than 120 minutes are named before publish; a dead owner is reported as an abandoned round' },
    { id: 'rounds-traced', severity: 'soft', ops: ['publish'], description: '10 or more package-code commits without a round ledger receipt are named; unavailable git evidence is not a pass' },
    { id: 'no-workspace-star', severity: 'hard', ops: ['publish'], description: 'a published package.json must carry no workspace:* dep (npm ships it verbatim → the install breaks)' },
    { id: 'plugin-manifest-audit', severity: 'hard', ops: ['publish'], description: 'every .claude-plugin/plugin.json parses and declares a non-empty name, description and a STRICT N.N.N version' },
    { id: 'sibling-dep-protocol', severity: 'hard', ops: ['publish'], description: 'a dependencies/devDependencies entry on a sibling @dzhechkov package must use the workspace: protocol on disk (peer/optional deps are deliberately exempt — a range is their point)' },
    { id: 'no-skill-drift', severity: 'hard', ops: ['publish', 'consolidate', 'code'], description: 'no unexpected byte-drift between shared skill copies' },
    { id: 'backlog-covers-features', severity: 'soft', ops: ['publish', 'consolidate'], description: 'каталог фичи, заведённый после базовой даты, назван записью бэклога — либо несёт именованную оговорку с причиной' },
    { id: 'no-secrets', severity: 'hard', ops: ['teach', 'publish'], description: 'no private key or API token in lesson text or a published file' },
    { id: 'readme-consistency', severity: 'soft', ops: ['publish'], description: 'README counts agree (CJM header vs All Commands, etc.)' },
    { id: 'release-line-in-sync', severity: 'soft', ops: ['publish'], description: 'root and harness-cli README release lines agree with the package.json version of every workspace package the line names' },
    { id: 'signature-fresh', severity: 'soft', ops: ['publish', 'code'], description: 'a pack whose files changed in this diff still verifies against its signed .dz-manifest.json — a stale signature is named before publish, not at the gate' },
    { id: 'skills-registrable', severity: 'soft', ops: ['publish'], description: 'every skill directory in a skill pack has a depth-1 SKILL.md (a buried or missing one ships un-registrable — the health-advisor 1.2.0 class)' },
    { id: 'readme-first', severity: 'soft', ops: ['publish'], description: 'a package with a staged version bump must update its own README.md in the same change (README-first)' },
    { id: 'routing-store-stale', severity: 'soft', ops: ['publish'], description: 'harvested routing telemetry has been applied to the auto-cost outcome store' },
    { id: 'marketplace-parity', severity: 'soft', ops: ['publish'], description: 'the published .claude-plugin/ showcase composition matches a fresh regeneration from the live registry (version excluded — an operator field)' },
    { id: 'template-context-token-weight', severity: 'soft', ops: ['publish'], description: 'observe the UTF-8-byte estimated token weight of each selected template context corpus; measured starting points are advisory only' },
    { id: 'template-context-largest-file-share', severity: 'soft', ops: ['publish'], description: 'observe the largest template file share on the same estimated-token basis as its corpus total; advisory only' },
    { id: 'feature-artifact-diff-ratio', severity: 'soft', ops: ['publish'], description: 'observe feature artifact bytes against attributable unified-diff bytes, explicitly a proxy; advisory only' },
    { id: 'feature-tier-artifact-set', severity: 'soft', ops: ['publish'], description: 'observe artifacts due for the recorded feature tier, active steps, consumers, and lifecycle; advisory only' },
    { id: 'agents-md-policy-sync', severity: 'soft', ops: ['publish'], description: 'proves the AGENTS.md copy is in SYNC with its source — not that the runtime read or obeyed it; heal drift with dz agents-sync' },
    { id: 'codex-wrapper-for-value-stage', severity: 'hard', ops: ['publish'], description: 'a workflow stage routed to the fire-and-forget codex wrapper must not have its return value consumed — the wrapper answers with a dispatch stub, never with the model' },
    { id: 'lockfile-in-sync', severity: 'soft', ops: ['publish'], description: 'every workspace @dzhechkov/* dependency spec matches the specifier pnpm-lock.yaml records for that importer (a dep bump without a lockfile refresh breaks CI with ERR_PNPM_OUTDATED_LOCKFILE). SOFT-ONLY — a config cannot promote it to HARD' },
    { id: 'store-bloat-cap', severity: 'soft', ops: ['teach', 'consolidate'], description: 'the learned store is within its size cap' },
    // Description ASSEMBLED from STUB_MARKERS so guard.ts itself stays clean under the scan it defines
    // (structural self-exemption — tested in no-stubs.test.ts).
    { id: 'no-stubs', severity: 'soft', ops: ['publish'], description: `an unfinished-stub marker (${STUB_MARKERS.join('/')} / "${STUB_PHRASES.join('", "')}") left in a CHANGED file — any unwaived match means the change ships incomplete; waive per line with "no-stubs: <reason>" or per path in .dz/guard.json stubWaivers (reason MANDATORY)` },
    { id: 'review-round', severity: 'hard', ops: ['publish'], description: 'a package publishing CHANGED SOURCE must bring a GRADED features/*/08_qe_report.md in the same change. Scoped to source so a docs-only republish is never blocked; the floor is PRESENCE of a grade unless .dz/guard.json sets reviewRound.minGrade. It proves a graded report EXISTS for this change — NOT that the review was independent, competent, or taken against this exact revision' },
    { id: 'licence-hold', severity: 'hard', ops: ['publish'], description: 'a pack that declares a licence hold (package.json.licenseHold — ADR-001 hermes-claude-adaptation) must not become publishable until the hold is satisfied: LICENSE present without the PENDING grant placeholder, a Grant-Confirmation URL, non-empty THIRD_PARTY_NOTICES, and a clean SPDX license field' },
];
/** The exact placeholder LICENSE marker the licence-hold rule looks for (shared with pack tests). */
export const LICENCE_HOLD_PENDING_MARKER = '<!-- PENDING:';
/**
 * Secret patterns — high-signal, low-false-positive. Each is anchored to a real credential shape, so ordinary
 * prose does not trip it. Extend deliberately (a broad `[A-Za-z0-9]{32}` would flag every hash).
 */
export const SECRET_PATTERNS = [
    { name: 'private-key-pem', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
    { name: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
    { name: 'stripe-key', re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
    { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
    { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
    { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
];
/** Scan text for secret shapes. Returns each match's pattern name (deduped) — never throws on hostile input. */
export function scanSecrets(text) {
    if (typeof text !== 'string' || text.length === 0)
        return [];
    const hits = new Set();
    for (const p of SECRET_PATTERNS)
        if (p.re.test(text))
            hits.add(p.name);
    return [...hits].map((name) => ({ name }));
}
export const SECRET_SCAN_OVERLAP_BYTES = 4096;
export function scanSecretsChunked(chunks, opts) {
    const overlapBytes = opts?.overlapBytes ?? SECRET_SCAN_OVERLAP_BYTES;
    const hits = new Set();
    let tail = Buffer.alloc(0);
    for (const chunk of chunks) {
        const window = Buffer.concat([tail, chunk]);
        const text = window.toString('utf8');
        for (const p of SECRET_PATTERNS)
            if (p.re.test(text))
                hits.add(p.name);
        if (hits.size === SECRET_PATTERNS.length)
            break;
        tail = window.subarray(Math.max(0, window.length - overlapBytes));
    }
    return [...hits].map((name) => ({ name }));
}
function secretWaiverState(waivers) {
    const waived = new Set();
    let reasonless = 0;
    for (const waiver of Array.isArray(waivers) ? waivers : []) {
        if (!waiver || typeof waiver !== 'object' || typeof waiver.path !== 'string' || waiver.path.trim() === '')
            continue;
        const reason = typeof waiver.reason === 'string' ? waiver.reason.trim() : '';
        if (reason.length > 0)
            waived.add(waiver.path);
        else
            reasonless++;
    }
    return { waived, reasonless };
}
/** Per-rule pure checkers. Each returns the violations it found (empty ⇒ clean). Missing evidence ⇒ []. */
/**
 * Какие каталоги фич заведены после базовой даты и НЕ названы ни одной записью бэклога.
 *
 * БАЗОВАЯ ДАТА — не украшение, а условие осмысленности. ИЗМЕРЕНО 2026-09-03: без неё правило даёт
 * 236 нарушений из 336 каталогов, а в окне «последние 7 дней» — 48 из 85. Проверка, изобретающая
 * полсотни нарушений в первый день, учит людей себя игнорировать, то есть хуже отсутствующей.
 * База делает правило зелёным на приходе и красным ровно на новом.
 *
 * ДАТА ПЕРВОГО КОММИТА, А НЕ mtime. Время правки меняет любой посторонний процесс — пересборка,
 * перенос, чтение с обновлением. Дата появления каталога в истории неподвижна. ЧЕСТНАЯ ГРАНИЦА:
 * функция ДОВЕРЯЕТ переданной строке и происхождение её не подтверждает — обязанность подать
 * именно git-дату лежит на вызывающем (сбор фактов в cli.ts). Здесь проверяется только то, что
 * строка вообще разбирается в дату.
 *
 * ЧТО ИМЕННО ПРОВЕРЯЕТСЯ В ОГОВОРКЕ — сказано точно, потому что ревью 2026-09-03 поймало
 * расхождение обещания с кодом. Машинно проверяется РОВНО одно: строка непуста после обрезки
 * пробелов. Осмысленность причины машинно не проверяема, и оговорка `x` пройдёт. Это сознательная
 * граница слоя: гейт заставляет РЕШЕНИЕ БЫТЬ ЗАПИСАННЫМ, а качество формулировки остаётся делом
 * человека — ровно как у освобождений заставы секретов и списка исключений дрейфа.
 *
 * БАЗА ВКЛЮЧИТЕЛЬНА: каталог, заведённый В САМ день базы, правилом контролируется («не раньше
 * базы», а не «после базы»).
 *
 * ЧЕГО ЭТА ПРОВЕРКА НЕ ЛОВИТ, названо честно: работу БЕЗ каталога фичи — разбор, ремонт, рой,
 * обещание «вернёмся». Машинного следа у них нет, и они остаются на слое 2 (текст правила в
 * CLAUDE.md). Утверждать, что правило покрыто целиком, было бы ложной гарантией.
 */
export function backlogCoversFeatures(features, backlogTexts, baseline) {
    // ДАТЫ СРАВНИВАЮТСЯ ЧИСЛАМИ, А НЕ СТРОКАМИ. Кросс-семейное ревью 2026-09-03 (gpt-5.6-sol, Grade D)
    // предъявило три входа, на которых строковое сравнение ISO даёт неверный ответ, и я воспроизвёл их
    // прогоном: `"   "` (пробелы лексикографически меньше любой даты — каталог освобождался),
    // `"2026-09-02T23:30:00-02:00"` (фактически ПОЗЖЕ базы, строково раньше), и разные формы записи
    // одной даты. Разбор в число снимает весь класс разом.
    const baseMs = Date.parse(baseline);
    const blob = backlogTexts.join('\n').toLowerCase();
    const out = [];
    for (const f of features) {
        if (typeof f.slug !== 'string' || f.slug.trim() === '')
            continue;
        // НЕРАЗБИРАЕМАЯ ИЛИ ОТСУТСТВУЮЩАЯ ДАТА — НЕ ОСВОБОЖДЕНИЕ. Каталог, чью дату появления не удалось
        // установить, считается новым: это отказ в сторону строгости. Обратный выбор превращал бы порчу
        // входа в способ обойти правило.
        const bornMs = typeof f.createdIso === 'string' ? Date.parse(f.createdIso.trim()) : Number.NaN;
        const born = Number.isFinite(bornMs) ? bornMs : Number.POSITIVE_INFINITY;
        if (Number.isFinite(baseMs) && born < baseMs)
            continue;
        if (typeof f.waiver === 'string' && f.waiver.trim() !== '')
            continue;
        if (mentionsSlug(blob, f.slug))
            continue;
        out.push(f.slug);
    }
    return out;
}
/**
 * Назван ли slug в тексте КАК ОТДЕЛЬНОЕ СЛОВО.
 *
 * Голый `includes` засчитывал совпадение внутри чужого слова: slug `log` считался покрытым записью
 * «обновить catalog schema», а `api` — записью «починить capitalization report» (примеры из
 * кросс-семейного ревью 2026-09-03, воспроизведены прогоном). Ложное покрытие опаснее ложного
 * срабатывания: оно ТИХО гасит правило ровно там, где оно нужно.
 *
 * Границей считается всё, кроме латинской буквы, цифры, подчёркивания и дефиса — дефис входит в
 * слово, потому что сами slug'и кебабные и `date-layers` не должен совпасть внутри
 * `dashboard-date-layers`.
 */
function mentionsSlug(haystackLower, slug) {
    const s = slug.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9_-])${s}($|[^a-z0-9_-])`).test(haystackLower);
}
const CHECKERS = {
    'rounds-closed': (f, sev) => f.openRounds
        .filter((round) => Number.isFinite(round.ageMinutes) && round.ageMinutes > 120)
        .map((round) => ({
        rule: 'rounds-closed',
        severity: sev,
        detail: round.pidAlive === false
            ? `abandoned round ${round.slug}#${round.round}: ${round.ageMinutes} min, owner pid is dead`
            : `${round.slug}#${round.round}: open round ${round.ageMinutes} min, owner pid ${round.pidAlive === true ? 'is alive' : 'liveness is unknown'}`,
    })),
    'rounds-traced': (f, sev) => {
        const fact = f.codeCommitsSinceLastRound;
        if (fact === undefined || fact.enabled === false || fact.commits === null || !Number.isFinite(fact.commits))
            return [];
        if (fact.commits < 10)
            return [];
        return [{
                rule: 'rounds-traced',
                severity: sev,
                detail: `${fact.commits} коммитов кода без единой строки круга с ${fact.since ?? 'неизвестной даты'}`,
            }];
    },
    'no-workspace-star': (f, sev) => {
        const out = [];
        for (const p of f.packages ?? []) {
            for (const [dep, spec] of Object.entries(p.deps ?? {})) {
                if (typeof spec === 'string' && spec.startsWith('workspace:')) {
                    out.push({ rule: 'no-workspace-star', severity: sev, detail: `${p.name}: ${dep} = "${spec}" (a published package must pin a real semver, not workspace:*)` });
                }
            }
        }
        return out;
    },
    'plugin-manifest-audit': (f, sev) => {
        /**
         * ЗНАЧЕНИЕ ЕСТЬ, ТОЛЬКО ЕСЛИ ОНО ВИДНО. `trim()` не убирает нулевой ширины пробел и его
         * родню, поэтому описание из одного `\u200B` проходило как заполненное — назвал независимый
         * ревьюер 2026-09-04. Считается видимым лишь то, что остаётся после удаления пробельных И
         * невидимых символов.
         */
        const visible = (v) => typeof v === 'string' && v.replace(/[\s\u00a0\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\ufeff]/g, '') !== '';
        /** Путь состава в сравнимом виде: `./skills/a` и `skills/a` — один каталог, а не два. */
        const normPath = (v) => typeof v === 'string'
            ? v.normalize('NFC').replace(/^\.\//, '').replace(/\/+$/, '').replace(/\/{2,}/g, '/')
            : null;
        // ПРОВЕРКА ПАСПОРТА НА ВХОДЕ. Правило `marketplace-parity` отвечает на другой вопрос — совпадает
        // ли витрина со свежей регенерацией. Если ГЕНЕРАТОР выдаст пустое описание или версию `1.0`,
        // parity будет доволен: копия совпадает с оригиналом, оба неверны. Здесь проверяется САМО
        // содержимое.
        //
        // ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ: приёма «имя манифеста равно имени каталога». ИЗМЕРЕНО 2026-09-04 на
        // 10 манифестах дерева — расхождение ровно одно и оно НАМЕРЕННОЕ: пакет называется
        // `loop-designer-plugin`, а плагин внутри него — `loop-designer`. Имя плагина есть
        // опубликованная личность и законно отличается от имени каталога, поэтому такая проверка
        // краснела бы на верном коде. Правило, изобретающее нарушения, учит людей себя игнорировать.
        // Ведущие нули запрещены (`01.2.3` — не строгая форма), и значение НЕ обрезается: пробел
        // вокруг версии в манифесте есть дефект манифеста, а не мелочь, которую следует простить.
        const STRICT_SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
        const out = [];
        for (const m of f.pluginManifests ?? []) {
            if (m.parseError !== undefined) {
                out.push({ rule: 'plugin-manifest-audit', severity: sev, detail: `${m.path}: манифест не разобрался — ${m.parseError}` });
                continue; // остальные поля у неразобранного манифеста не существуют
            }
            for (const field of ['name', 'description', 'version']) {
                // СОБСТВЕННОЕ свойство: манифест, чьи поля приходят из прототипа, ничего не объявил.
                const value = Object.hasOwn(m, field) ? m[field] : undefined;
                if (!visible(value)) {
                    out.push({ rule: 'plugin-manifest-audit', severity: sev, detail: `${m.path}: поле ${field} пусто или отсутствует` });
                }
            }
            const rawVersion = Object.hasOwn(m, 'version') ? m['version'] : undefined;
            if (visible(rawVersion) && !STRICT_SEMVER.test(rawVersion)) {
                out.push({ rule: 'plugin-manifest-audit', severity: sev, detail: `${m.path}: version = ${JSON.stringify(rawVersion)} — нужна строгая форма N.N.N без ведущих нулей и без пробелов` });
            }
            // ИНВЕНТАРИЗАЦИЯ В ОБЕ СТОРОНЫ: всё, что записано в накладной, лежит на складе, И всё, что
            // лежит на складе, вписано в накладную. Одна сторона ловит обещание без товара, другая —
            // товар, о котором никто не узнает. Класс, который эта пара закрывает: «счётчики поправили,
            // файлы не тронули».
            //
            // Обе стороны проверяются ТОЛЬКО когда обе улики есть: манифест без поля `skills` не
            // объявляет состава вовсе, и требовать от него совпадения значило бы выдумать обязательство.
            const declared = Array.isArray(m.declaredSkills) ? m.declaredSkills : undefined;
            const onDisk = Array.isArray(m.skillsOnDisk) ? m.skillsOnDisk : undefined;
            // ПОЛОВИНА УЛИК — НЕ УЛИКИ. Прежде состав, объявленный без осмотра диска, ТИХО пропускался,
            // а правило продолжало числиться проверенным: то самое «успех из тишины», против которого
            // оно и заведено (назвал независимый ревьюер 2026-09-04).
            if ((declared === undefined) !== (onDisk === undefined)) {
                out.push({
                    rule: 'plugin-manifest-audit', severity: sev,
                    detail: `${m.path}: есть только одна половина улик о составе (${declared !== undefined ? 'объявленное без осмотра диска' : 'осмотр диска без объявленного'}) — сверить нечем`,
                });
            }
            else if (declared !== undefined && onDisk !== undefined) {
                const normList = (xs) => xs.map(normPath).filter((x) => x !== null && x !== '');
                // Элемент не-строка — не путь. Молча его пропустить значило бы сверять неполные списки.
                const badDeclared = declared.filter((x) => normPath(x) === null).length;
                const badOnDisk = onDisk.filter((x) => normPath(x) === null).length;
                if (badDeclared > 0 || badOnDisk > 0) {
                    out.push({ rule: 'plugin-manifest-audit', severity: sev, detail: `${m.path}: в составе есть элементы, которые не являются путями (объявлено ${badDeclared}, на диске ${badOnDisk})` });
                }
                const have = new Set(normList(onDisk));
                const said = new Set(normList(declared));
                const missing = [...said].filter((n) => !have.has(n));
                const undeclared = [...have].filter((n) => !said.has(n));
                if (missing.length > 0) {
                    out.push({ rule: 'plugin-manifest-audit', severity: sev, detail: `${m.path}: объявлены, но НЕ найдены на диске: ${missing.join(', ')}` });
                }
                if (undeclared.length > 0) {
                    out.push({ rule: 'plugin-manifest-audit', severity: sev, detail: `${m.path}: лежат на диске, но НЕ объявлены: ${undeclared.join(', ')}` });
                }
            }
        }
        return out;
    },
    'sibling-dep-protocol': (f, sev) => {
        // ПАРА К `no-workspace-star`, а не противоречие ему: они говорят о РАЗНЫХ МОМЕНТАХ. На ДИСКЕ
        // сиблинг-зависимость обязана быть `workspace:` — тогда pnpm подставит реальную версию при
        // паковке. В ОПУБЛИКОВАННОМ манифесте `workspace:` быть не должно — npm отправляет его
        // дословно и ломает установку. Одно правило охраняет вход, другое выход.
        //
        // ОБЪЁМ СУЖЕН ИЗМЕРЕНИЕМ, а не осторожностью. Запись бэклога требовала протокол для ЛЮБОЙ
        // сиблинг-зависимости. Замер 2026-09-03 (56 пакетов, 60 сиблинг-зависимостей) показал 8
        // исключений — и ВСЕ восемь оказались `peerDependencies` (7) и `optionalDependencies` (1), где
        // диапазон и есть смысл записи: peer-зависимость объявляет, чему обязан удовлетворять
        // ПОТРЕБИТЕЛЬ, а `workspace:` при паковке превращается в точный пин, враждебный потребителю.
        // Одна из восьми — намеренная схема «dz как ОБНАРУЖИВАЕМАЯ необязательная зависимость».
        // То есть правило в исходной формулировке сломало бы работающий замысел; здесь оно охраняет
        // ровно те два поля, где протокол уместен, и на них нарушений сегодня НОЛЬ.
        const out = [];
        for (const d of f.siblingDeps ?? []) {
            // Поля читаются как ПРИМИТИВНЫЕ строки. Объект с унаследованным `startsWith`, всегда
            // возвращающим true, прежде проходил мимо правила — назвал независимый ревьюер 2026-09-04.
            const field = typeof d?.field === 'string' ? d.field : '';
            const spec = typeof d?.spec === 'string' ? d.spec : null;
            if (field !== 'dependencies' && field !== 'devDependencies')
                continue;
            if (spec === null) {
                out.push({ rule: 'sibling-dep-protocol', severity: sev, detail: `${String(d?.name)}: ${field}.${String(d?.dep)} — спецификатор не строка, сверить нечем` });
                continue;
            }
            if (spec.startsWith('workspace:'))
                continue;
            out.push({
                rule: 'sibling-dep-protocol',
                severity: sev,
                detail: `${d.name}: ${field}.${d.dep} = "${spec}" — a sibling package must be referenced through the workspace: protocol on disk, so pnpm substitutes the real version at pack time`,
            });
        }
        return out;
    },
    'no-skill-drift': (f, sev) => {
        const drifted = Array.isArray(f.drift) ? f.drift.filter((d) => typeof d === 'string') : [];
        const defects = Array.isArray(f.canonicalDefects) ? f.canonicalDefects.filter((d) => typeof d === 'string') : [];
        const out = [];
        if (drifted.length > 0)
            out.push({ rule: 'no-skill-drift', severity: sev, detail: `${drifted.length} skill(s) drift between copies: ${drifted.slice(0, 8).join(', ')}${drifted.length > 8 ? '…' : ''} — heal with dz sync-canonical` });
        if (defects.length > 0)
            out.push({ rule: 'no-skill-drift', severity: sev, detail: `${defects.length} canonical defect(s): ${defects.join(', ')} — fix the canon, not the copies` });
        return out;
    },
    'backlog-covers-features': (f, sev) => {
        const ev = f.featureBacklog;
        if (!ev)
            return [];
        const uncovered = backlogCoversFeatures(ev.features, ev.backlogTexts, ev.baseline);
        if (uncovered.length === 0)
            return [];
        return [{
                rule: 'backlog-covers-features',
                severity: sev,
                detail: `${uncovered.length} фич(и) заведены после ${ev.baseline} и не названы ни записью бэклога, ни причиной перехода: `
                    + `${uncovered.slice(0, 8).join(', ')}${uncovered.length > 8 ? '…' : ''}`
                    + ` — назови слаг в записи (dz backlog add) ЛИБО в причине закрытия`
                    + ` (dz backlog ship <id> --reason "<слаг>: что сделано") ЛИБО впиши оговорку в features/<slug>/README.md строкой`
                    + ` "Backlog: не заведено — <причина>". Оговорка без причины не считается.`,
            }];
    },
    'no-secrets': (f, sev) => {
        const out = [];
        const waived = secretWaiverState(f.secretWaivers).waived;
        for (const t of f.secretTargets ?? []) {
            if (waived.has(t.label))
                continue;
            for (const hit of scanSecrets(t.text)) {
                out.push({ rule: 'no-secrets', severity: sev, detail: `${t.label}: looks like a ${hit.name} — do not teach/publish a credential` });
            }
        }
        for (const hit of f.secretFindings ?? []) {
            if (waived.has(hit.label))
                continue;
            out.push({ rule: 'no-secrets', severity: sev, detail: `${hit.label}: looks like a ${hit.name} — do not teach/publish a credential` });
        }
        return out;
    },
    'readme-consistency': (f, sev) => {
        const out = [];
        for (const c of f.counts) {
            if (Number.isFinite(c.a) && Number.isFinite(c.b) && c.a !== c.b) {
                out.push({ rule: 'readme-consistency', severity: sev, detail: `${c.label}: ${c.a} ≠ ${c.b} (README counts disagree)` });
            }
        }
        return out;
    },
    'skills-registrable': (f, sev) => {
        // The health-advisor 1.2.0 class, mechanized at publish time: a skill directory that ships with
        // no depth-1 SKILL.md registers NOWHERE, however green the tests are. SOFT: the discriminator is
        // a heuristic (a pack counts only if it already has one registrable skill, and only
        // markdown-bearing dirs are considered intended), so it informs rather than blocks.
        const out = [];
        for (const p of f.skillPacks) {
            if (!p || !Array.isArray(p.nonRegistrable) || p.nonRegistrable.length === 0)
                continue;
            out.push({
                rule: 'skills-registrable',
                severity: sev,
                detail: `${p.name}: ${p.nonRegistrable.length} skill dir(s) would ship un-registrable (no depth-1 SKILL.md): ${p.nonRegistrable.join(', ')} — run \`dz skills-verify --static\``,
            });
        }
        return out;
    },
    'readme-first': (f, sev) => {
        // The 2026-07-18 violation shape, mechanized: a package about to publish (version bumped in the diff)
        // whose own README.md is untouched in the same diff. SOFT: some republishes legitimately need no doc
        // change — the point is that skipping the README becomes a VISIBLE decision, not a silent lapse.
        const out = [];
        for (const p of f.readmeFirst) {
            if (p && p.versionBumped === true && p.readmeChanged !== true) {
                out.push({ rule: 'readme-first', severity: sev, detail: `${p.name}: version bumped but its README.md is untouched in this change — README-first: document the change (or consciously proceed; this warning is the record)` });
            }
        }
        return out;
    },
    'routing-store-stale': (f, _sev) => {
        const ids = f.routingFreshness?.unfedRunIds;
        if (!Array.isArray(ids) || ids.length === 0)
            return [];
        const valid = [...new Set(ids.filter((id) => typeof id === 'string' && id !== ''))].sort();
        if (valid.length === 0)
            return [];
        return [{
                rule: 'routing-store-stale',
                severity: 'soft',
                detail: `${valid.length} harvested run(s) are not reflected in the auto-cost store: ${valid.slice(0, 5).join(', ')}${valid.length > 5 ? '…' : ''} — run dz routing recommend --apply`,
            }];
    },
    'marketplace-parity': (f, _sev) => {
        const fact = f.marketplaceParity;
        if (fact === undefined || fact.applicable !== true)
            return [];
        const hasPublishedVersion = typeof fact.publishedVersion === 'string' && fact.publishedVersion !== '';
        const fix = `dz plugin --version ${hasPublishedVersion ? fact.publishedVersion : 'X.Y.Z'}`;
        const fixHint = hasPublishedVersion ? '' : ' (substitute the published version for X.Y.Z)';
        const manifestFailures = Array.isArray(fact.manifestFailures)
            ? fact.manifestFailures.filter((failure) => failure
                && (failure.file === 'plugin.json' || failure.file === 'marketplace.json')
                && typeof failure.error === 'string'
                && failure.error !== '')
            : [];
        if (manifestFailures.length > 0) {
            return manifestFailures.map((failure) => ({
                rule: 'marketplace-parity',
                severity: 'soft',
                detail: `.claude-plugin/${failure.file} exists but could not be read or parsed: ${failure.error} — run \`${fix}\`${fixHint} and commit the result`,
            }));
        }
        if (fact.onlyOnePresent === true) {
            return [{
                    rule: 'marketplace-parity',
                    severity: 'soft',
                    detail: `.claude-plugin/ has only one of plugin.json / marketplace.json — a broken half-showcase; run \`${fix}\`${fixHint} and commit the result`,
                }];
        }
        if (fact.regenerateFailed === true) {
            return [{
                    rule: 'marketplace-parity',
                    severity: 'soft',
                    detail: 'could not verify .claude-plugin/ composition because fresh regeneration failed',
                }];
        }
        if (fact.diverged === true) {
            return [{
                    rule: 'marketplace-parity',
                    severity: 'soft',
                    detail: `.claude-plugin/ composition does not match a fresh regeneration from the live registry — run \`${fix}\`${fixHint} and commit the result`,
                }];
        }
        return [];
    },
    'review-round': (f, sev) => {
        // The publish gate had eleven rules and not one asked whether anyone but the author had read the
        // code. MEASURED cost (health-advisor slice H): five rounds graded F, thirteen packages published
        // on the author's own verification, and round six found six defects in ALREADY-PUBLISHED code.
        //
        // Scoped to CHANGED SOURCE on purpose (ADR-001): a HARD rule that also fired on a docs-only
        // republish would be a rule someone switches off. `undefined` facts mean the tree could not be
        // read — HAS_INPUT records NOT-ESTABLISHED, not an accusation.
        const rr = f.reviewRound;
        if (rr === undefined)
            return [];
        const min = typeof rr.minGrade === 'string' ? rr.minGrade.trim().toUpperCase() : undefined;
        // The grade must BE a letter, not merely START with one: keyed on the first character alone,
        // "approved" reads as an A and "broken" as a B (found by cross-family review). The fact gatherer
        // already extracts a bounded letter, so this is defence in depth — and a pure function has no
        // business being looser than its caller.
        const rank = (g) => {
            const t = String(g ?? '').trim().toUpperCase();
            return t.length === 1 ? 'ABCDF'.indexOf(t) : -1;
        };
        const graded = rr.grades.filter((g) => rank(g.grade) >= 0);
        const out = [];
        for (const p of rr.packages) {
            if (!(p.versionBumped === true && p.sourceChanged === true))
                continue;
            if (graded.length === 0) {
                out.push({
                    rule: 'review-round',
                    severity: sev,
                    detail: `${p.name}: source changed and the version is bumped, but this change brings no GRADED features/*/08_qe_report.md — a publish gate that cannot tell "reviewed" from "not reviewed" treats them alike. (This proves a graded report EXISTS in this change; it does NOT prove the review was independent, was competent, covered THIS package, or was taken against this revision.)`,
                });
                continue;
            }
            if (min !== undefined && rank(min) >= 0) {
                const best = graded.reduce((a, b) => (rank(a.grade) <= rank(b.grade) ? a : b));
                if (rank(best.grade) > rank(min)) {
                    out.push({
                        rule: 'review-round',
                        severity: sev,
                        detail: `${p.name}: the best review grade in this change is ${best.grade.trim()} (${best.report}), below the configured floor ${min} — .dz/guard.json reviewRound.minGrade`,
                    });
                }
            }
        }
        return out;
    },
    'agents-md-policy-sync': (f, _sev) => {
        const fact = f.policyDrift;
        if (!fact || fact.applicable !== true || !Array.isArray(fact.drifted))
            return [];
        const drifted = fact.drifted.filter((item) => typeof item === 'string');
        return drifted.length === 0 ? [] : [{
                rule: 'agents-md-policy-sync',
                severity: 'soft',
                detail: `${drifted.length} AGENTS.md policy section(s) are out of sync: ${drifted.slice(0, 8).join(', ')}${drifted.length > 8 ? '…' : ''} — heal with: dz agents-sync`,
            }];
    },
    /**
     * The fire-and-forget wrapper returns a DISPATCH STUB, so a stage whose deliverable is its
     * return value gets a receipt instead of an answer. MEASURED 2026-08-31: eight stages of one
     * research swarm each returned "Codex Task started in the background as task-…", downstream
     * agents built on those stubs, and no artifact was produced. The misuse is visible in the
     * program text — the stage's result is assigned to a name that a later prompt interpolates —
     * so it belongs on layer 1 rather than in a rule nobody re-reads.
     */
    'codex-wrapper-for-value-stage': (f, sev) => {
        const scripts = f.workflowScripts; // Presence is established by HAS_INPUT.
        if (scripts.length === 0)
            return [];
        const out = [];
        for (const s of scripts) {
            const text = String(s.text ?? '');
            // Find `const <name> = await agent(… codex:codex-rescue …)` and ask whether <name> is later
            // interpolated into another prompt. Assignment alone is not the defect: a stage may keep its
            // handle for logging. Consumption in a prompt is what proves the VALUE was the deliverable.
            const re = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+agent\(([\s\S]{0,4000}?)\)\s*(?:\n|;)/g;
            for (const m of text.matchAll(re)) {
                const name = String(m[1]);
                const call = String(m[2]);
                if (!/codex:codex-rescue/.test(call))
                    continue;
                const consumed = new RegExp('\\$\\{\\s*(?:String\\()?' + name.replace(/[.*+?^{}()|[\]\\]/g, '\\$&') + '\\b');
                if (consumed.test(text)) {
                    out.push({
                        rule: 'codex-wrapper-for-value-stage',
                        severity: sev,
                        detail: `${s.path}: stage "${name}" is routed to codex:codex-rescue AND its result is interpolated into another prompt — the wrapper returns a dispatch stub, so that prompt would receive a receipt, not an answer. Invoke codex synchronously (dz codex / codex exec) for a stage whose deliverable is its return value.`,
                    });
                }
            }
        }
        return out;
    },
    'lockfile-in-sync': (f, _sev) => {
        // The 2026-07-28 CI break, mechanized: an overnight dep bump edited package.json and left
        // pnpm-lock.yaml stale, so `pnpm install --frozen-lockfile` died with ERR_PNPM_OUTDATED_LOCKFILE.
        // SOFT + FAIL-OPEN: no lockfile evidence ⇒ NO violation. A guard that cannot read the lockfile must
        // never invent one — a false block on publish costs more than the miss it prevents.
        // The injected severity is IGNORED on purpose (MED-6): this rule emits `soft` unconditionally, so
        // neither a config promotion nor a hand-built rules array can turn a tolerant parser into a blocker.
        const sev = 'soft';
        const lock = f.lockfile;
        if (!lock || typeof lock !== 'object' || lock.parsed !== true || !Array.isArray(lock.importers))
            return [];
        const out = [];
        for (const imp of lock.importers) {
            if (!imp || typeof imp.importer !== 'string' || !imp.declared || typeof imp.declared !== 'object')
                continue;
            const declared = Object.entries(imp.declared).filter(([dep, spec]) => dep.startsWith('@dzhechkov/') && typeof spec === 'string');
            if (declared.length === 0)
                continue;
            if (imp.locked === undefined || imp.locked === null) {
                out.push({
                    rule: 'lockfile-in-sync',
                    severity: sev,
                    detail: `${imp.importer}: declares ${declared.length} @dzhechkov/* dep(s) but has no importer entry in pnpm-lock.yaml — run \`pnpm install\` (CI installs with --frozen-lockfile)`,
                });
                continue;
            }
            for (const [dep, spec] of declared) {
                const locked = imp.locked[dep];
                if (locked === undefined) {
                    out.push({ rule: 'lockfile-in-sync', severity: sev, detail: `${imp.importer}: ${dep} = "${spec}" is not recorded in pnpm-lock.yaml — run \`pnpm install\` (CI installs with --frozen-lockfile)` });
                }
                else if (locked !== spec) {
                    out.push({ rule: 'lockfile-in-sync', severity: sev, detail: `${imp.importer}: ${dep} = "${spec}" in package.json but "${locked}" in pnpm-lock.yaml — run \`pnpm install\` to refresh the lockfile (CI installs with --frozen-lockfile)` });
                }
            }
        }
        return out;
    },
    'store-bloat-cap': (f, sev) => {
        const s = f.store;
        if (!s || !Number.isFinite(s.count) || !Number.isFinite(s.cap) || s.cap <= 0)
            return [];
        return s.count <= s.cap ? [] : [{ rule: 'store-bloat-cap', severity: sev, detail: `learned store has ${s.count} patterns, over the cap of ${s.cap} — run dz consolidate --prune-noise` }];
    },
    'no-stubs': (f, sev) => {
        // Backlog 0b403a0106103901 (Karpathy-Michaels rule XI), layer-1 on the cost-of-detection ladder:
        // a stub marker left in a file of THIS change-set means the task shipped incomplete. SCOPE is the
        // change-set on purpose (MEASURED: a whole-tree scan is ~78% ancient-marker noise and would be
        // switched off within a day). SOFT: it warns — an unfinished stub is a fact worth a record, but a
        // publish of an unrelated package must not be blocked by it. Fail-open on missing evidence: no
        // `change` fact, or a changed file whose contents were not gathered, reports nothing.
        const ch = f.change;
        if (!ch || typeof ch !== 'object' || !Array.isArray(ch.files))
            return [];
        return checkNoStubs(ch.files, ch.contents, f.stubWaivers).map((s) => ({
            rule: 'no-stubs',
            severity: sev,
            detail: s.kind === 'marker'
                ? `${s.path}:${s.line}: stub marker "${s.detail}" in a changed file — finish it, or waive the line with "no-stubs: <reason>" (or .dz/guard.json stubWaivers with a reason)`
                : `${s.path}${s.line > 0 ? ':' + s.line : ''}: ${s.detail}`,
        }));
    },
    'licence-hold': (f, sev) => {
        // ADR-001 (hermes-claude-adaptation), machine-armed: a pack parked behind a licence hold carries
        // `private:true` (the npm layer refuses it) + a `licenseHold` trigger field. THIS rule is the second
        // belt — it fires the moment the pack becomes PUBLISHABLE (private dropped) while the hold is still
        // unsatisfied, and refuses `dz publish` HARD. Clearing the hold means: real LICENSE (no PENDING
        // placeholder, a Grant-Confirmation URL), non-empty THIRD_PARTY_NOTICES, and a clean SPDX id in
        // package.json.license. The trigger field itself stays — a satisfied hold passes with it in place.
        const out = [];
        for (const p of f.licenceHold ?? []) {
            if (!p || typeof p.name !== 'string')
                continue;
            if (p.privateFlag === true)
                continue; // npm refuses it; other packs' publishes stay unblocked
            const problems = [];
            const lic = (p.licenseText ?? '').trim();
            const notices = (p.noticesText ?? '').trim();
            if (lic.length < 40)
                problems.push('LICENSE missing or empty');
            else {
                if (lic.includes(LICENCE_HOLD_PENDING_MARKER))
                    problems.push('LICENSE still carries the PENDING grant placeholder');
                if (!/Grant-Confirmation:\s*https?:\/\/\S+/.test(lic))
                    problems.push('LICENSE has no "Grant-Confirmation: <url>" line');
            }
            if (notices.length < 40)
                problems.push('THIRD_PARTY_NOTICES missing or empty');
            const field = (p.licenseField ?? '').trim();
            if (!/^[A-Za-z0-9][A-Za-z0-9.+-]*(\s+(AND|OR|WITH)\s+[A-Za-z0-9][A-Za-z0-9.+-]*)*$/.test(field) || /^UNLICENSED$/i.test(field)) {
                problems.push(`package.json license "${field}" is not a clean SPDX id`);
            }
            if (problems.length > 0) {
                out.push({ rule: 'licence-hold', severity: sev, detail: `${p.name}: publishable (private flag removed) but the ADR-001 licence hold is UNSATISFIED — ${problems.join('; ')}` });
            }
        }
        return out;
    },
};
// Missing volume means NOT-ESTABLISHED. A throwing getter is INTENTIONALLY treated as present
// so volume() can emit honest 'unknown' observations instead of failing in the precondition.
// This preserves the older contract: test/guard.test.ts:725,
// "a hostile volume getter becomes visible unknown evidence instead of a HARD checker error".
const volumeInputPresent = (f) => {
    try {
        return f.volume !== undefined;
    }
    catch {
        return true;
    }
};
/** Per-rule evidence predicates. No entry preserves the rule's existing checked behaviour exactly. */
const HAS_INPUT = {
    'rounds-traced': (f) => {
        const fact = f.codeCommitsSinceLastRound;
        return fact !== undefined && fact.enabled !== false && typeof fact.commits === 'number' && Number.isFinite(fact.commits);
    },
    // `!== undefined` пропускал `null`: правило объявлялось проверенным и возвращало чисто по
    // ветке «улик нет». Это буквально отсутствие улик, отчитанное как проверка (назвал независимый
    // ревьюер 2026-09-04).
    'backlog-covers-features': (f) => typeof f.featureBacklog === 'object' && f.featureBacklog !== null,
    // Страж без улик не выдумывает вердикт: в дереве без сиблинг-зависимостей правилу нечего
    // сказать, и «прошло» тут значило бы «не смотрели».
    'sibling-dep-protocol': (f) => Array.isArray(f.siblingDeps) && f.siblingDeps.length > 0,
    // Дерево без плагин-манифестов правилу нечего сказать: «прошло» тут значило бы «не смотрели».
    'plugin-manifest-audit': (f) => Array.isArray(f.pluginManifests) && f.pluginManifests.length > 0,
    'no-secrets': (f) => (Array.isArray(f.secretTargets) && f.secretTargets.length > 0)
        || Array.isArray(f.secretFindings) || typeof f.secretScan?.scanned === 'number',
    'release-line-in-sync': (f) => typeof f.releaseLines === 'object' && f.releaseLines !== null,
    // 2026-09-21: на одном дереве с дрейфом publish=block, а code=pass без собранного факта drift.
    'no-skill-drift': (f) => Array.isArray(f.drift),
    'review-round': (f) => f.reviewRound !== undefined,
    'no-workspace-star': (f) => Array.isArray(f.packages),
    'codex-wrapper-for-value-stage': (f) => Array.isArray(f.workflowScripts),
    'signature-fresh': (f) => Array.isArray(f.signedPacks),
    'rounds-closed': (f) => Array.isArray(f.openRounds),
    'readme-consistency': (f) => Array.isArray(f.counts),
    'skills-registrable': (f) => Array.isArray(f.skillPacks),
    'readme-first': (f) => Array.isArray(f.readmeFirst),
    'store-bloat-cap': (f) => f.store !== undefined,
    'template-context-token-weight': volumeInputPresent,
    'template-context-largest-file-share': volumeInputPresent,
    'feature-artifact-diff-ratio': volumeInputPresent,
    'feature-tier-artifact-set': volumeInputPresent,
};
/**
 * Rules that may NEVER be promoted to HARD, whatever a config says. A rule whose evidence comes from a
 * deliberately tolerant parser must not be able to BLOCK an operation: the parser's own design admits it
 * may not understand a file, and "I might be wrong" plus "block the publish" is the wrong pair. Disabling
 * such a rule stays allowed — only the promotion is refused.
 */
export const SOFT_ONLY_RULES = [
    'lockfile-in-sync',
    'agents-md-policy-sync',
    'routing-store-stale',
    'marketplace-parity',
    ...VOLUME_SHADOW_RULE_IDS,
];
/**
 * A well-formed PROMOTED rule: an id the engine does not know, made enforceable by a template +
 * params from the fixed `dz guard promote` vocabulary. Anything half-formed is NOT one, so a
 * hand-edited config cannot smuggle an id past the un-enforceable-rule fail-safe by sprinkling a
 * `template` key on it.
 */
export function isTemplateRule(r) {
    return !!r && typeof r === 'object' && validTemplateParams(r.template, r.params);
}
/**
 * The template checker: ONE predicate (`templateFires`) shared with the promoter's historical
 * replay, so the rule the promoter promised and the rule the guard enforces can never diverge.
 * Fail-open on missing evidence (no `change` fact ⇒ nothing reported) and on `undecidable`
 * (a `format-match` whose file contents were not gathered is not a clean change, it is no evidence).
 */
function templateChecker(rule) {
    return (f) => {
        const ch = f.change;
        if (!ch || typeof ch !== 'object' || !Array.isArray(ch.files))
            return [];
        const change = { id: 'working-tree', ts: '', files: ch.files, ...(ch.contents !== undefined ? { contents: ch.contents } : {}) };
        const r = templateFires(rule.template, rule.params, change);
        if (Object.hasOwn(r, 'undecidable') || !r.fired)
            return [];
        // A promoted rule is ALWAYS soft, whatever severity reaches this point (belt to resolveRules' braces).
        return [{
                rule: rule.id,
                severity: 'soft',
                detail: `${r.detail ?? 'template rule fired'} (promoted rule — advisory)`,
                contentAnchor: lessonRuleContentAnchor(rule.template, rule.params),
            }];
    };
}
/**
 * Merge a user config over the defaults: override severity, disable (enabled:false), never add an
 * un-checked rule — EXCEPT a well-formed template rule (a `dz guard promote` promotion), which is
 * enforceable by construction and is forced SOFT.
 */
export function resolveRules(userRules) {
    const byId = new Map(DEFAULT_RULES.map((r) => [r.id, r]));
    for (const u of Array.isArray(userRules) ? userRules : []) {
        if (!u || typeof u.id !== 'string')
            continue;
        const base = byId.get(u.id);
        if (!base) {
            // A PROMOTED rule may introduce a new id — but only fully formed, and only SOFT. A promoted
            // rule is derived by a text heuristic from an agent-written lesson: strictly weaker provenance
            // than `lockfile-in-sync`'s tolerant parser, which is already SOFT-only. "I might be wrong"
            // plus "block the publish" is the wrong pair (ADR-004).
            if (isTemplateRule(u)) {
                const ops = Array.isArray(u.ops) && u.ops.every((o) => GUARD_OPS.includes(o)) && u.ops.length > 0 ? u.ops : ['publish'];
                byId.set(u.id, {
                    id: u.id,
                    severity: 'soft',
                    ops,
                    description: typeof u.description === 'string' ? u.description : `promoted rule (${u.template})`,
                    ...(typeof u.enabled === 'boolean' ? { enabled: u.enabled } : {}),
                    template: u.template,
                    params: u.params,
                });
            }
            continue; // a config rule with no built-in checker is ignored (fail-safe: no un-enforceable rules)
        }
        // A SOFT-ONLY rule keeps its severity even when the config asks for hard (see SOFT_ONLY_RULES).
        const severity = u.severity === 'hard' || u.severity === 'soft' ? u.severity : undefined;
        const allowedSeverity = severity !== undefined && !(severity === 'hard' && SOFT_ONLY_RULES.includes(u.id)) ? severity : undefined;
        byId.set(u.id, {
            ...base,
            ...(allowedSeverity !== undefined ? { severity: allowedSeverity } : {}),
            ...(typeof u.enabled === 'boolean' ? { enabled: u.enabled } : {}),
        });
    }
    return [...byId.values()];
}
/**
 * Evaluate the guard for one operation over injected facts. Fail-safe: a checker that throws is caught and
 * DEMOTED to a HARD violation (a rule that cannot decide must not silently pass). Verdict: any hard violation
 * ⇒ block; else any soft ⇒ warn; else pass.
 */
export function evaluateGuard(facts, rules = DEFAULT_RULES) {
    const op = facts.op;
    // Type-guarded filter: hostile rule entries (null, ops not an array, missing id) are DROPPED here rather
    // than throwing mid-filter — the never-throws contract holds against a malformed rules array too.
    const active = (Array.isArray(rules) ? rules : []).filter((r) => !!r && typeof r === 'object' && typeof r.id === 'string' && r.enabled !== false && Array.isArray(r.ops) && r.ops.includes(op));
    const violations = [];
    const checked = [];
    const notEstablished = [];
    const observations = [];
    let volumeResult;
    let volumeEvaluated = false;
    const volume = () => {
        if (volumeEvaluated)
            return volumeResult ?? { observations: [], signals: [], notes: [] };
        volumeEvaluated = true;
        try {
            volumeResult = evaluateVolumeShadow(facts.volume);
        }
        catch (error) {
            volumeResult = unknownVolumeShadow('volume-evaluator-failure', error instanceof Error ? error.message : String(error));
        }
        return volumeResult;
    };
    for (const r of active) {
        const hasInput = HAS_INPUT[r.id];
        // ПРЕДИКАТ УЛИК ИСПОЛНЯЕТСЯ ПОД ЗАЩИТОЙ. Прежде он стоял вне `try`, и факт с бросающим
        // геттером ронял весь страж вместо того, чтобы стать отказом (назвал независимый ревьюер
        // 2026-09-04). Гейт, падающий на враждебном входе, не даёт вердикта вообще.
        let inputPresent;
        try {
            inputPresent = hasInput === undefined ? true : hasInput(facts);
        }
        catch (error) {
            // Бросок в предикате улик и бросок в чекере обязаны нести общий маркер fail-closed:
            // страж не смог решить и потому обвиняет, а не оправдывает; какой перехватчик был первым, потребителю неважно.
            violations.push({
                rule: r.id, severity: r.severity,
                detail: `улики правила нечитаемы (${error instanceof Error ? error.message : String(error)}) — правило считается НАРУШЕННЫМ, а не пройденным (fail-closed)`,
            });
            checked.push(r.id);
            continue;
        }
        if (!inputPresent) {
            // A rule with nothing to measure cannot produce a positive receipt. Keep the verdict unchanged,
            // but record the missing input explicitly instead of calling the rule checked.
            notEstablished.push(r.id);
            continue;
        }
        checked.push(r.id);
        if (r.id === 'readme-first') {
            for (const p of facts.readmeFirst ?? []) {
                if (p?.versionUnknown !== true)
                    continue;
                observations.push({
                    schemaVersion: 'volume-shadow/v1', rule: 'readme-first',
                    metric: 'package-version-changed-from-head', scope: p.name, status: 'unknown', value: null,
                    unit: 'artifact_set', signal: false, operands: {}, method: 'git-show-head-package-version/v1',
                    detail: `${p.name}: package version could not be compared with HEAD; readme-first stayed advisory and emitted no violation`,
                });
            }
        }
        if (r.id === 'release-line-in-sync') {
            const inspection = inspectReleaseLines(facts.releaseLines, r.severity);
            observations.push(...inspection.observations);
            violations.push(...inspection.violations);
            continue;
        }
        if (r.id === 'signature-fresh') {
            const inspection = inspectSignatureFresh(facts.signedPacks, r.severity);
            observations.push(...inspection.observations);
            violations.push(...inspection.violations);
            continue;
        }
        if (VOLUME_SHADOW_RULE_IDS.includes(r.id)) {
            const emission = volume();
            observations.push(...emission.observations.filter((item) => item.rule === r.id));
            violations.push(...emission.signals
                .filter((signal) => signal.rule === r.id)
                .map((signal) => ({ rule: signal.rule, severity: 'soft', detail: signal.detail })));
            continue;
        }
        // A promoted (template) rule has no built-in checker by design — it is enforceable through the
        // shared `templateFires` predicate instead. Without this branch a promoted rule written into
        // `.dz/guard.json` would be INERT: present in the config, listed as checked, enforcing nothing —
        // the exact false-green shape this feature exists to remove (ADR-004).
        const checker = CHECKERS[r.id] ?? (isTemplateRule(r) ? templateChecker(r) : undefined);
        if (!checker) {
            // A rule the caller asked for that has no checker CANNOT silently pass while reporting as checked —
            // that is the smuggled-rule hole. Fail closed: unenforceable ⇒ a HARD violation.
            violations.push({ rule: r.id, severity: 'hard', detail: 'no built-in checker for this rule — cannot enforce (fail-closed)' });
            continue;
        }
        try {
            violations.push(...checker(facts, r.severity));
        }
        catch (e) {
            // `e` may be ANYTHING (throw null / throw 'str') — format it without touching .message on a non-Error.
            violations.push({ rule: r.id, severity: 'hard', detail: `rule check errored (fail-closed): ${e instanceof Error ? e.message : String(e)}` });
        }
    }
    const verdict = violations.some((v) => v.severity === 'hard') ? 'block' : violations.length > 0 ? 'warn' : 'pass';
    // FN-7 — the fail-open skips go ON THE RECORD. The no-stubs scan is fail-open by contract
    // (missing contents ⇒ nothing reported), but a skip nobody can see is fail-SILENT. One aggregate
    // note, computed AFTER the verdict so it can never block or warn: information, not a violation.
    const notes = [];
    // Only `checked`: when the chronicle read fails, the collector still supplies `featureBacklog`
    // (the error field can only live INSIDE that object), so HAS_INPUT holds and the rule is never
    // in `notEstablished` with an error to report. The second half was dead by construction —
    // MEASURED by mutation, Step 8, 22.09.2026: removing it turned no test red.
    if (checked.includes('backlog-covers-features')) {
        const error = facts.featureBacklog?.transitionLogError;
        if (typeof error === 'string' && error.trim() !== '') {
            notes.push(`backlog-covers-features: летопись переходов не прочитана (${error}) — покрытие проверено только по текстам записей бэклога`);
        }
    }
    if (notEstablished.includes('rounds-traced')) {
        const fact = facts.codeCommitsSinceLastRound;
        if (fact?.enabled === false)
            notes.push('rounds-traced: skipped (.dz/config.json rounds.traced=false)');
        else if (fact?.commits === null)
            notes.push(fact.since === null
                ? 'rounds-traced: not measured (ledger has no dated rows)'
                : 'rounds-traced: not measured (git unavailable)');
    }
    if (checked.includes('no-stubs')) {
        const skipped = facts.change?.stubSkipped;
        if (typeof skipped === 'number' && Number.isFinite(skipped) && skipped > 0) {
            notes.push(`no-stubs: ${skipped} changed scannable file(s) not scanned (deleted/oversize/unreadable/beyond the file cap) — the stub scan is fail-open, so this is a coverage gap on the record, not a violation`);
        }
    }
    if (checked.includes('no-secrets') || notEstablished.includes('no-secrets')) {
        const reasonless = secretWaiverState(facts.secretWaivers).reasonless;
        if (reasonless > 0) {
            notes.push(`no-secrets: ${reasonless} reasonless secret waiver(s) ignored — add a non-empty reason or remove the entry`);
        }
        const skipped = facts.secretScan?.skipped;
        if (typeof skipped === 'number' && Number.isFinite(skipped) && skipped > 0) {
            // MEASURED 2026-09-21: the count alone hid that harness-cli's own src/cli.ts and dist/cli.js
            // (1.3 MiB each, both packed) are among the never-scanned items — name them, capped.
            // Codex review (B): the legacy sentence stays byte-identical for consumers that match it whole;
            // the names are APPENDED after it. "…and N more" counts from the FACT's `skipped`, not from the
            // list length, so a partial list never understates the gap.
            const paths = facts.secretScan?.skippedPaths ?? [];
            const shown = paths.slice(0, 6);
            const rest = Math.max(skipped - shown.length, 0);
            const named = shown.length > 0
                ? ` — skipped: ${shown.join(', ')}${rest > 0 ? `, …and ${rest} more` : ''}`
                : '';
            // Codex r2: NO trailing period — the legacy sentence must stay byte-identical, names follow after a space.
            notes.push(`no-secrets: ${skipped} packed inventory item(s) not scanned (oversize/unreadable/binary) — the secret scan is fail-open, so this is a coverage gap on the record, not a violation${named}`);
        }
        // Lead fix (guard-change-fact regression): a fixture with zero publishable packages yields an EMPTY
        // inventory string — 'present but empty' is not a source to report; only a non-empty summary is a line.
        const inventoryLine = facts.secretScan?.inventory;
        if (typeof inventoryLine === 'string' && inventoryLine.trim().length > 0) {
            notes.push(`no-secrets: inventory: ${inventoryLine}`);
        }
    }
    if (checked.includes('review-round') && facts.reviewRound?.gathered === false) {
        // A wholly absent fact is already NOT-ESTABLISHED via HAS_INPUT; this note covers an explicit
        // failed gathering attempt on a present fact only.
        // A HARD gate that passes SILENTLY when it could not gather its evidence is a gate you cannot
        // tell from one that checked and approved (raised by cross-family review). It still does not
        // BLOCK — absence of facts is ignorance, not an accusation, and blocking every non-git checkout
        // would make the rule unusable — but the ignorance goes on the record.
        notes.push('review-round: the working-tree change could not be read, so NO review evidence was gathered — this run neither confirms nor denies that the code was reviewed');
    }
    if (checked.includes('agents-md-policy-sync')) {
        // A repo that never opted in (no `dz:policies` fence in AGENTS.md) is OUT OF SCOPE, not
        // inconclusive — noting it on every run would put a permanent line in a channel that exists to
        // flag genuine coverage gaps, and a note that is always there is a note nobody reads.
        // Opted in but sources unreadable IS a gap, and stays loud.
        if (facts.policyDrift === undefined) {
            notes.push('agents-md-policy-sync: policy drift evidence was unavailable; the advisory rule skipped with a recorded coverage gap, not a silent pass');
        }
        else if (facts.policyDrift.applicable !== true && facts.policyDrift.fenced === true) {
            notes.push('agents-md-policy-sync: this repository carries a dz:policies fence but its canonical policy sources are unreadable — the advisory rule could not compare, and that gap is on the record, not a silent pass');
        }
    }
    for (const item of observations) {
        if (item.status === 'unknown')
            notes.push(`${item.rule} ${item.scope}: ${item.detail}`);
    }
    return {
        op,
        verdict,
        violations,
        checked,
        notEstablished,
        ...(notes.length > 0 ? { notes } : {}),
        ...(observations.length > 0 ? { observations } : {}),
    };
}
/** Build the audit record for a guard evaluation (+ an optional forced-override reason). Pure. */
export function auditRecord(result, ts, override) {
    return {
        ts,
        op: result.op,
        verdict: result.verdict,
        violations: result.violations,
        ...(Array.isArray(result.notes) && result.notes.length > 0 ? { notes: result.notes } : {}),
        ...(Array.isArray(result.observations) && result.observations.length > 0 ? { observations: result.observations } : {}),
        ...(override && typeof override.reason === 'string' ? { override: { forced: true, reason: override.reason } } : {}),
        ...(evaluatedRuleIds(result).length > 0 ? { evaluated: evaluatedRuleIds(result) } : {}),
    };
}
/**
 * Every rule that got its turn this run, sorted and de-duplicated. A rule with no input still RAN —
 * calling that "not evaluated" would reintroduce the very conflation this field exists to remove.
 */
export function evaluatedRuleIds(result) {
    const ids = new Set();
    for (const id of Array.isArray(result.checked) ? result.checked : [])
        if (typeof id === 'string' && id !== '')
            ids.add(id);
    for (const id of Array.isArray(result.notEstablished) ? result.notEstablished : [])
        if (typeof id === 'string' && id !== '')
            ids.add(id);
    return [...ids].sort();
}
/** The exit-code contract: a block is non-zero unless forced; a warn/pass is zero. */
export function guardExitCode(result, forced) {
    return result.verdict === 'block' && !forced ? 1 : 0;
}
//# sourceMappingURL=guard.js.map