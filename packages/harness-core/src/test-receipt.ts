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

/** Одна запись журнала квитанций. Пишется ТОЛЬКО наблюдателем, видевшим код возврата 0. */
export interface TestReceipt {
  readonly v: 1;
  /** Когда прогон закончился, ISO-8601. */
  readonly ts: string;
  /** Что именно было запущено — для сообщения об отказе, чтобы читатель мог повторить. */
  readonly command: string;
  /** Область → отпечаток её содержимого на момент зелёного прогона. */
  readonly scopes: Readonly<Record<string, string>>;
}

/** Состояние одной области в вердикте. */
export interface TestReceiptScopeState {
  readonly scope: string;
  /** Отпечаток содержимого СЕЙЧАС. */
  readonly digest: string;
  /**
   * `never` — область не встречается ни в одной квитанции: прогона не было вовсе.
   * `changed` — квитанции есть, но ни одна не покрывает текущее содержимое.
   */
  readonly why: 'never' | 'changed';
  /** Время самой свежей квитанции, покрывавшей эту область в ЛЮБОМ виде; null при `never`. */
  readonly lastGreenAt: string | null;
}

export type TestReceiptVerdict =
  | { readonly state: 'covered'; readonly scopes: readonly string[] }
  | { readonly state: 'stale'; readonly uncovered: readonly TestReceiptScopeState[] }
  | { readonly state: 'not-established'; readonly reason: string };

/**
 * Чистое решение. Ничего не читает и не запускает — отпечатки и журнал подаёт вызывающий.
 *
 * Три исхода, а не два, намеренно: «не установлено» — это НЕ «покрыто». Гейт, выводящий пропуск из
 * пустого входа, тихо ломается на каждом новом способе получить пустой вход.
 */
export function decideTestReceipt(input: {
  readonly current: Readonly<Record<string, string>>;
  readonly receipts: readonly TestReceipt[];
}): TestReceiptVerdict {
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

  const receipts = (Array.isArray(input.receipts) ? input.receipts : []).filter(
    (r): r is TestReceipt => !!r && typeof r === 'object' && r.scopes !== null && typeof r.scopes === 'object',
  );

  const uncovered: TestReceiptScopeState[] = [];
  for (const scope of scopes) {
    const digest = current[scope]!;
    let seenAt: string | null = null;
    let covered = false;
    for (const receipt of receipts) {
      const recorded = receipt.scopes[scope];
      if (typeof recorded !== 'string') continue;
      if (typeof receipt.ts === 'string' && (seenAt === null || receipt.ts > seenAt)) seenAt = receipt.ts;
      if (recorded === digest) { covered = true; break; }
    }
    if (!covered) uncovered.push({ scope, digest, why: seenAt === null ? 'never' : 'changed', lastGreenAt: seenAt });
  }

  return uncovered.length === 0 ? { state: 'covered', scopes } : { state: 'stale', uncovered };
}

/** Одна строка для человека. Отказ обязан говорить, ЧТО запустить, а не только что всё плохо. */
export function renderTestReceiptVerdict(verdict: TestReceiptVerdict): string {
  if (verdict.state === 'covered') {
    return `test-receipt: покрыто — ${verdict.scopes.length} област(и) в том же виде, в каком были зелёными`;
  }
  if (verdict.state === 'not-established') {
    return `test-receipt: НЕ УСТАНОВЛЕНО — ${verdict.reason}. Это не пропуск и не отказ по существу`;
  }
  const lines = verdict.uncovered.map((item) => item.why === 'never'
    ? `  · ${item.scope}: зелёного прогона не было НИ РАЗУ`
    : `  · ${item.scope}: изменилась после последнего зелёного прогона (${item.lastGreenAt})`);
  return [`test-receipt: НЕ ПОКРЫТО — ${verdict.uncovered.length} област(и):`, ...lines].join('\n');
}
