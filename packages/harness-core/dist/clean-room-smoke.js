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
/**
 * Выбрать пробу по манифесту — от самой сильной к самой слабой.
 *
 * ПОРЯДОК НЕ ПРОИЗВОЛЕН. Запуск бинаря проверяет и установку, и разрешение зависимостей, и то,
 * что точка входа физически приехала. Импорт проверяет первые две. Присутствие файла — только
 * состав поставки. Слабейшая проба ВЫБИРАЕТСЯ ТОЛЬКО тогда, когда сильнее нечего запустить, и её
 * слабость названа в тексте `why`, чтобы читатель отчёта не принял её за полную проверку.
 */
export function planCleanRoom(manifest) {
    if (manifest.private === true) {
        return { kind: 'refuse', reason: 'пакет приватный — он не публикуется, и проверять поставку не для кого' };
    }
    const name = typeof manifest.name === 'string' && manifest.name.trim() !== '' ? manifest.name.trim() : null;
    if (name === null) {
        return { kind: 'refuse', reason: 'манифест не называет пакет — установить его в чистой комнате нельзя' };
    }
    const binName = firstBinName(manifest.bin, name);
    if (binName !== null) {
        return {
            kind: 'bin', binName, argv: ['--help'],
            why: 'запуск исполняемого файла проверяет установку, разрешение зависимостей И то, что точка входа приехала в поставке',
        };
    }
    // ИМПОРТ ОСМЫСЛЕН, ТОЛЬКО ЕСЛИ ТОЧКА ВХОДА — ЗАГРУЖАЕМЫЙ МОДУЛЬ. ИЗМЕРЕНО 2026-09-04:
    // `@dzhechkov/keysarium-core` объявляет `main: "index.md"`, и импорт падает с «Unknown file
    // extension ".md"» — это верное наблюдение О МАНИФЕСТЕ, но негодная ПРОБА поставки: пакет
    // документационный, и его состав проверяется присутствием файла. Обвинять поставку в том, что
    // объявлено в манифесте, — путать два разных дефекта.
    if (isLoadableEntry(manifest.main) || manifest.exports !== undefined) {
        return {
            kind: 'import', packageName: name,
            why: 'импорт проверяет установку и разрешение зависимостей; ЧТО пакет делает — не проверяется',
        };
    }
    const probe = firstFile(manifest.files);
    if (probe !== null) {
        return {
            kind: 'files-only', probeFile: probe,
            why: 'у пакета нет ни исполняемого файла, ни точки входа — проверяется ТОЛЬКО то, что объявленный файл приехал; это самая слабая из проб',
        };
    }
    return { kind: 'refuse', reason: 'манифест не объявляет ни bin, ни точки входа, ни files — запускать в чистой комнате нечего' };
}
/** Загружаемая ли это точка входа: расширение, которое Node умеет исполнять как модуль. */
function isLoadableEntry(main) {
    return typeof main === 'string' && /\.(?:js|mjs|cjs|node)$/i.test(main.trim());
}
/** Первое имя из `bin`. Строка — это имя самого пакета (без области), объект — первый ключ. */
function firstBinName(bin, packageName) {
    if (typeof bin === 'string' && bin.trim() !== '') {
        const base = packageName.startsWith('@') ? packageName.split('/')[1] ?? packageName : packageName;
        return base;
    }
    if (typeof bin === 'object' && bin !== null && !Array.isArray(bin)) {
        for (const key of Object.keys(bin)) {
            if (key.trim() !== '')
                return key;
        }
    }
    return null;
}
/** Первый ОБЫЧНЫЙ путь из `files` — образцы (`*`) проверять присутствием нельзя. */
function firstFile(files) {
    if (!Array.isArray(files))
        return null;
    for (const f of files) {
        if (typeof f === 'string' && f.trim() !== '' && !f.includes('*'))
            return f.replace(/\/+$/, '');
    }
    return null;
}
/** Оговорка, которую вердикт несёт ВСЕГДА: зелень чистой комнаты ≠ регистрация у клиента. */
export const CLEAN_ROOM_LIMIT = 'чистая комната доказывает, что поставка УСТАНАВЛИВАЕТСЯ и запускается; она НЕ доказывает, '
    + 'что Claude Code увидел навыки пакета — для этого живая проба регистрации (dz skills-verify)';
/**
 * Превратить наблюдение в вердикт.
 *
 * УСПЕХ НЕ ВЫВОДИТСЯ ИЗ ТИШИНЫ: отсутствие вывода при нулевом коде — не доказательство запуска, и
 * для пробы бинаря требуется НЕПУСТОЙ вывод. Установка, не завершившаяся успехом, делает любой
 * последующий результат бессмысленным, и это говорится первой строкой.
 */
export function cleanRoomVerdict(o) {
    if (o.plan.kind === 'refuse') {
        return { ok: false, detail: `проба не выбрана: ${o.plan.reason}` };
    }
    if (!o.installOk) {
        // Провалившаяся установка делает любой последующий результат бессмысленным — и это говорится
        // ПЕРВОЙ строкой, чтобы читатель не искал причину в проверке.
        return { ok: false, detail: `установка из тарбола НЕ прошла — всё остальное о ней ничего не говорит: ${firstLine(o.installOutput)}` };
    }
    if (o.exitCode === null) {
        return { ok: false, detail: 'проба не завершилась сама (убита или истёк срок) — исход НЕ УСТАНОВЛЕН, и это не успех' };
    }
    if (o.exitCode !== 0) {
        return { ok: false, detail: `проба вышла с кодом ${o.exitCode}: ${firstLine(o.stderr) || firstLine(o.stdout) || '(вывода нет)'}` };
    }
    if (o.plan.kind === 'bin' && o.stdout.trim() === '' && o.stderr.trim() === '') {
        // Ноль и тишина — это не «сработало». Ровно так выглядит бинарь, чья точка входа не приехала,
        // если оболочка проглотила ошибку: успех, выведенный из тишины, и есть тот дефект, который
        // чистая комната обязана ловить.
        return { ok: false, detail: 'исполняемый файл вышел с нулём и НИЧЕГО не написал — тишина не доказывает запуск' };
    }
    const what = o.plan.kind === 'bin' ? `\`${o.plan.binName} ${o.plan.argv.join(' ')}\``
        : o.plan.kind === 'import' ? `импорт ${o.plan.packageName}`
            : `присутствие ${o.plan.probeFile}`;
    return { ok: true, detail: `установка прошла, ${what} — успешно`, limit: CLEAN_ROOM_LIMIT };
}
/**
 * Первая строка, которая ОБЪЯСНЯЕТ отказ, а не первая непустая.
 *
 * ИЗМЕРЕНО 2026-09-04 на живом прогоне: у сломанной поставки первой непустой строкой оказалась
 * `node:fs:560` — кадр стека. Такой текст в вердикте отправляет читателя в файл среды выполнения
 * вместо причины (`ENOENT … templates/…`). Поэтому сначала ищется строка, ПОХОЖАЯ на сообщение об
 * ошибке, и только если такой нет — берётся первая непустая.
 */
function firstLine(text) {
    const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '');
    const explains = lines.find((l) => /\b(?:Error|ENOENT|EACCES|ERR_[A-Z_]+|Cannot find|not found|npm ERR!)\b/i.test(l));
    const chosen = explains ?? lines[0];
    return chosen === undefined ? '' : chosen.slice(0, 200);
}
//# sourceMappingURL=clean-room-smoke.js.map