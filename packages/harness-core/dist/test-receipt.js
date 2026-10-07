/**
 * Квитанция зелёного прогона: «эта область исходников была протестирована ИМЕННО в этом виде».
 *
 * ЗАЧЕМ ЭТО ЕСТЬ. Два процессных грабля повторялись месяцами и повторились снова 21.09 ПОСЛЕ того,
 * как напоминание о них было поднято: «объявил сделанным без проверки» (пять случаев) и «коммит без
 * прогона тестов» (шесть). Напоминание — слой суждения, и он молчит, когда отказывает. Владелец
 * согласился поднять проверку на слой 1, но с условием: коммиты должны остаться дешёвыми. Поэтому
 * проверка стоит не на коммите, а на ПУШЕ, и спрашивает не «прогони тесты», а квитанцию.
 *
 * ПОЧЕМУ ПО ОБЛАСТЯМ, А НЕ ЦЕЛИКОМ. ИЗМЕРЕНО 21.09: полный прогон набора harness-cli на этой машине
 * не завершается — надзиратель фоновых задач убивает его по памяти при любом дроблении. Гейт,
 * требующий квитанцию ПОЛНОГО прогона, заблокировал бы каждый push навсегда. Квитанция покрывает
 * названные области, и отказ касается только тех, что изменились без покрытия.
 *
 * ЧЕГО ЭТА ПРОВЕРКА НЕ ОБЕЩАЕТ, и это сказано здесь, а не в отчёте потом:
 *  · она не запускает тесты и не знает, ХОРОШИ ли они — только что прогон был и был зелёным;
 *  · она сравнивает СОДЕРЖИМОЕ рабочего дерева, а не набор пушимых коммитов;
 *  · она ничего не говорит о коммитах, которые никогда не пушат;
 *  · зелёный прогон ДРУГОЙ области не покрывает изменённую — это и есть смысл разбиения.
 */
const canonicalPath = (path) => typeof path === 'string' &&
    !/^[A-Za-z]:|[\\\x00-\x1f\x7f-\x9f]/.test(path) && path.split('/').every((p) => p !== '' && p !== '.' && p !== '..');
const canonicalScope = (scope) => ['tests', 'scripts', '.githooks'].includes(scope) ||
    (canonicalPath(scope) && /^packages\/[^/]+(?:\/[^/]+)?$/.test(scope));
const rootAssociations = {
    scripts: ['tests/test-receipt-script.test.mjs', 'tests/prepush-receipt-gate.test.mjs', 'scripts/catalog-inventory-evidence.test.mjs', 'scripts/generate-catalog-docs.test.mjs'],
    '.githooks': ['tests/prepush-receipt-gate.test.mjs', 'tests/prepush-drift-gate.test.mjs'],
};
export function receiptTestPathMatchesScope(scope, path) {
    if (!canonicalScope(scope) || !canonicalPath(path))
        return false;
    if (scope === 'tests')
        return path.startsWith('tests/');
    if (rootAssociations[scope])
        return rootAssociations[scope].includes(path);
    return ['src', 'test', 'tests'].some((dir) => path.startsWith(`${scope}/${dir}/`));
}
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const object = (v) => v !== null && typeof v === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(v)) && Reflect.ownKeys(v).every((k) => typeof k === 'string' && Object.getOwnPropertyDescriptor(v, k)?.enumerable === true);
const keys = (v, expected) => object(v) &&
    Object.keys(v).length === expected.length && expected.every((k) => Object.hasOwn(v, k));
const array = (v) => Array.isArray(v) &&
    Reflect.ownKeys(v).length === v.length + 1 && Object.keys(v).length === v.length && Object.keys(v).every((k, i) => k === String(i));
