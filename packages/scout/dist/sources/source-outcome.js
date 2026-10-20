/**
 * Что случилось с источником — ЧЕТЫРЕ исхода вместо двух.
 *
 * ЗАЧЕМ. Прежняя пара `ok | failed` выставляла `failed` только там, где обещание было ОТКЛОНЕНО.
 * Источник, вернувший пусто из-за кода ошибки (403 при исчерпании лимита запросов, 404), проходил
 * как `ok` с нулём — то есть его молчание было неотличимо от честного «ничего не нашлось».
 * Таймаута не было ни в одном источнике (`grep` по AbortController/AbortSignal/timeout — ноль
 * совпадений), поэтому состояние «не дождались» было невыразимо в принципе, а не просто не
 * заполнено.
 *
 * НОЛЬ — ЭТО РЕЗУЛЬТАТ, А НЕ ИСХОД. Исход говорит, БЫЛО ЛИ ИЗМЕРЕНИЕ; счётчик говорит, что оно
 * показало. Ноль при исходе `ok` — измеренный ноль и остаётся им.
 */
/** Бюджет времени на одно обращение к источнику. Названо константой: величину, которую нельзя
 *  прочитать, не обсуждают и потому не улучшают. */
export const SOURCE_BUDGET_MS = 15_000;
/**
 * Типизированный отказ источника.
 *
 * ПОЧЕМУ ИСКЛЮЧЕНИЕ, А НЕ ВОЗВРАЩАЕМОЕ ЗНАЧЕНИЕ (ADR-001, вариант B отвергнут): подпись всех
 * одиннадцати источников осталась прежней — массив записей. Переделка подписи разом означала бы
 * одно большое изменение вместо проверяемых частей. Непереведённые источники продолжают работать:
 * их обычные исключения по-прежнему становятся `failed`.
 *
 * ЧЕМ ЭТО ХРУПКО, названо честно: отказ через исключение легко проглотить небрежным `catch`.
 * Предикат `isSourceRefusal` делает небрежность заметной, но не невозможной — перехватив, обязан
 * либо обработать по типу, либо пробросить.
 */
export class SourceRefusal extends Error {
    kind;
    /** Код ответа, если источник ответил отказом. Для прочих форм отсутствует — не выдумывается. */
    status;
    /** Бюджет, который был превышен. Только для `timeout`. */
    budgetMs;
    constructor(kind, message, extra) {
        super(message);
        this.name = 'SourceRefusal';
        this.kind = kind;
        if (extra?.status !== undefined)
            this.status = extra.status;
        if (extra?.budgetMs !== undefined)
            this.budgetMs = extra.budgetMs;
    }
}
/**
 * Отказ ли это нашего вида. Проверяется по полям, а не по `instanceof`: последний ломается на
 * границе модулей, если пакет собран дважды.
 *
 * Форма проверяется ПО ПЕРЕЧНЮ, а не «строка ли это»: объект с `kind: 'bogus'` прошёл бы прежнюю
 * проверку и поехал дальше как значение объявленного объединения, которому он не принадлежит.
 */
export function isSourceRefusal(err) {
    const kind = err?.kind;
    return typeof err === 'object' && err !== null
        && err.name === 'SourceRefusal'
        && typeof kind === 'string' && REFUSAL_KINDS.includes(kind);
}
/** Перечень форм отказа. Закрыт: новая форма — осознанная правка здесь. */
export const REFUSAL_KINDS = ['refused', 'timeout', 'failed'];
/**
 * Обращение к сети с бюджетом ДО ЗАГОЛОВКОВ ОТВЕТА.
 *
 * ТОЧНАЯ ГРАНИЦА ОБЕЩАНИЯ, названная после кросс-семейного ревью 2026-09-03: таймер снимается,
 * как только `fetch` разрешился, то есть как только пришли ЗАГОЛОВКИ. Чтение ТЕЛА этим бюджетом
 * НЕ покрыто, и ответ, у которого заголовки пришли за миллисекунду, а тело не приходит никогда,
 * подвешивал бы прогон навсегда. Для полной операции есть `fetchJsonWithBudget` и
 * `fetchTextWithBudget` ниже — пользуйтесь ими, а этой функцией только там, где тело читается
 * под собственным бюджетом.
 *
 * ГОНКУ ВЫИГРЫВАЕТ ПРИШЕДШИЙ ОТВЕТ: таймер снимается в `finally`, а не оставляется догорать —
 * иначе он отменял бы уже полученный ответ и превращал измерение в отказ на ровном месте.
 *
 * НЕ-OK ОТВЕТ — ЭТО ОТКАЗ, А НЕ ПУСТОТА. Ровно здесь прежний код молчал: `if (res.ok)` без ветки
 * `else` не бросает, и подставленные значения уходили наружу как измеренные.
 *
 * ЧУЖОЙ СИГНАЛ ОТМЕНЫ НЕ ТЕРЯЕТСЯ: раньше `init.signal` молча затирался нашим, и внешняя отмена
 * переставала работать без единого следа. Теперь сигналы объединяются.
 */
