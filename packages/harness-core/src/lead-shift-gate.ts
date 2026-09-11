/**
 * Сторож смены лида: отказать в завершении хода, пока санкционированная работа не кончилась.
 *
 * ЗАЧЕМ ЭТО СУЩЕСТВУЕТ — два измеренных происшествия, второе после починки первого.
 *
 * 2026-08-29: простой ~4,5 часа. Лид «мониторил» задачи, чьи родители давно умерли, и считал
 * очередь непустой. Лечением стало ПРАВИЛО в `.claude/rules/lead-idle-discipline.md`.
 *
 * 2026-09-03: простой **6 часов 24 минуты**. Лид отработал 19:16–23:15, написал утренний отчёт,
 * ЗАВЕРШИЛ ХОД и молчал до 05:38. Очередь была не просто непустой — 352 открытые записи, и
 * незакрытая работа была перечислена самим лидом абзацем выше в том же отчёте. Правило,
 * написанное после первого случая, читалось каждый прогон и не сработало.
 *
 * Вывод, который и породил этот файл: **текст второго слоя лестницы стоимости обнаружения не
 * ловит собственный молчаливый отказ.** Правило нельзя «не выполнить с ошибкой» — его можно
 * только не вспомнить, и снаружи это неотличимо от выполнения. Поэтому решение переносится на
 * слой 1: детерминированная функция, у которой есть красный тест.
 *
 * СТРУКТУРНАЯ ТРУДНОСТЬ, названная честно: завершение хода — это ОТСУТСТВИЕ дальнейших вызовов,
 * а не событие. Перехватить «модель перестала работать» нельзя. Зато харнесс даёт шов `Stop`,
 * который срабатывает на попытке закончить ход и умеет её ЗАБЛОКИРОВАТЬ. Этот файл — решающая
 * половина такого гейта; вторая половина, тонкий адаптер, живёт в хуке.
 *
 * АТАКА, СЛОМАВШАЯ ПЕРВУЮ РЕДАКЦИЮ (Codex gpt-5.6-sol, xhigh, 2026-09-03, вердикт «НЕ СРАБОТАЕТ»).
 * Первая редакция разрешала ПОВТОРНУЮ остановку автоматически — как защиту от зацикливания.
 * Приём обхода: получить отказ, ответить «принято, продолжу», не сделать ни одного рабочего
 * действия, остановиться снова — и второй раз пропускали. Итог был бы тот же простой плюс одна
 * запись в журнале. Поэтому здесь повторная остановка разрешается НЕ ПО ФАКТУ ПОВТОРНОСТИ, а
 * только по машинному свидетельству прогресса (см. `hasProgress`).
 */

/** Машинное свидетельство того, что между двумя попытками остановиться что-то произошло. */
export interface ProgressEvidence {
  /** `git rev-parse HEAD` на момент прошлой блокировки и сейчас. */
  readonly headBefore?: string | undefined;
  readonly headNow?: string | undefined;
  /** sha256 от `git status --porcelain` — ловит правку, ещё не ставшую коммитом. */
  readonly treeHashBefore?: string | undefined;
  readonly treeHashNow?: string | undefined;
  /** Идентификаторы живых фоновых задач тогда и сейчас. */
  readonly liveTasksBefore?: readonly string[] | undefined;
  readonly liveTasksNow?: readonly string[] | undefined;
  /**
   * Пункты очереди, закрытые между попытками, вместе с доказательством закрытия.
   * `evidenceExists` считает ВЫЗЫВАЮЩИЙ, проверив путь или коммит на существование: закрытие
   * без существующего доказательства прогрессом не считается, иначе «закрыть» станет строкой.
   */
  readonly closedItems?: readonly { readonly id: string; readonly evidenceExists: boolean }[] | undefined;
}

/** Состояние смены: что владелец санкционировал и в каком режиме идёт работа. */
export interface LeadShift {
  /** `autonomous` — владелец отпустил лида работать без присмотра; иначе сторож спит. */
  readonly mode: 'autonomous' | 'interactive';
  /** Открытых пунктов в санкционированной очереди. */
  readonly openItems: number;
  /** Живая работа: фоновые задачи, чьи родители ЖИВЫ. Пустой список — не повод спать. */
  readonly liveWork: readonly string[];
  /** Минут с последнего сообщения ЧЕЛОВЕКА. Свежий разговор — законная причина остановиться. */
  readonly minutesSinceHuman: number;
  /** Это повторная попытка остановиться после нашей же блокировки. */
  readonly stopHookActive: boolean;
  /** Сколько раз подряд мы уже блокировали в этой смене. */
  readonly consecutiveBlocks: number;
  /** Квитанция завершения из закрытого списка: владелец сказал стоп, очередь пуста, работа блокирована. */
  readonly completionReceipt?: 'owner-stop' | 'queue-empty' | 'blocked-on-owner' | undefined;
}

