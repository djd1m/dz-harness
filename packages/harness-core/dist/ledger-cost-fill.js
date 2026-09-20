/**
 * Заполнение пустых полей стоимости в леджере прогонов ИЗ ЗАПИСИ ХОСТА.
 *
 * ЗАЧЕМ. Запись 3c026d5d: стоимость фичи на три четверти набита руками. ИЗМЕРЕНО 2026-09-19 по
 * живому `.dz/feature-adr/run-cost-ledger.jsonl`: 393 строки, из них 293 без числа токенов.
 * Числа при этом НЕ пропали — для прогонов Workflow они лежат в записи хоста
 * `~/.claude/projects/<проект>/<сессия>/workflows/wf_<runId>.json`, где есть `totalTokens`,
 * `durationMs` и `agentCount`. Песочница воркфлоу их видеть не может (у неё нет файловой системы
 * и нет уведомления о завершении), поэтому соединение делается СНАРУЖИ и ПОСЛЕ прогона.
 *
 * ЧЕСТНАЯ ДОСЯГАЕМОСТЬ, и она меньше, чем подразумевает запись. Из 293 пустых строк:
 *   • 75 — прогоны Workflow (`auto:true`); только их и может достать это соединение,
 *          и лишь 25 из них несут `runId`, по которому запись хоста находится СЕГОДНЯ;
 *   • 218 — ручные круги ведущего, для которых записи хоста НЕ СУЩЕСТВУЕТ ПО ПОСТРОЕНИЮ:
 *          Workflow не запускался, и стоимость этим путём не восстановима в принципе.
 * То есть механизм закрывает не «три четверти», а максимум 26% разрыва, а сегодня 9%.
 * Остальное — задача ПИСАТЕЛЯ (проставлять пригодный `runId`) и отдельный вопрос про то,
 * чем мерить ручные круги.
 *
 * ПРОВЕНАНС ОБЯЗАТЕЛЕН. Заполненное поле помечается `costSource: 'derived'`, потому что
 * выведенное число и набранное руками — разные по доверию величины, и строка, где их нельзя
 * различить, обесценивает обе.
 */
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
/**
 * Прочитать стоимость из записи хоста. `null`, если запись не несёт обязательных чисел —
 * частичная запись НЕ даёт частичного заполнения: половина выведенной строки хуже пустой,
 * потому что выглядит как измерение.
 */
export function readHostRunCost(record) {
    if (record === null || typeof record !== 'object')
        return null;
    const r = record;
    if (!isFiniteNumber(r['totalTokens']) || !isFiniteNumber(r['durationMs']))
        return null;
    if (r['totalTokens'] < 0 || r['durationMs'] < 0)
        return null;
    return {
        tokens: r['totalTokens'],
        minutes: Math.round(r['durationMs'] / 60_000),
        agents: isFiniteNumber(r['agentCount']) ? r['agentCount'] : null,
    };
}
/**
 * Заполнить ТОЛЬКО пустые поля. Уже набранное руками число НИКОГДА не перетирается: оно могло
 * быть исправлено человеком по другим основаниям, и выведенное значение не имеет права его
 * вытеснять. Возвращает `null`, если заполнять нечего — чтобы вызывающий не переписывал файл зря.
 */
export function fillLedgerCost(row, derived) {
    const next = { ...row };
    let filled = false;
    if (!isFiniteNumber(row['tokens'])) {
        next['tokens'] = derived.tokens;
        filled = true;
    }
    if (!isFiniteNumber(row['minutes'])) {
        next['minutes'] = derived.minutes;
        filled = true;
    }
    if (!isFiniteNumber(row['agents']) && derived.agents !== null) {
        next['agents'] = derived.agents;
        filled = true;
    }
    if (!filled)
        return null;
    // Провенанс ставится ТОЛЬКО когда что-то действительно заполнено.
    next['costSource'] = 'derived';
    return next;
}
/** Решение по одной строке: чем она разрешается и почему. */
export function decideFill(row, record) {
    const derived = record === undefined ? null : readHostRunCost(record);
    if (derived === null)
        return { outcome: 'no-host-record', next: null };
    const next = fillLedgerCost(row, derived);
    return next === null ? { outcome: 'nothing-to-fill', next: null } : { outcome: 'filled', next };
}
//# sourceMappingURL=ledger-cost-fill.js.map