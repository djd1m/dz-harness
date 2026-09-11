/**
 * Чистая комната: проверить пакет так, как его увидит НОВЫЙ пользователь.
 *
 * ЗАЧЕМ. Разработчик забыл включить файл в поставку — на его машине всё работает, потому что файл
 * лежит рядом в репозитории; у покупателя коробка приходит без детали. Класс называется
 * `files[]`/install-layout, и локальный прогон его не ловит ПО ПОСТРОЕНИЮ: он видит рабочее дерево.
 *
 * ЧЕСТНАЯ ГРАНИЦА, названная сразу и повторённая в вердикте: «в чистой комнате завелось» НЕ РАВНО
 * «Claude Code пакет увидел». ИЗМЕРЕНО ранее: health-advisor 1.2.0 был зелёным в чистой комнате на
 * пакете, чьи навыки не регистрировались вовсе. Это ДОПОЛНЕНИЕ к живой пробе регистрации, а не её
 * замена.
 *
 * ЧИСТАЯ ПОЛОВИНА. Здесь нет ни Docker, ни файловой системы: `planCleanRoom` решает, ЧТО осмысленно
 * запустить для этого манифеста, а `cleanRoomVerdict` превращает НАБЛЮДЕНИЕ в вердикт. Обе половины
 * проверяются без контейнера; запускает их скрипт `scripts/clean-room-smoke.mjs`.
 */
/** Что и почему запускать в контейнере. `kind: 'refuse'` — смотреть нечего, и это НЕ успех. */
export type CleanRoomPlan = {
    readonly kind: 'bin';
    /** Имя исполняемого файла из `bin`, которое будет вызвано с `--help`. */
    readonly binName: string;
    readonly argv: readonly string[];
    readonly why: string;
} | {
    readonly kind: 'import';
    /** Имя пакета, которое будет импортировано из установленной копии. */
    readonly packageName: string;
    readonly why: string;
} | {
    readonly kind: 'files-only';
    /** Файл из поставки, чьё присутствие проверяется после установки. */
    readonly probeFile: string;
    readonly why: string;
} | {
    readonly kind: 'refuse';
    readonly reason: string;
};
interface ManifestLike {
    readonly name?: unknown;
    readonly bin?: unknown;
    readonly main?: unknown;
    readonly exports?: unknown;
    readonly files?: unknown;
    readonly private?: unknown;
}
/**
 * Выбрать пробу по манифесту — от самой сильной к самой слабой.
 *
 * ПОРЯДОК НЕ ПРОИЗВОЛЕН. Запуск бинаря проверяет и установку, и разрешение зависимостей, и то,
 * что точка входа физически приехала. Импорт проверяет первые две. Присутствие файла — только
 * состав поставки. Слабейшая проба ВЫБИРАЕТСЯ ТОЛЬКО тогда, когда сильнее нечего запустить, и её
 * слабость названа в тексте `why`, чтобы читатель отчёта не принял её за полную проверку.
 */
export declare function planCleanRoom(manifest: ManifestLike): CleanRoomPlan;
/** Что наблюдалось в контейнере. `exitCode: null` — процесс не завершился сам (убит, срок). */
export interface CleanRoomObservation {
    readonly plan: CleanRoomPlan;
    readonly installOk: boolean;
    readonly installOutput: string;
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
}
export type CleanRoomVerdict = {
    readonly ok: true;
    readonly detail: string;
    readonly limit: string;
} | {
    readonly ok: false;
    readonly detail: string;
};
/** Оговорка, которую вердикт несёт ВСЕГДА: зелень чистой комнаты ≠ регистрация у клиента. */
export declare const CLEAN_ROOM_LIMIT: string;
/**
 * Превратить наблюдение в вердикт.
 *
 * УСПЕХ НЕ ВЫВОДИТСЯ ИЗ ТИШИНЫ: отсутствие вывода при нулевом коде — не доказательство запуска, и
 * для пробы бинаря требуется НЕПУСТОЙ вывод. Установка, не завершившаяся успехом, делает любой
 * последующий результат бессмысленным, и это говорится первой строкой.
 */
export declare function cleanRoomVerdict(o: CleanRoomObservation): CleanRoomVerdict;
export {};
//# sourceMappingURL=clean-room-smoke.d.ts.map