export async function fetchWithBudget(url, init = {}, budgetMs = SOURCE_BUDGET_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    const signal = combineSignals(controller.signal, init.signal ?? undefined);
    let res;
    try {
        res = await fetch(url, { ...init, signal });
    }
    catch (err) {
        if (controller.signal.aborted) {
            throw new SourceRefusal('timeout', `${url}: не ответил за ${budgetMs} мс`, { budgetMs });
        }
        throw new SourceRefusal('failed', `${url}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
    }
    finally {
        clearTimeout(timer);
    }
    if (!res.ok) {
        throw new SourceRefusal('refused', `${url}: ответил ${res.status}`, { status: res.status });
    }
    return res;
}
/** Объединить наш бюджетный сигнал с сигналом вызывающего, не потеряв ни одного. */
function combineSignals(ours, theirs) {
    if (!theirs)
        return ours;
    // `AbortSignal.any` есть не во всех средах: там, где его нет, честно остаётся наш бюджет —
    // потерять внешнюю отмену плохо, но подменить её собственной реализацией слежения хуже.
    const any = AbortSignal.any;
    return typeof any === 'function' ? any([ours, theirs]) : ours;
}
/**
 * ПОЛНАЯ операция под ОДНИМ бюджетом: заголовки И тело.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ `fetchWithBudget`. Бюджет, покрывающий только заголовки, оставляет самый
 * неприятный отказ невыразимым: сервис отвечает 200 за миллисекунду и не отдаёт тело. Прогон
 * висит, а по журналу выглядит как «обращение идёт». Здесь таймер живёт до конца чтения тела,
 * поэтому такой ответ становится честным `timeout`.
 */
async function readWithBudget(url, init, budgetMs, as) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    const signal = combineSignals(controller.signal, init.signal ?? undefined);
    try {
        const res = await fetch(url, { ...init, signal });
        if (!res.ok) {
            throw new SourceRefusal('refused', `${url}: ответил ${res.status}`, { status: res.status });
        }
        return as === 'text' ? await res.text() : await res.json();
    }
    catch (err) {
        if (isSourceRefusal(err))
            throw err;
        if (controller.signal.aborted) {
            throw new SourceRefusal('timeout', `${url}: не ответил целиком за ${budgetMs} мс`, { budgetMs });
        }
        throw new SourceRefusal('failed', `${url}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Тело ответа как текст, под общим бюджетом с заголовками. */
export async function fetchTextWithBudget(url, init = {}, budgetMs = SOURCE_BUDGET_MS) {
    return await readWithBudget(url, init, budgetMs, 'text');
}
/** Тело ответа как JSON, под общим бюджетом с заголовками. */
export async function fetchJsonWithBudget(url, init = {}, budgetMs = SOURCE_BUDGET_MS) {
    return await readWithBudget(url, init, budgetMs, 'json');
}
/**
 * Правило частичного успеха, общее для всех источников с несколькими обращениями.
 *
 * ЗАЧЕМ ОБЩЕЕ, А НЕ ПО МЕСТУ. Источник, опрашивающий шесть ключевых слов, может получить два
 * отказа и четыре ответа. Если каждый источник решает такой случай сам, правила разойдутся —
 * и разойдутся молча, потому что расхождение видно только на отказе, которого в обычный день нет.
 *
 * ПРАВИЛО, дословно: если НИ ОДНО обращение не дало измерения, а отказ был хотя бы один — источник
 * ОТКАЗАЛ, и наверх уходит первый отказ со своей формой. Если измерения есть, источник вернул
 * их, но частичность НАЗЫВАЕТСЯ вслух: молчаливое усечение читается как «больше ничего нет».
 *
 * Пустота БЕЗ отказов — законный результат, а не отказ: источник ответил и ничего не нашёл.
 */
export function refuseIfNothingMeasured(measured, refusals, label) {
    const first = refusals[0];
    if (measured === 0 && first !== undefined)
        throw first;
    if (first !== undefined) {
        console.error(`${label}: измерено ${measured}, но ${refusals.length} из обращений отказали `
            + `(первый: ${first.kind} — ${first.message}). Результат ЧАСТИЧНЫЙ, а не полный.`);
    }
}
//# sourceMappingURL=source-outcome.js.map