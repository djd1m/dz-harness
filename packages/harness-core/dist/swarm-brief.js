import { maskMarkdown } from './markdown-masker.js';
/**
 * Обязательные объявления брифа — КАК ДАННЫЕ, чтобы их можно было перечислить в отказе и в
 * шаблоне, не переписывая в трёх местах.
 */
export const SWARM_BRIEF_CONTRACT = [
    { key: 'OUTPUT_DIR', why: 'каталог, куда агент пишет находки; один итоговый файл теряется целиком' },
    { key: 'UNITS', why: 'перечень единиц работы: по файлу на единицу, а не всё в конце' },
    { key: 'ASSEMBLY_UNIT', why: 'сборка отчёта из осколков — отдельная работа со своим исполнителем' },
];
/**
 * Единица не может быть одна.
 *
 * Одна единица — это ровно тот же «один файл в конце», ради отказа от которого контракт и заведён:
 * агент, умерший на середине единственной единицы, теряет всё. Минимум две — это не порог качества,
 * а граница осмысленности разбиения.
 */
const MIN_UNITS = 2;
/**
 * ПРЕДЕЛ НА ЧИСЛО ЕДИНИЦ (находка 9).
 *
 * Ограничения не было вовсе, а проверка дубликатов была квадратичной. ИЗМЕРЕНО ревью сквозным
 * прогоном: 20 тыс. единиц — 0,93 с, 50 тыс. — 4,53 с, 100 тыс. — 40,25 с, и 88-92% времени в одной
 * строке `units.indexOf`. Дубликаты теперь считаются через Set (те же 100 тыс. — 28 мс), но
 * линейности мало: бриф с сотней тысяч единиц не бывает осмысленным, он бывает атакой или опечаткой.
 * Предел назван вслух и отказ поимённый — это не «защита от DoS», это отказ разбирать бессмыслицу.
 */
const MAX_UNITS = 200;
/**
 * ПРЕДЕЛ НА ДЛИНУ ИМЕНИ ЕДИНИЦЫ (находка 8).
 *
 * Из имени выводится имя файла, а у файловой системы NAME_MAX = 255 байт. Слаг в 5000 символов
 * давал «годен» и невозможный файл. 64 — не про NAME_MAX (запас там втрое), а про то, что имя
 * читает человек в листинге каталога, по которому идёт сверка.
 */
const MAX_UNIT_NAME = 64;
/**
 * ТОЧКА В ПОСЛЕДНЕМ СЕГМЕНТЕ ПУТИ — признак файла, а не каталога.
 *
 * Первая редакция перечисляла расширения (`.md|.json|…`). Кросс-семейное ревью показало, что такой
 * список ошибается в ОБЕ стороны: каталог `archive.json` отвергался, файл `report.log` проходил, а
 * сузить список до трёх расширений можно было, не покраснив ни одного теста. Правило про точку
 * строже и не имеет произвольного перечня.
 *
 * НАЗВАННЫЙ ПРЕДЕЛ: каталог, законно названный `v1.2`, будет отвергнут. Это ГРОМКИЙ отказ с
 * понятным лечением (переименовать), а не тихий пропуск файла туда, где ждут каталог.
 */
const LAST_SEGMENT_HAS_DOT = /[^/]*\.[^/]*$/;
/**
 * Расширение файла единицы и имя файла плана — ЧАСТЬ КОНТРАКТА, а не соглашение.
 *
 * Без них обещание «оркестратор сверит каталог с перечнем» остаётся приблизительным: ревью
 * показало, что по слагу `c1-identity` в каталоге можно найти `c1-identity.md`, `c1-identity.json`
 * или подкаталог `c1-identity/`, и сверка становится неоднозначной. Контракт называет одно.
 */
export const UNIT_FILE_EXTENSION = '.md';
export const PLAN_FILE_NAME = 'plan.md';
/** Имя файла, ожидаемое для единицы. Единственное место, где это отображение задано. */
export function unitFileName(unit) { return `${unit}${UNIT_FILE_EXTENSION}`; }
/**
 * Отбросить завершающие слеши перед проверкой «файл или каталог».
 *
 * Без этого `docs/report.md/` проходил: последний сегмент пуст, точки в нём нет (находка ревью).
 * Отдельно: `.` и `..` — законные каталоги, и точка в них не признак файла.
 */