function observed(receipt) {
    if (!keys(receipt, ['v', 'ts', 'command', 'observationId', 'schema', 'scopes', 'segments', 'evidence']) ||
        receipt.v !== 2 || receipt.schema !== 'observed-test-execution-1' ||
        typeof receipt.ts !== 'string' || !Number.isFinite(Date.parse(receipt.ts)) ||
        new Date(receipt.ts).toISOString() !== receipt.ts || typeof receipt.command !== 'string' || !receipt.command ||
        typeof receipt.observationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(receipt.observationId) ||
        !object(receipt.scopes) || !object(receipt.evidence))
        return false;
    const scopes = Object.keys(receipt.scopes);
    if (!scopes.length || !keys(receipt.evidence, scopes) || !scopes.every((scope) => canonicalScope(scope) && typeof receipt.scopes[scope] === 'string' && receipt.scopes[scope] !== ''))
        return false;
    if (!array(receipt.segments) || !receipt.segments.length)
        return false;
    const files = [];
    for (const segment of receipt.segments) {
        if (!keys(segment, ['runner', 'complete', 'failed', 'files']) ||
            !['node-test', 'vitest'].includes(segment.runner) || segment.complete !== true || segment.failed !== 0 ||
            !array(segment.files) || !segment.files.length)
            return false;
        const counts = new Map();
        let total = 0;
        for (const file of segment.files) {
            if (!keys(file, ['path', 'executed']) || !canonicalPath(file.path) || !positive(file.executed) || counts.has(file.path))
                return false;
            counts.set(file.path, file.executed);
            total += file.executed;
            if (!Number.isSafeInteger(total))
                return false;
        }
        files.push(counts);
    }
    return scopes.every((scope) => {
        const evidence = receipt.evidence[scope];
        if (!keys(evidence, ['executed', 'segments']) || !positive(evidence.executed) ||
            !array(evidence.segments) || !evidence.segments.length)
            return false;
        const indices = new Set();
        let total = 0;
        for (const contribution of evidence.segments) {
            if (!keys(contribution, ['index', 'paths']) || !Number.isSafeInteger(contribution.index) ||
                contribution.index < 0 || contribution.index >= files.length || indices.has(contribution.index) ||
                !array(contribution.paths) || !contribution.paths.length || new Set(contribution.paths).size !== contribution.paths.length)
                return false;
            indices.add(contribution.index);
            for (const path of contribution.paths) {
                if (!canonicalPath(path) || !receiptTestPathMatchesScope(scope, path) || !files[contribution.index].has(path))
                    return false;
                total += files[contribution.index].get(path);
                if (!Number.isSafeInteger(total))
                    return false;
            }
        }
        return total === evidence.executed;
    });
}
/**
 * Чистое решение. Ничего не читает и не запускает — отпечатки и журнал подаёт вызывающий.
 *
 * Три исхода, а не два, намеренно: «не установлено» — это НЕ «покрыто». Гейт, выводящий пропуск из
 * пустого входа, тихо ломается на каждом новом способе получить пустой вход.
 */
export function decideTestReceipt(input) {
    const current = input.current ?? {};
    const scopes = Object.keys(current).sort();
    if (scopes.length === 0) {
        return { state: 'not-established', reason: 'ни одна наблюдаемая область не разрешилась — проверка была бы вакуумной' };
    }
    for (const scope of scopes) {
        if (typeof current[scope] !== 'string' || current[scope] === '') {
            return { state: 'not-established', reason: `отпечаток области ${scope} не вычислен — вердикт не о чем выносить` };
        }
    }
    const receipts = (Array.isArray(input.receipts) ? input.receipts : []).filter((r) => !!r && typeof r === 'object' && r.scopes !== null && typeof r.scopes === 'object');
    const uncovered = [];
    for (const scope of scopes) {
        const digest = current[scope];
        let seenAt = null;
        let covered = false;
        const unobservedReasons = new Set();
        for (const receipt of receipts) {
            const recorded = receipt.scopes[scope];
            if (typeof recorded !== 'string')
                continue;
            if (!observed(receipt)) {
                unobservedReasons.add(receipt.v === 1 ? 'legacy' : receipt.v !== 2 ? 'unsupported-version' : 'invalid-v2');
                continue;
            }
            if (typeof receipt.ts === 'string' && (seenAt === null || receipt.ts > seenAt))
                seenAt = receipt.ts;
            if (recorded === digest) {
                covered = true;
                break;
            }
        }
        if (!covered)
            uncovered.push({ scope, digest, why: seenAt !== null ? 'changed' : unobservedReasons.size ? 'unobserved' : 'never',
                lastGreenAt: seenAt, ...(seenAt === null && unobservedReasons.size ? { unobservedReasons: [...unobservedReasons].sort() } : {}) });
    }
    return uncovered.length === 0 ? { state: 'covered', scopes } : { state: 'stale', uncovered };
}
/** Одна строка для человека. Отказ обязан говорить, ЧТО запустить, а не только что всё плохо. */
export function renderTestReceiptVerdict(verdict) {
    if (verdict.state === 'covered') {
        return `test-receipt: покрыто — ${verdict.scopes.length} област(и) в том же виде, в каком были зелёными`;
    }
    if (verdict.state === 'not-established') {
        return `test-receipt: НЕ УСТАНОВЛЕНО — ${verdict.reason}. Это не пропуск и не отказ по существу`;
    }
    const lines = verdict.uncovered.map((item) => item.why === 'never'
        ? `  · ${item.scope}: зелёного прогона не было НИ РАЗУ`
        : item.why === 'unobserved' ? `  · ${item.scope}: missing observation — история без подтверждённого исполнения (${item.unobservedReasons?.join(', ')})`
            : `  · ${item.scope}: изменилась после последнего зелёного прогона (${item.lastGreenAt})`);
    const hints = verdict.uncovered.map(({ scope }) => {
        if (scope.startsWith('packages/')) {
            const wrapper = `${'../'.repeat(scope.split('/').length)}scripts/with-test-receipt.sh`;
            return `  rerun from ${scope}: ${wrapper} ${scope} -- npx vitest run <test-file>; for Node tests use ${wrapper} ${scope} -- node --test <test-file>`;
        }
        const file = scope === 'scripts' ? 'tests/test-receipt-script.test.mjs' : 'tests/prepush-receipt-gate.test.mjs';
        return `  rerun from repository root: scripts/with-test-receipt.sh ${scope} -- node --test ${file}`;
    });
    return [`test-receipt: НЕ ПОКРЫТО — ${verdict.uncovered.length} област(и):`, ...lines, ...hints].join('\n');
}
//# sourceMappingURL=test-receipt.js.map