/** Что сторож решил и почему. `reason` пишется в журнал инцидентов и показывается лиду. */
export interface StopDecision {
  readonly action: 'allow' | 'block' | 'escalate';
  readonly reason: string;
  /** Машинный код причины — для журнала и для тестов; текст `reason` меняется, код нет. */
  readonly code:
    | 'not-autonomous' | 'receipt' | 'live-work' | 'fresh-human' | 'queue-empty'
    | 'idle-with-queue' | 'no-progress' | 'budget-exhausted';
}

/** Потолок блокировок подряд. Ниже харнессового потолка в 8, чтобы решение осталось нашим. */
export const BLOCK_BUDGET = 3;

/** Свежий разговор с человеком: остановиться сразу после его реплики — законно. */
export const FRESH_HUMAN_MINUTES = 20;

/**
 * Было ли между двумя попытками остановиться хоть одно машинно заметное движение.
 *
 * Ответ «принято, продолжу работу» не меняет ни коммита, ни дерева, ни списка задач, ни очереди —
 * и потому прогрессом не является. В этом весь смысл функции: она отличает СЛОВА от ДЕЙСТВИЙ.
 */
export function hasProgress(e: ProgressEvidence | undefined): boolean {
  if (!e) return false;
  if (e.headBefore && e.headNow && e.headBefore !== e.headNow) return true;
  if (e.treeHashBefore && e.treeHashNow && e.treeHashBefore !== e.treeHashNow) return true;
  const before = new Set(e.liveTasksBefore ?? []);
  if ((e.liveTasksNow ?? []).some((id) => !before.has(id))) return true;
  // Закрытие пункта считается прогрессом ТОЛЬКО с существующим доказательством: иначе достаточно
  // объявить пункт закрытым, чтобы получить право замолчать.
  if ((e.closedItems ?? []).some((c) => c.evidenceExists)) return true;
  return false;
}

/**
 * Решить, можно ли закончить ход.
 *
 * Порядок проверок load-bearing: сначала всё, что делает остановку ЗАКОННОЙ, и только потом
 * запрет. Сторож, который сначала запрещает, будет отключён после первого же ложного срабатывания
 * на правильной остановке — а отключённый сторож не ловит ничего.
 */
export function decideStop(shift: LeadShift, progress?: ProgressEvidence): StopDecision {
  if (shift.mode !== 'autonomous') {
    return { action: 'allow', code: 'not-autonomous', reason: 'смена не в автономном режиме — остановка не наше дело' };
  }
  if (shift.completionReceipt) {
    return { action: 'allow', code: 'receipt', reason: `квитанция завершения: ${shift.completionReceipt}` };
  }
  if (shift.liveWork.length > 0) {
    return { action: 'allow', code: 'live-work', reason: `живая работа: ${shift.liveWork.join(', ')}` };
  }
  if (shift.minutesSinceHuman < FRESH_HUMAN_MINUTES) {
    return { action: 'allow', code: 'fresh-human', reason: `человек писал ${shift.minutesSinceHuman} мин назад — разговор идёт` };
  }
  if (shift.openItems === 0) {
    return { action: 'allow', code: 'queue-empty', reason: 'очередь пуста' };
  }
  // Дальше — остановка при непустой очереди, без живой работы и без квитанции. Ровно этот случай
  // произошёл 2026-09-03 и стоил 6 часов 24 минут.
  if (shift.consecutiveBlocks >= BLOCK_BUDGET) {
    return {
      action: 'escalate',
      code: 'budget-exhausted',
      reason: `${shift.consecutiveBlocks} блокировки подряд без прогресса — будим владельца и разрешаем остановку`,
    };
  }
  if (shift.stopHookActive && hasProgress(progress)) {
    return { action: 'allow', code: 'no-progress', reason: 'после прошлой блокировки есть машинный прогресс' };
  }
  return {
    action: 'block',
    code: shift.stopHookActive ? 'no-progress' : 'idle-with-queue',
    reason: shift.stopHookActive
      ? `повторная остановка без единого машинного признака прогресса; открытых пунктов ${shift.openItems}`
      : `в очереди ${shift.openItems} открытых пунктов, живой работы нет — ход не заканчивается`,
  };
}