function normalizeDir(p) {
    const trimmed = p.replace(/\/+$/, '');
    return trimmed === '' || trimmed === '.' || trimmed === '..' ? 'dir' : trimmed;
}
/** Схема в пути означает не каталог на диске. */
const HAS_SCHEME = /:\/\//;
/**
 * УПРАВЛЯЮЩИЕ СИМВОЛЫ ИЗ БРИФА — В ВИДИМУЮ ФОРМУ (находка 10).
 *
 * Значения из брифа вставлялись в текст отказа ДОСЛОВНО. Имя единицы, содержащее
 * `ESC[1A ESC[G ESC[2K` + поддельную строку «dz brief-check: OK — dir …» + `ESC[1B ESC[G ESC[2K`,
 * на живом терминале стирало строку REFUSED и печатало на её месте зелёный ответ, байт в байт
 * совпадающий с настоящим (подтверждено `cat -v`: байты выходили из программы). Код выхода
 * оставался честным — обманут был ЧЕЛОВЕК, читающий экран, а не скрипт.
 *
 * Функция ЭКСПОРТИРУЕТСЯ, потому что подделывается не только отказ: CLI печатает каталог и сборку
 * в ЗЕЛЁНОЙ строке, куда отказ не заглядывает. Одна функция на оба слоя — единственный способ не
 * забыть половину.
 */
