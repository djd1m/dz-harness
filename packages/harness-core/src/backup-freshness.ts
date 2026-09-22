/**
 * Свежесть резервной копии бэклога по журналу backup-backlog.
 *
 * Порядок строк важнее меток времени: отказ без даты ПОСЛЕ успеха — последний вердикт.
 * Отсутствие вердикта не доказывает ни актуальность копии, ни её отказ.
 */
export type BackupFreshnessVerdict =
  | { readonly state: 'fresh'; readonly verifiedAt: string; readonly ageHours: number; readonly tasks: number | null }
  | {
    readonly state: 'stale';
    readonly reason: 'too-old' | 'last-run-failed';
    readonly verifiedAt: string | null;
    readonly ageHours: number | null;
    readonly failureLine: string | null;
  }
  | {
    readonly state: 'not-established';
    readonly reason: 'no-verdict' | 'bad-stamp' | 'unrecognized-after-success';
    readonly detail: string;
    readonly unrecognizedLine?: string;
  };

/** Чистое решение. Ничего не читает и не запускает — строки и часы подаёт вызывающий. */
export function decideBackupFreshness(input: {
  readonly lines: readonly string[];
  readonly now: Date;
  readonly maxAgeHours: number;
}): BackupFreshnessVerdict {
  let last: 'success' | 'failure' | 'unrecognized' | null = null;
  let successLine = '';
  let unrecognizedLine = '';
  let failureLine: string | null = null;
  let verifiedAt: string | null = null;
  let verifiedMs: number | null = null;

  for (const line of input.lines) {
    if (line.includes('backup-backlog') && ['не удалось', 'НЕ ПРОШЛА', 'ОТПРАВКА ОТКЛОНЕНА', 'не найден'].some((text) => line.includes(text))) {
      last = 'failure';
      failureLine = line;
      continue;
    }
    const isSuccess = line.startsWith('backup-backlog')
      && (line.includes('копия проверена по свежему клону') || line.includes('изменений нет — копия уже актуальна'));
    if (!isSuccess) {
      // Разрешаем только известный прогресс: незнакомый вывод не доказывает успех.
      if (line.trim() === '' || /^backup-backlog(?: \[[^\]]+\])?: отправлено,/.test(line) || /^\s*разобрано задач:/.test(line)) continue;
      if (successLine !== '') {
        last = 'unrecognized';
        unrecognizedLine = line.slice(0, 200);
      }
      continue;
    }
    last = 'success';
    successLine = line;
    const stamp = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z)\]/.exec(line)?.[1];
    const ms = stamp === undefined ? NaN : Date.parse(stamp);
    // Date.parse нормализует некоторые несуществующие даты: обратная проверка их отвергает.
    const valid = Number.isFinite(ms) && new Date(ms).toISOString() === stamp?.replace('Z', ':00.000Z');
    verifiedAt = valid ? stamp! : null;
    verifiedMs = valid ? ms : null;
  }

  if (last === null) {
    return { state: 'not-established', reason: 'no-verdict', detail: 'журнал не содержит ни одной строки с вердиктом' };
  }
  if (last === 'unrecognized') {
    return { state: 'not-established', reason: 'unrecognized-after-success', detail: 'неузнанная строка после успеха', unrecognizedLine };
  }
  const elapsed = verifiedMs === null ? null : (input.now.getTime() - verifiedMs) / 3_600_000;
  const ageHours = elapsed === null ? null : Math.round(elapsed * 10) / 10;
  if (last === 'failure') {
    return { state: 'stale', reason: 'last-run-failed', verifiedAt, ageHours, failureLine };
  }
  if (verifiedAt === null || ageHours === null || elapsed === null) {
    return { state: 'not-established', reason: 'bad-stamp', detail: `строка успеха без валидной даты: ${successLine}` };
  }
  if (elapsed > input.maxAgeHours) {
    return { state: 'stale', reason: 'too-old', verifiedAt, ageHours, failureLine: null };
  }
  const tasks = /(\d+)\s+задач/.exec(successLine)?.[1];
  return { state: 'fresh', verifiedAt, ageHours, tasks: tasks === undefined ? null : Number(tasks) };
}

/** Одна строка для человека: измеренный возраст либо конкретная строка отказа. */
export function renderBackupFreshness(verdict: BackupFreshnessVerdict): string {
  if (verdict.state === 'not-established') {
    return `backlog backup: НЕ УСТАНОВЛЕНО — ${verdict.detail}${verdict.unrecognizedLine === undefined ? '' : `: ${verdict.unrecognizedLine}`}`;
  }
  if (verdict.state === 'fresh') {
    return `backlog backup: копия актуальна — возраст ${verdict.ageHours} ч, проверена ${verdict.verifiedAt}${verdict.tasks === null ? '' : `, ${verdict.tasks} задач`}`;
  }
  if (verdict.reason === 'last-run-failed') {
    return `backlog backup: последний запуск завершился отказом — ${verdict.failureLine}`;
  }
  return `backlog backup: копия устарела — возраст ${verdict.ageHours} ч, проверена ${verdict.verifiedAt}`;
}