export function visibleText(s) {
    return s.replace(/[\u0000-\u001f\u007f-\u009f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}
/**
 * Значение из брифа в тексте отказа: сначала обезврежено, потом урезано.
 *
 * Урезание — не косметика: слаг в 5000 символов утаскивал в отказ пять тысяч символов, и причина
 * тонула в собственном воспроизводителе.
 */
function shown(s, max = 60) {
    const v = visibleText(s);
    return v.length <= max ? v : `${v.slice(0, max)}…(+${v.length - max})`;
}
/**
 * РАЗДЕЛИТЕЛЬ СТРОК — И ОДИНОЧНЫЙ \r ТОЖЕ (находка 1).
 *
 * `split(/\r?\n/)` не режет по одиночному `\r`, а точка в LIST_ITEM его не покрывает: пункт с `\r`
 * внутри не совпадал с шаблоном, и readList обрывал разбор через break. Пять единиц объявлено,
 * три разобрано, вердикт «годен». Это порча ровно того машинного списка, ради сверяемости которого
 * фича заведена, — и потому лечится разделителем, а не отказом.
 */
const LINE_BREAK = /\r\n|\r|\n/;
/** Строка-заглушка вместо замаскированной: не пустая, не пункт, не объявление — то есть проза. */
const MASK = '\u0000masked\u0000';
/** Preserve brief-specific EOF, indentation, list-barrier and ambiguity policies. */
function maskFencedAndCommented(lines) {
    const out = lines.slice();
    let nestedComment = false;
    maskMarkdown(lines.join('\n'), {
        unclosed: 'mask',
        indentedCode: true,
        inlineComments: true,
        onMasked: (i = 0) => { out[i] = MASK; },
        onDisputed: (i = 0) => {
            if (isParseable(lines[i] ?? ''))
                nestedComment = true;
        },
    });
    return { lines: out, nestedComment };
}
/**
 * Строка, которую разборщик ПРОЧТЁТ: объявление контракта (голое или украшенное) либо пункт списка.
 *
 * Нужна ровно затем, чтобы отказ по вложенному комментарию срабатывал только там, где вложение
 * что-то меняет. Оформление снимается той же `undecorate`, что и в счётчиках: иначе `**UNITS**:`
 * в спорной области был бы виден человеку и невидим этой проверке — то самое расхождение, ради
 * закрытия которого заведена находка 3.
 */
function isParseable(line) {
    if (LIST_ITEM.test(line))
        return true;
    const bare = undecorate(line);
    return SWARM_BRIEF_CONTRACT.some(({ key }) => new RegExp(`^\\s*${escapeKey(key)}\\s*:`).test(bare));
}
/**
 * СНЯТЬ ОФОРМЛЕНИЕ ПЕРЕД СЧЁТОМ ВХОЖДЕНИЙ (находка 3).
 *
 * Считались только строки, где ключ голый в начале, поэтому `**OUTPUT_DIR**: /root/.ssh`,
 * `> OUTPUT_DIR: /root/.ssh` и `` `OUTPUT_DIR: /root/.ssh` `` были невидимы разборщику и видимы
 * человеку. Направление подделки — то, что делает находку тяжёлой: опасное значение оставляют
 * ГОЛЫМ, а безопасное УКРАШАЮТ; человек читает одно, проверено другое.
 *
 * Украшенное объявление засчитывается в счётчик повторов, то есть ведёт к отказу по
 * неоднозначности. Лечение автору очевидно: снять оформление с настоящего объявления.
 *
 * НАЗВАННЫЙ ПРЕДЕЛ: `_` не снимается — он часть имён ключей (`OUTPUT_DIR`), и снять его значило бы
 * перестать узнавать сам ключ. Курсив подчёркиванием (`_OUTPUT_DIR_:`) остаётся невидим счётчику.
 */
const DECORATION = /[*`>#~[\]]/g;
function undecorate(line) { return line.replace(DECORATION, ''); }
/**
 * УПРАВЛЯЮЩИЕ СИМВОЛЫ В ПУТИ (находка 7). Нулевой байт доезжал в машинный вывод как `\u0000`.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
/**
 * СЕГМЕНТ ПУТИ — ЯВНЫЙ ПЕРЕЧЕНЬ ДОПУСТИМОГО, А НЕ ПЕРЕЧЕНЬ ЗАПРЕТНОГО.
 *
 * Каталог вывода не проверялся как путь ВОВСЕ: `/`, `/etc`, `/root/authorized_keys_dir`,
 * `docs/../../../../../root`, `C:\Windows\System32`, `docs/$(id)`, `docs/;id` — все давали «годен».
 * Записи на диск в фиче сегодня нет, и это смягчает тяжесть; но шапка модуля обещает будущую сверку
 * каталога, и тогда это станет путём, по которому ходят.
 *
 * Перечень допустимого, а не запретного, — тот же урок, что уже стоит выше про расширения файлов:
 * перечень запретного ошибается в обе стороны, и его можно сузить, не покраснив ни одного теста.
 *
 * НАЗВАННЫЙ ПРЕДЕЛ: каталог, названный кириллицей или пробелом, будет отвергнут. Это ГРОМКИЙ отказ
 * с понятным лечением, а не тихий пропуск обхода вверх.
 */
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
/**
 * Отказ по каталогу вывода КАК ПО ПУТИ, или `null`, если путь допустим.
 *
 * Порядок проверок — от самого опасного к самому косметическому, чтобы отказ называл ГЛАВНУЮ
 * причину: управляющий символ важнее странной буквы в имени.
 */
function pathRefusal(dir) {
    if (CONTROL_CHARS.test(dir)) {
        return `"${shown(dir)}" contains a control character — a path never does, and in a terminal such a byte rewrites the screen. Use: OUTPUT_DIR: docs/research/<topic>`;
    }
    if (dir.includes('\\')) {
        return `"${shown(dir)}" contains a backslash — the contract needs a relative POSIX path inside the workspace. Use: OUTPUT_DIR: docs/research/<topic>`;
    }
    if (dir.startsWith('/') || /^[A-Za-z]:/.test(dir)) {
        return `"${shown(dir)}" is an ABSOLUTE path — the output directory must be relative to the workspace, otherwise the swarm writes outside the tree the report is assembled from. Use: OUTPUT_DIR: docs/research/<topic>`;
    }
    const segments = dir.replace(/\/+$/, '').split('/');
    if (segments.includes('..')) {
        return `"${shown(dir)}" walks up out of the workspace ("..") — the output directory must stay inside it. Use: OUTPUT_DIR: docs/research/<topic>`;
    }
    const strange = segments.filter((s) => !PATH_SEGMENT.test(s));
    if (strange.length > 0) {
        return `"${shown(dir)}" has a path segment that is not a name: ${strange.slice(0, 3).map((s) => `"${shown(s, 20)}"`).join(', ')}. Allowed in a segment: letters, digits, dot, dash, underscore. Use: OUTPUT_DIR: docs/research/<topic>`;
    }
    return null;
}
/**
 * Имя единицы — СЛАГ, из которого выводится имя файла.
 *
 * Без этого требования обещание «оркестратор сверит каталог с перечнем» невыполнимо: по единице
 * «исследовать API» неизвестно, какой файл искать (находка кросс-семейного ревью — она била в само
 * обоснование машиночитаемой формы, а не в деталь). Слаг задаёт отображение единица → файл
 * однозначно, и заодно снимает вопрос о `report` против `./report`: второе просто не слаг.
 */
const UNIT_SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
/** Экранировать имя ключа: сегодня ключи без спецсимволов, но контракт объявлен расширяемым. */
function escapeKey(key) { return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/** Строка списка: тире или звёздочка, затем имя. Ведущие пробелы РАЗБИРАЮТСЯ, а не игнорируются. */
const LIST_ITEM = /^(\s*)[-*]\s+(\S.*?)\s*$/;
/**
 * Прочитать скалярное объявление. Возвращает `{ value, count }`: сколько раз ключ встретился.
 *
 * СЧЁТ НУЖЕН, ПОТОМУ ЧТО БРИФ МОЖЕТ ОПИСЫВАТЬ САМ КОНТРАКТ. Шаблон и документация содержат те же
 * ключи в примерах; молча взять ПЕРВОЕ вхождение значило бы проверить пример вместо объявления
 * (находка ревью). Двусмысленность разрешается отказом, а не выбором.
 */
function readScalar(lines, key) {
    const re = new RegExp(`^\\s*${escapeKey(key)}\\s*:\\s*(.*)$`);
    let value = null;
    let bare = 0;
    let decorated = 0;
    for (const line of lines) {
        const m = re.exec(line);
        if (m) {
            bare += 1;
            if (value === null)
                value = (m[1] ?? '').trim();
            continue;
        }
        // УКРАШЕННОЕ ОБЪЯВЛЕНИЕ СЧИТАЕТСЯ, НО НЕ ЧИТАЕТСЯ. Значение берётся только у голого: иначе
        // разбор сам решал бы, какое из двух прочтений человек имел в виду, — а он их и не различал.
        if (re.test(undecorate(line)))
            decorated += 1;
    }
    return { value, count: bare + decorated, decorated };
}
/**
 * Прочитать список ПОСЛЕ строки-ключа: подряд идущие пункты, до первой строки, которая пунктом не
 * является.
 *
 * ПУСТАЯ СТРОКА БОЛЬШЕ НЕ «ОФОРМЛЕНИЕ» (находка 4, найдена двумя ревьюерами независимо). Прежняя
 * редакция на пустой строке заглядывала на следующую и, если та была пунктом, ПРОДОЛЖАЛА список.
 * Разделителем абзацев работала, таким образом, не пустая строка, а проза после неё: убери прозу —
 * и чужой перечень втягивался в единицы при вердикте «годен».
 *
 * Лечение НЕ «оборвать молча»: молчаливый обрыв — тот же тихий отказ, что и молчаливое
 * присоединение, только в другую сторону (это ровно урок находки 1). Мы НЕ УМЕЕМ отличить
 * продолжение списка от чужого перечня и не притворяемся, что умеем: разрыв фиксируется флагом
 * `gapped`, разбор останавливается на пустой строке, а вызывающий называет неоднозначность вслух.
 * Лечение автору очевидно: держать перечень сплошным.
 *
 * СТРОКА-НЕ-ПУНКТ ВНУТРИ ПЕРЕЧНЯ — ТОТ ЖЕ ОБРЫВ В ДРУГОЙ ОДЕЖДЕ (ADR-002, раунд 2). Раунд 1 сделал
 * одиночный `\r` разделителем строк — верно — и тем самым превратил `- c3\r x` в ДВЕ строки, вторая
 * из которых (` x`) пунктом не является. Разбор останавливался на ней через break и молча отбрасывал
 * весь хвост перечня при вердикте «годен»: объявлено пять единиц, разобрано четыре, нарушений ноль.
 * Пустую строку раунд 1 закрыл, непустую — нет.
 *
 * ПОЧЕМУ НЕ «ОТКАЗ НА ЛЮБОЙ ПОСТОРОННЕЙ СТРОКЕ» (вариант B в ADR-002, отвергнут). Строка-не-пункт
 * ПОСЛЕ последнего пункта — нормальное окончание списка: почти в каждом реальном брифе за перечнем
 * идёт проза, и поставляемый шаблон устроен именно так. Проверка, изобретающая нарушения, хуже
 * отсутствующей — её учатся обходить, и она умирает. Поэтому `interrupted` заполняется ТОЛЬКО когда
 * за посторонней строкой в ТОМ ЖЕ БЛОКЕ (до ближайшей пустой строки) ещё следуют пункты.
 *
 * ПОЧЕМУ НЕ «РАЗБИРАТЬ СКВОЗЬ» (вариант C, отвергнут): это угадывание в другую сторону — чужой
 * перечень, отделённый прозой, стал бы частью единиц. Оба варианта угадывают, отличаясь лишь
 * направлением ошибки; честный выход один — назвать строку, по которой решение невозможно.
 */
function readList(lines, key) {
    const head = new RegExp(`^\\s*${escapeKey(key)}\\s*:\\s*$`);
    // СЧЁТ ВХОЖДЕНИЙ — ТАКОЙ ЖЕ, КАК У СКАЛЯРОВ. Первая редакция считала повторы только для
    // `OUTPUT_DIR` и `ASSEMBLY_UNIT`, а для списка брала первое вхождение молча — и это худший
    // случай из трёх: бриф, ОПИСЫВАЮЩИЙ контракт, содержит `UNITS:` в примере, и настоящий перечень
    // тихо отбрасывался, а проверка печатала «ГОДЕН». Найдено ревью на живом входе.
    // Украшенная строка-ключ считается наравне с голой — по той же причине, что и у скаляров.
    let heads = 0;
    let decorated = 0;
    for (const l of lines) {
        if (head.test(l)) {
            heads += 1;
            continue;
        }
        if (head.test(undecorate(l))) {
            heads += 1;
            decorated += 1;
        }
    }
    const idx = lines.findIndex((l) => head.test(l));
    if (idx < 0)
        return { items: null, count: heads, nested: false, gapped: false, interrupted: null, decorated };
    const raw = [];
    let gapped = false;
    let interrupted = null;
    for (let i = idx + 1; i < lines.length; i += 1) {
        const line = lines[i] ?? '';
        if (line.trim() === '') {
            // Разбор ВСЕГДА останавливается на пустой строке. Если за пустотами стоит ещё один пункт —
            // это неоднозначность, а не продолжение: см. заголовок функции.
            let j = i + 1;
            while (j < lines.length && (lines[j] ?? '').trim() === '')
                j += 1;
            if (j < lines.length && LIST_ITEM.test(lines[j] ?? '')) {
                gapped = true;
                break;
            }
            // ЗАГЛУШКА НЕ ПРЯЧЕТ ВОЗОБНОВИВШИЙСЯ ПЕРЕЧЕНЬ (раунд 2, дефект 2). Забор кода и
            // HTML-комментарий заменяются заглушкой ДО разбора, поэтому первой непустой строкой за
            // пустотами оказывалась она — и перечень, возобновившийся сразу ЗА ней, был невидим обеим
            // проверкам сразу: хвост отбрасывался молча при вердикте «годен». ИЗМЕРЕНО: объявлено три
            // единицы, разобрано две, нарушений ноль.
            //
            // ПОЧЕМУ `interrupted`, А НЕ `gapped` — выбор между двумя уже существующими сигналами.
            // Формально пустая строка тут есть, и `gapped` был бы не ложью. Но сигналы различаются не
            // фактом, а ЛЕЧЕНИЕМ, которое они называют автору: `gapped` говорит «держите перечень
            // сплошным» — то есть послал бы убирать пустую строку, чего чинить не надо; `interrupted`
            // называет строку, разорвавшую перечень, и здесь разорвал его именно заслонённый забором или
            // комментарием кусок. По природе заглушка — это непустая строка, не являющаяся пунктом, то
            // есть ровно предмет ADR-002. Решает же дело третье: заглушка — единственное место, где
            // ЧЕЛОВЕК и РАЗБОРЩИК читают разное (человек видит комментарий и сплошной вокруг него
            // список), а именно это расхождение фича и закрывает.
            if (j < lines.length && (lines[j] ?? '') === MASK) {
                // Смотрим ТОЛЬКО внутри абзаца заглушки — до ближайшей пустой строки. Пункт за этой
                // границей уже другой абзац, и его тихо отбрасывать законно (вариант A ADR-002): пример в
                // заборе после перечня стоит в половине реальных брифов, и отказ на нём был бы той самой
                // проверкой, которая изобретает нарушения.
                for (let k = j; k < lines.length && (lines[k] ?? '').trim() !== ''; k += 1) {
                    if (LIST_ITEM.test(lines[k] ?? '')) {
                        interrupted = MASK;
                        break;
                    }
                }
            }
            break;
        }
        const m = LIST_ITEM.exec(line);
        if (m === null) {
            // Разбор останавливается ТАК ЖЕ, как и был, — меняется только то, называем ли мы обрыв вслух.
            // Смотрим вперёд ДО БЛИЖАЙШЕЙ ПУСТОЙ СТРОКИ: она и есть граница блока. Пункт за этой границей
            // — уже другой абзац, и его судьбу решает `gapped`, а не эта ветка; пункт ВНУТРИ границы
            // означает, что хвост перечня был бы отброшен молча.
            for (let j = i + 1; j < lines.length && (lines[j] ?? '').trim() !== ''; j += 1) {
                if (LIST_ITEM.test(lines[j] ?? '')) {
                    interrupted = line;
                    break;
                }
            }
            break;
        }
        raw.push({ indent: (m[1] ?? '').length, text: (m[2] ?? '').trim() });
    }
    // БАЗОВЫЙ ОТСТУП — МИНИМУМ ПО СПИСКУ, А НЕ ОТСТУП ПЕРВОГО ПУНКТА (находка 5). Страж вложенности
    // отключался отступлённым первым пунктом: `  - stray-first` задирал базу до двух, и подпункт
    // `  - subpoint-of-c1` становился полноправной единицей при nested=false — то есть страж
    // выключался ровно тем оформлением, от которого защищал.
    const base = raw.reduce((min, r) => Math.min(min, r.indent), Number.POSITIVE_INFINITY);
    const nested = raw.some((r) => r.indent > base);
    const items = raw.filter((r) => r.indent === base).map((r) => r.text);
    return { items, count: heads, nested, gapped, interrupted, decorated };
}
/**
 * Проверить бриф роя на контракт вывода.
 *
 * Отказ ВСЕГДА поимённый: «бриф неверен» не говорит автору, что чинить, и потому его чинить не
 * будут. Каждое нарушение называет ключ и причину, по которой он есть.
 */
export function checkSwarmBrief(text) {
    const violations = [];
    if (typeof text !== 'string' || text.trim() === '') {
        return {
            ok: false, outputDir: null, units: [], assemblyUnit: null,
            violations: [{ rule: 'brief', detail: 'the brief is empty or not a string — there is nothing to check' }],
        };
    }
    // Порядок обязателен: сначала строки, потом маскировка заборов и комментариев. Ключ внутри
    // забора — не объявление (находка 2), и это решается ДО того, как что-либо считается.
    const masked = maskFencedAndCommented(text.split(LINE_BREAK));
    const lines = masked.lines;
    if (masked.nestedComment) {
        // ОТКАЗ ИДЁТ ПЕРВЫМ и адресован документу, а не ключу: спорна тут не одна строка, а граница
        // комментария, и лечение одно на весь блок.
        violations.push({
            rule: 'brief',
            detail: 'an HTML comment contains a second "<!--" before it closes, and declarations or list items follow the inner "-->". '
                + 'HTML comments do not nest: the FIRST "-->" ends the block, so a renderer SHOWS what comes after it, while the author '
                + 'who opened the block above reads the same lines as commented out. Both readings are defensible and the parser cannot '
                + 'choose between them — a check that guesses here would certify an EXAMPLE as the task. Remove the inner "<!--", or close '
                + 'the outer comment above the declarations.',
        });
    }
    const dirRead = readScalar(lines, 'OUTPUT_DIR');
    const outputDir = dirRead.value;
    const dirPathRefusal = outputDir === null ? null : pathRefusal(outputDir);
    if (dirRead.count > 1) {
        violations.push({ rule: 'OUTPUT_DIR', detail: `declared ${dirRead.count} times — which value is real cannot be told; keep one` });
    }
    else if (dirRead.decorated > 0) {
        // Единственное объявление — украшенное. Отказ ИМЕНУЕТ причину: сказать «не объявлен» про
        // строку, которую автор видит на экране, значит послать его чинить не то.
        violations.push({ rule: 'OUTPUT_DIR', detail: 'the only declaration is decorated (bold, quote or backticks) — the parser reads a bare line, so a decorated one is visible to a human and invisible to the check. Put it bare: OUTPUT_DIR: docs/research/<topic>' });
    }
    else if (outputDir === null || outputDir === '') {
        violations.push({ rule: 'OUTPUT_DIR', detail: 'no output directory declared. Add the line: OUTPUT_DIR: docs/research/<topic>' });
    }
    else if (/\s/.test(outputDir)) {
        violations.push({ rule: 'OUTPUT_DIR', detail: `"${shown(outputDir)}" contains whitespace — a trailing comment or note silently became part of the path. Put the path alone: OUTPUT_DIR: docs/research/<topic>` });
    }
    else if (HAS_SCHEME.test(outputDir)) {
        violations.push({ rule: 'OUTPUT_DIR', detail: `"${shown(outputDir)}" is an address, not a directory on disk. Put a path: OUTPUT_DIR: docs/research/<topic>` });
    }
    else if (dirPathRefusal !== null) {
        violations.push({ rule: 'OUTPUT_DIR', detail: dirPathRefusal });
    }
    else if (LAST_SEGMENT_HAS_DOT.test(normalizeDir(outputDir))) {
        violations.push({ rule: 'OUTPUT_DIR', detail: `"${shown(outputDir)}" looks like a FILE (a dot in the name); a DIRECTORY is needed — each unit is a separate file INSIDE it. Use: OUTPUT_DIR: docs/research/<topic>` });
    }
    const unitsRead = readList(lines, 'UNITS');
    const units = unitsRead.items ?? [];
    if (unitsRead.count > 1) {
        violations.push({ rule: 'UNITS', detail: `declared ${unitsRead.count} times — the real list cannot be told from an example; keep one` });
    }
    else if (unitsRead.decorated > 0 && unitsRead.items === null) {
        violations.push({ rule: 'UNITS', detail: 'the only UNITS line is decorated (bold, quote or backticks) — the parser reads a bare line. Put it bare: UNITS:' });
    }
    if (unitsRead.nested) {
        violations.push({ rule: 'UNITS', detail: 'a nested list item is not a unit: the list is flat, and flattening sub-points would corrupt the very list the directory is compared against. Move explanations into prose.' });
    }
    if (unitsRead.gapped) {
        violations.push({ rule: 'UNITS', detail: 'the list is broken by a blank line and resumes after it — a blank line cannot tell a continuation from a FOREIGN list, and guessing either way silently corrupts the list the directory is compared against. Keep the unit list contiguous.' });
    }
    if (unitsRead.interrupted !== null) {
        // ОТКАЗ НАЗЫВАЕТ СТРОКУ, А НЕ ТОЛЬКО ПРАВИЛО. Оборвавшую строку часто порождает одиночный
        // возврат каретки внутри пункта — глазами в редакторе её не найти, и отказ «список оборван»
        // послал бы автора искать невидимое. Значение приходит из недоверенного файла, поэтому идёт
        // через ту же `shown`, что все значения раунда 1: обезврежено, потом урезано (находка 10).
        // ЗАМАСКИРОВАННУЮ СТРОКУ НАЗЫВАЕМ СЛОВАМИ, А НЕ ВНУТРЕННЕЙ ЗАГЛУШКОЙ. Забор кода и
        // HTML-комментарий заменяются на MASK ещё до разбора; напечатать `\x00masked\x00` значило бы
        // назвать строку, которой автор в своём файле не видит, — то есть нарушить то самое требование
        // ADR-002, ради которого отказ вообще называет строку.
        const named = unitsRead.interrupted === MASK
            ? 'a fenced code block or an HTML comment'
            : `"${shown(unitsRead.interrupted)}"`;
        violations.push({
            rule: 'UNITS',
            detail: `the list is broken by a line that is not an item — ${named} — `
                + 'and more items follow it in the same block, so everything after it was dropped. That line '
                + 'cannot tell a continuation from a FOREIGN list, and guessing either way silently corrupts '
                + 'the list the directory is compared against. A single carriage return inside an item '
                + 'produces such a line invisibly. Keep the unit list contiguous.',
        });
    }
    if (unitsRead.items === null) {
        violations.push({ rule: 'UNITS', detail: 'no list of work units declared: without it there is nothing to compare the directory against' });
    }
    else if (units.length === 0) {
        violations.push({ rule: 'UNITS', detail: 'the unit list is empty — that is not "zero units", it is an unfilled declaration' });
    }
    else if (units.length < MIN_UNITS) {
        violations.push({ rule: 'UNITS', detail: `${units.length} unit(s): a single unit is the same "everything at the end" this contract exists to reject` });
    }
    if (units.length > MAX_UNITS) {
        // Поимённые проверки ниже пропускаются осознанно: перечислять тысячи имён в отказе — значит
        // утопить причину. Предел назван, лечение очевидно.
        violations.push({ rule: 'UNITS', detail: `too many units (${units.length}, limit ${MAX_UNITS}) — a brief with that many units is not a plan a swarm can follow; split the work into several briefs` });
    }
    else {
        // ЛИНЕЙНАЯ проверка дубликатов через Set (находка 9): `units.indexOf` внутри filter давал
        // квадрат — 100 тыс. единиц считались 40,25 с, из них 88-92% в этой строке.
        const seen = new Set();
        const dupes = new Set();
        for (const u of units) {
            if (seen.has(u))
                dupes.add(u);
            else
                seen.add(u);
        }
        if (dupes.size > 0) {
            violations.push({ rule: 'UNITS', detail: `duplicate units (${[...dupes].slice(0, 3).map((u) => shown(u, 30)).join(', ')}): two files with one name overwrite each other` });
        }
        const tooLong = units.filter((u) => u.length > MAX_UNIT_NAME);
        if (tooLong.length > 0) {
            violations.push({
                rule: 'UNITS',
                detail: `unit name too long (${tooLong[0]?.length ?? 0} chars, limit ${MAX_UNIT_NAME}): `
                    + `"${shown(tooLong[0] ?? '', 30)}". The file name is derived from it as <unit>${UNIT_FILE_EXTENSION}, `
                    + 'and a name past the file-system limit cannot be written at all',
            });
        }
        // ЗАРЕЗЕРВИРОВАННОЕ ИМЯ (находка 6, найдена двумя ревьюерами независимо). Шаблон велит первым
        // делом положить plan.md и заявляет, что он больше не меняется; единица `plan` его затирает, и
        // сверка «план минус диск» теряет опорный файл. Отказ НАЗЫВАЕТ причину, а не отказывает вообще.
        const reserved = units.filter((u) => unitFileName(u) === PLAN_FILE_NAME);
        if (reserved.length > 0) {
            violations.push({
                rule: 'UNITS',
                detail: `unit "${shown(reserved[0] ?? '', 30)}" is reserved: its file would be ${PLAN_FILE_NAME}, `
                    + 'which is the plan the swarm writes FIRST and never rewrites. A unit with that name overwrites it, '
                    + 'and the "plan minus disk" completeness check loses the very file it subtracts from. Rename the unit',
            });
        }
        const notSlugs = units.filter((u) => !UNIT_SLUG.test(u) && u.length <= MAX_UNIT_NAME);
        if (notSlugs.length > 0) {
            violations.push({
                rule: 'UNITS',
                detail: `not file names: ${notSlugs.slice(0, 3).map((u) => `"${shown(u, 40)}"`).join(', ')}. `
                    + 'A unit must be a slug (lowercase letters, digits, dashes or underscores) — the file name is '
                    + `derived from it as <unit>${UNIT_FILE_EXTENSION}, `
                    + 'otherwise there is nothing to compare the directory against. Use: - c1-identity',
            });
        }
    }
    const asmRead = readScalar(lines, 'ASSEMBLY_UNIT');
    const assemblyUnit = asmRead.value;
    if (asmRead.count > 1) {
        violations.push({ rule: 'ASSEMBLY_UNIT', detail: `declared ${asmRead.count} times — keep one value` });
    }
    else if (asmRead.decorated > 0) {
        violations.push({ rule: 'ASSEMBLY_UNIT', detail: 'the only declaration is decorated (bold, quote or backticks) — the parser reads a bare line. Put it bare: ASSEMBLY_UNIT: assemble-report' });
    }
    else if (assemblyUnit === null || assemblyUnit === '') {
        violations.push({ rule: 'ASSEMBLY_UNIT', detail: 'no report-assembly unit named — today the fragments are assembled by whoever remembers, and that agent is mortal too. Use: ASSEMBLY_UNIT: assemble-report (and add it to UNITS)' });
    }
    else if (units.length > 0 && !units.includes(assemblyUnit)) {
        violations.push({ rule: 'ASSEMBLY_UNIT', detail: `"${shown(assemblyUnit)}" is not among the units: assembly is declared but not planned as work` });
    }
    return { ok: violations.length === 0, outputDir, units, assemblyUnit, violations };
}
//# sourceMappingURL=swarm-brief.js.map