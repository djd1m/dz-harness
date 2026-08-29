#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_page.py — детерминированная проверка страницы решений перед публикацией.
Запуск:  python3 check_page.py page.html
Коды возврата: 0 — все обязательные ворота зелёные; 1 — есть падение (публикация
запрещена); 2 — скрипт вызван неправильно (нет аргумента, файл не найден).
Различать 1 и 2 обязательно: «страница не прошла ворота» и «я опечатался в пути» —
разные новости, и вторая не должна выглядеть как первая."""
import re, sys, os, collections

# ---------- Таблица калек для G15 (расширяемая: одна строка — один паттерн) ----------
# Технические кальки протекают из внутренних артефактов (сводок, отчётов QE, логов)
# в текст для владельца и убивают ровно то понимание, ради которого страница делается.
# Первые три строки — кальки, ПОЙМАННЫЕ владельцем на живой странице; дальше та же
# семья. Добавить завтрашнюю кальку = дописать сюда одну строку, кода не трогая.
#
# Чего в таблице СОЗНАТЕЛЬНО нет (проверено на реальной странице — каждое дало бы
# ложное красное): «коммит» — у владельца это уже обычное существительное («14 коммитов
# за ночь»); «фича» — слово из его собственной речи. Нет и «воркера»: language-guide
# прямо разрешает ввести его в кавычках ПОСЛЕ аналогии («фоновый сборщик („воркер“)»),
# а ворота, краснеющие на образцовом тексте самого скилла, — сломанные ворота.
CALQUES = [(re.compile(p, re.I), plain) for p, plain in [
    (r'\bран(?:а|у|е|ом|ы|ов|ам|ах|ами)?\b', 'запуски'),
    (r'\bрантайм\w*',                    'среда исполнения (а чаще просто «Claude и Codex»)'),
    (r'\bкреденш\w*',                    'ключи доступа'),
    (r'\b(?:деплой|диплой)\w*',          'выкладка, публикация'),
    (r'\bпайплайн\w*',                   'конвейер'),
    (r'\bбилд\w*',                       'сборка'),
    (r'\b(?:мёрдж|мердж)\w*',            'слияние'),
    (r'\bджоб(?:а|ы|ов|у|е|ом|ам|ах|ами)\b', 'задача'),
    (r'\bтаск(?:а|и|ов|у|е|ом|ам|ах|ами)\b', 'задача'),
    (r'\b(?:хендшейк|хэндшейк)\w*',      'установка защищённого соединения'),
    (r'\bхардкод\w*',                    'зашито в код'),
    (r'\bфикс(?:а|у|е|ом|ы|ов|ам|ах|ами)?\b', 'починка'),
    (r'\b(?:дебаг|дебаж)\w*',            'разбор причины'),
    (r'\bаптайм\w*',                     'доступность'),
    (r'\bфейл\w*',                       'падение, отказ'),
    (r'\bапрув\w*',                      'одобрение'),
]]

if len(sys.argv) < 2:
    print('usage: python3 check_page.py путь/к/странице.html'); sys.exit(2)
path = sys.argv[1]
if not os.path.isfile(path):
    print(f'нет такого файла: {path}'); sys.exit(2)
try:
    raw = open(path, encoding='utf-8').read()
except OSError as e:
    print(f'не читается {path}: {e}'); sys.exit(2)

# Комментарии — не разметка. Шаблон и picker.js носят в комментариях ПРИМЕРЫ разметки
# (`data-group="f2"`, `data-val="…"`); без вырезания они считаются настоящими развилками
# и дают фантомные G6b/G9. Режем HTML-комментарии и блочные JS/CSS-комментарии;
# строчные `//` НЕ трогаем — под них попадают протокол-относительные URL.
src = re.sub(r'<!--.*?-->', '', raw, flags=re.S)
src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)

FAIL, WARN = [], []
def gate(cond, msg):  (FAIL if not cond else []).append(msg)
def soft(cond, msg):  (WARN if not cond else []).append(msg)

# ---------- G1. Баланс div ----------
o, c = len(re.findall(r'<div\b', src)), len(re.findall(r'</div\s*>', src))
gate(o == c, f'G1 баланс div: открыто {o}, закрыто {c}')
for t in ('section', 'figure', 'aside', 'ul', 'li', 'p'):
    oo = len(re.findall(r'<%s\b' % t, src)); cc = len(re.findall(r'</%s\s*>' % t, src))
    soft(oo == cc, f'G1b <{t}>: открыто {oo}, закрыто {cc}')

# ---------- разбор <style> ----------
# Берём ВСЕ блоки стилей, а не первый: второй <style> раньше был невидим для G2/G3,
# и палитра во втором блоке проезжала мимо всех проверок.
blocks = re.findall(r'<style[^>]*>(.*?)</style>', src, re.S)
gate(bool(blocks), 'G0 нет блока <style>')
style = '\n'.join(blocks)
# Вырезаем объявления токенов — внутри них литералы законны. Вырезаются ТОЛЬКО три
# легальных селектора темы. Прошлая маска `:root[^{]*\{` глотала и `:root .browser {…}`,
# то есть любой обычный селектор-потомок объявлял себя «блоком токенов» и уносил
# свои литералы из-под G2.
TOKEN_BLOCK = re.compile(
    r'(?::root\s*\{'
    r'|:root:not\(\[data-theme=["\'][^"\']*["\']\]\)\s*\{'
    r'|:root\[data-theme=["\'][^"\']*["\']\]\s*\{).*?\}', re.S)
no_tokens = TOKEN_BLOCK.sub('', style)

# ---------- G2. Ноль цветовых литералов вне токенов ----------
COLORLIT = r'#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\('
lits = re.findall(COLORLIT, no_tokens)
gate(not lits, f'G2 цвета вне токенов ({len(lits)}): {sorted(set(lits))[:8]}')
# style="…" в разметке — тот же цвет мимо токена, только мимо <style> целиком.
# Это живой путь: инлайновые отступы на странице уже есть, цвет припишется рядом.
inline_lit = [v.strip() for v in re.findall(r'\sstyle="([^"]*)"', src) if re.search(COLORLIT, v)]
gate(not inline_lit, f'G2b цветовые литералы в style="…" ({len(inline_lit)}): {inline_lit[:3]} — '
                     f'в тёмной теме они не переключатся')

# ---------- G3. Три темовых блока + паритет наборов токенов ----------
# Пробел перед `{` — обычное дело для любого форматтера CSS, поэтому все три селектора
# читаются через `\s*\{`, а кавычки в [data-theme] — и одинарные, и двойные.
# Голый :root ловится тем, что сразу за ним идёт `{`: `:root:not(` и `:root[` не подойдут.
Q = r'["\']'
b_light = re.search(r':root\s*\{(.*?)\}', style, re.S)
b_media = re.search(r'@media\s*\([^)]*prefers-color-scheme\s*:\s*dark[^)]*\)\s*\{\s*'
                    r':root:not\(\[data-theme=' + Q + r'light' + Q + r'\]\)\s*\{(.*?)\}',
                    style, re.S)
b_dark  = re.search(r':root\[data-theme=' + Q + r'dark' + Q + r'\]\s*\{(.*?)\}', style, re.S)
gate(bool(b_light), 'G3a нет палитры на голом :root{')
gate(bool(b_media), 'G3b нет @media (prefers-color-scheme: dark) с :root:not([data-theme="light"])')
gate(bool(b_dark),  'G3c нет :root[data-theme="dark"]')
names = lambda b: set(re.findall(r'(--[a-z0-9-]+)\s*:', b.group(1))) if b else set()
L, M, D = names(b_light), names(b_media), names(b_dark)
# Пустой светлый набор — это отдельная беда, и говорить про неё надо прямо,
# а не печатать «наборы не совпадают; разница: []» (сообщение, которое ничего не значит).
gate(bool(L), 'G3d0 в блоке :root{} не объявлено ни одного токена --*')
diff = lambda a, b, na, nb: f'только в {na}: {sorted(a-b)}; только в {nb}: {sorted(b-a)}'
gate(not L or L == M, f'G3d media-набор != light-набор; {diff(L, M, "light", "media")}')
gate(not L or L == D, f'G3e dark-набор != light-набор; {diff(L, D, "light", "dark")}')
soft(len(L) >= 30, f'G3f токенов всего {len(L)} — для страницы с мокапами обычно 35+')

# ---------- G3g/G3h. У тёмных блоков должны отличаться ЗНАЧЕНИЯ, а не только имена ----------
# G3d/G3e сравнивают наборы ИМЁН. Самая частая ошибка сборки — «скопировал блок,
# поменять цвета забыл»: имена совпадают идеально, страница светлая на светлом
# у каждого, кто читает в тёмной теме. Имена уже проверены выше, здесь — значения.
vals = lambda b: dict((k, v.strip()) for k, v in
                      re.findall(r'(--[a-z0-9-]+)\s*:\s*([^;}]+)', b.group(1))) if b else {}
VL, VM, VD = vals(b_light), vals(b_media), vals(b_dark)
CORE = ('--bg', '--ink', '--surface', '--fg', '--card', '--text', '--border', '--line')
def repaints(v):
    if not v or not VL: return True          # отсутствие блока ловят G3b/G3c
    core = [k for k in CORE if k in VL and k in v]
    if core: return any(VL[k] != v[k] for k in core)
    return sum(1 for k in VL if k in v and VL[k] != v[k]) >= max(1, len(VL) // 4)
gate(repaints(VM), 'G3g media-блок повторяет ЗНАЧЕНИЯ светлой темы — имена совпали, цвета нет')
gate(repaints(VD), 'G3h [data-theme="dark"] повторяет ЗНАЧЕНИЯ светлой темы — тёмной темы фактически нет')

# ---------- G4. body имеет явный фон-токен ----------
mb = re.search(r'\bbody\s*\{([^}]*)\}', style, re.S)
gate(bool(mb) and re.search(r'background(-color)?\s*:\s*var\(--', mb.group(1)),
     'G4 у body нет background:var(--...) — страница займёт фон хоста')

# ---------- G5. Ноль внешних ресурсов (CSP) ----------
ext = [u for u in re.findall(r'(?:src|href)\s*=\s*["\'](?!#)([^"\']+)', src)
       if re.match(r'https?:|//', u)]
gate(not ext, f'G5a внешние src/href: {ext[:5]}')
gate('@import' not in style, 'G5b @import в CSS')
gate(not re.findall(r'url\(\s*["\']?https?:', style), 'G5c url(http...) в CSS')
gate('@font-face' not in style, 'G5d @font-face — веб-шрифт не загрузится под CSP')
gate(not re.findall(r'<(img|iframe|video|audio|link|object|embed)\b', src),
     'G5e тег, который скилл не использует (img/iframe/video/link/...): мокапы рисуются CSS, '
     'а всё, что грузится извне, режет CSP')

# ---------- разбор развилок ----------
# Развилка ищется как ЭЛЕМЕНТ, а не как пара атрибутов в фиксированном порядке:
# `data-label` перед `data-group` — валидная разметка, а прошлая маска на ней
# рапортовала «на странице нет ни одной развилки» при двух живых развилках.
FORK = re.compile(r'<[a-zA-Z][\w-]*\b[^>]*\bdata-group="([^"]*)"[^>]*>')
OPTTAG = re.compile(r'<[a-zA-Z][\w-]*\b[^>]*\bdata-val="[^"]*"[^>]*>')
forks = [(m.group(1), m.start(), m.group(0)) for m in FORK.finditer(src)]
labels = {}
groups = []
for gid, start, tag in forks:
    lab = re.search(r'data-label="([^"]*)"', tag)
    labels[gid] = lab.group(1) if lab else ''
    groups.append((gid, labels[gid]))
gate(bool(groups), 'G6a на странице нет ни одной развилки data-group')

def subtree(idx):
    """HTML элемента, чей открывающий тег начинается в позиции idx (по парному закрытию).

    Тело развилки раньше резалось «до следующего data-group=», то есть по позиции
    в тексте, а не по вложенности: любой декоративный элемент с data-val, стоявший
    НИЖЕ развилки, засчитывался ей в варианты (и одноопционная развилка проходила
    G9), а тело последней развилки тянулось до конца файла вместе со скриптом."""
    m0 = re.match(r'<([a-zA-Z][\w-]*)', src[idx:])
    if not m0: return ''
    op = re.compile(r'<%s\b' % m0.group(1))
    cl = re.compile(r'</%s\s*>' % m0.group(1))
    depth, pos = 0, idx
    while pos < len(src):
        a, b = op.search(src, pos), cl.search(src, pos)
        if not b: return src[idx:]
        if a and a.start() < b.start():
            depth += 1; pos = a.end()
        else:
            depth -= 1; pos = b.end()
            if depth == 0: return src[idx:pos]
    return src[idx:]

# ---------- G6. Уникальность data-group ----------
dup = [k for k, n in collections.Counter(g for g, _ in groups).items() if n > 1]
gate(not dup, f'G6b дубли data-group: {dup}')
nolab = [g for g, l in groups if not l.strip()]
gate(not nolab, f'G6c развилки без data-label (или с пустым): {nolab} — в экспорте будет голый id')

# ---------- G7/G9. Варианты: непустые, короткие, их >= 2 ----------
per, bodies, starts = {}, {}, {}
for gid, start, tag in forks:
    body = subtree(start)
    per[gid] = re.findall(r'data-val="([^"]*)"', body)
    bodies[gid] = body
    starts[gid] = start
for gid, vals in per.items():
    gate(len(vals) >= 2, f'G9 развилка {gid}: живых вариантов {len(vals)} — мнимая развилка, её надо убрать')
    for v in vals:
        gate(bool(v.strip()), f'G7a пустой data-val в {gid}')
        gate(len(v) <= 120, f'G7b слишком длинный data-val в {gid} ({len(v)} симв.): {v[:50]}...')
    gate(len(set(vals)) == len(vals), f'G7c одинаковые data-val внутри {gid}')
allvals = re.findall(r'data-val="([^"]*)"', src)
gate(all(re.search(r'role="button"[^>]*tabindex="0"|tabindex="0"[^>]*role="button"', t)
         for t in re.findall(r'<[^>]*data-val="[^"]*"[^>]*>', src)),
     'G7d есть вариант без role="button" + tabindex="0" (не кликается с клавиатуры)')
# G7e: data-val вне какой-либо развилки. Такой элемент выглядит как вариант, но пикер
# его не видит: клик мёртвый. Он же — самый дешёвый способ замаскировать одноопционную
# развилку, пока тело развилки резалось по позиции в тексте.
inside = sum(len(v) for v in per.values())
soft(inside == len(allvals),
     f'G7e data-val вне развилок: {len(allvals) - inside} шт. — эти «варианты» не кликаются')

# ---------- G8. Счётчик берётся из DOM ----------
# Проверяем НАМЕРЕНИЕ («M присваивается длиной коллекции узлов»), а не одну строчку кода.
# Прошлая формулировка требовала дословно `pb-total').textContent = String(groups.length)`
# и заваливала любую страницу, собранную на templates/picker.js, где элемент вынесен
# в переменную (`totalEl.textContent = …`) ради настраиваемого totalId.
# Присваивание должно быть привязано К СЛОТУ счётчика. «Где-то на странице есть
# …textContent = ….length» пропускало страницу, где total зашит литералом, а .length
# стоит на постороннем элементе (декой) — ровно тот обход, ради которого ворота и живут.
has_slot   = 'pb-total' in src or re.search(r'totalId\s*:', src)
slot_assign = re.search(r'(?:getElementById\(\s*["\']pb-total["\']\s*\)'
                        r'|getElementById\(\s*[A-Za-z_$][\w$]*\.totalId\s*\)'
                        r'|\btotalEl\b)\s*\.textContent\s*=\s*([^;\n]+)', src)
derives = bool(slot_assign) and bool(re.search(r'\.length\b', slot_assign.group(1)))
gate(bool(has_slot), 'G8a на странице нет слота счётчика (#pb-total / totalId)')
gate(derives,
     'G8 итог развилок не вычисляется из DOM (слоту счётчика не присваивается ….length) — '
     'цифра разъедется с реальностью')
# G8b: статическая цифра в разметке слота. JS её перетрёт, но до запуска JS читатель
# видит выдуманное число — и оно уже расходилось с DOM на эталонной странице.
slot_html = re.search(r'id="pb-total"[^>]*>([^<]*)<', src)
soft(not slot_html or slot_html.group(1).strip() in ('', '0'),
     f'G8b в разметке #pb-total стоит «{slot_html.group(1).strip() if slot_html else ""}» — '
     f'ручная цифра; ставьте 0, счётчик заполнит JS')

# ---------- G10. Каждый вариант называет цену ----------
# G10a (детерминированно): развёрнутый вариант в .opts.pickable обязан открываться
# жирным вердиктом «Вариант X — <маркер>.» — именно там живёт цена.
# Класс читается ПО ТОКЕНАМ, а не префиксом: `class="suggest opt"` — тот же вариант,
# а прошлая маска `class="opt[^"]*"` его не видела и молча выпускала из проверки.
# Текст варианта берётся целым поддеревом: обрезка «до первого </div>» теряла всё,
# что стояло после вложенного элемента, вместе с ценой.
def has_class(tag, name):
    mm = re.search(r'class="([^"]*)"', tag)
    return bool(mm) and name in mm.group(1).split()
def inner(h):
    h = h[h.index('>') + 1:] if '>' in h else h
    return re.sub(r'</[a-zA-Z][\w-]*\s*>\s*$', '', h)
prose = [inner(subtree(m.start())) for m in OPTTAG.finditer(src) if has_class(m.group(0), 'opt')]
bad10a = [re.sub(r'<[^>]+>', '', t).strip()[:60] for t in prose
          if not re.match(r'\s*<b>[^<]{3,70}</b>', t)]
gate(not bad10a, f'G10a развёрнутые варианты без жирного вердикта в начале: {bad10a[:3]}')
# G10b (детерминированно): у чип-развилки .picks цена живёт в <p class="rec"> той же карточки.
for card in re.findall(r'<div class="qcard">(.*?)(?=<div class="qcard">|</div>\s*</section>)', src, re.S):
    if 'class="picks"' in card:
        gid = re.search(r'data-group="([^"]*)"', card)
        gate('class="rec"' in card,
             f'G10b чип-развилка {gid.group(1) if gid else "?"} без <p class="rec"> — цена не названа')
# G10d (детерминированно): G10a смотрит только на `div.opt`, G10b — только внутрь
# `div.qcard`. Развилка другой формы не проваливала НИ ОДНУ из них — она просто
# выпадала из проверки, и ворота «каждый вариант называет цену» молча зеленели.
# Здесь требуем, чтобы каждая развилка была покрыта хотя бы одним из двух способов.
BOUND = re.compile(r'<h[2-4]\b|class="qcard"')
def card_prose(idx):
    b = 0
    for mm in BOUND.finditer(src, 0, idx):
        b = mm.start()
    return src[b:idx]
uncovered = []
for gid, body in bodies.items():
    by_a = any(has_class(m.group(0), 'opt') for m in OPTTAG.finditer(body))
    by_b = 'class="rec"' in card_prose(starts[gid])
    if not (by_a or by_b):
        uncovered.append(gid)
gate(not uncovered,
     f'G10d развилки, цену которых не проверил ни G10a, ни G10b: {uncovered} — '
     f'нужен либо развёрнутый .opt с жирным вердиктом, либо <p class="rec"> в карточке')
# G10c (полуавтомат — глазами): варианты, в тексте которых нет слова о цене/последствии.
# `рекоменд` и `отклон` из списка убраны: это ЯРЛЫКИ варианта, а не его цена, и с ними
# ворота были непровальными — шаг 4 сам предписывает слово «рекомендуем», так что любой
# собранный по инструкции вариант зеленел, ничего не сказав о цене.
# Стемы правятся под живые формы: «дороже», «требуется», «не требует» раньше не ловились
# (`дорог` не матчит «дорож`е», `потребует` не матчит «требуется») и давали ложный WARN.
COST = re.compile(r'запасн|переделк|переписыв|дорог|дорож|дешев|дешевл|цена|стоит|платим|'
                  r'потребует|требует|требуется|бесплатн|полдня|сразу|'
                  r'займ[её]т|нед[ае]л|дн[ейя]|час[ова]|объ[её]м|риск|хуже|теря|медленн|'
                  r'отлож|оставить как есть|\bXS\b|\bS\b|\bM\b|\bL\b|\bXL\b', re.I)
noc = [re.sub(r'<[^>]+>', '', t).strip()[:60] for t in prose if not COST.search(t)]
soft(not noc, f'G10c глазами прочитать {len(noc)} развёрнутых вариант(ов) без слова о цене: {noc[:3]}')

# ---------- G11. Экспорт самодостаточен ----------
gate('exportText' in src, 'G11a нет функции exportText')
# Проверяется НАМЕРЕНИЕ («первая строка называет тему и дату»), а не имя переменной:
# прошлая маска требовала дословно `lines = ['Решения по …(` и краснела на том же коде,
# переписанном на шаблонную строку. Скилл русскоязычный — литералы русские намеренно.
gate(bool(re.search(r'''['"`]\s*Решения по .*?\(''', src)),
     'G11b первая строка экспорта не называет тему и дату')
gate("data-label" in src and "getAttribute('data-label')" in src,
     'G11c экспорт не использует человекочитаемые data-label')
gate('Без ответа' in src, 'G11d экспорт не перечисляет неотвеченные развилки')
gate('navigator.clipboard' in src and 'execCommand' in src,
     'G11e нет пары clipboard + execCommand-фолбэк')
gate("Скопировано" in src, 'G11f кнопка не подтверждает копирование')

# ---------- G12. Широкое содержимое скроллится внутри себя ----------
soft('overflow-x:auto' in style.replace(' ', ''), 'G12 ни один контейнер не помечен overflow-x:auto')
soft('overflow-x:hidden' in style.replace(' ', '') or 'max-width:100%' in style.replace(' ', ''),
     'G12b нет страховки от горизонтального скролла страницы')

# ---------- G13. Заглушек шаблона не осталось ----------
# Самый вероятный и самый дорогой по репутации провал заполняемого шаблона —
# отправить владельцу страницу со словом ЗАМЕНИТЬ. Это одна строка регулярки,
# и держать такую проверку на внимательности агента — держать её на самом слабом слое.
ph = re.findall(r'ЗАМЕНИТЬ|<тема>|<дата>|\bTODO\b|Lorem ipsum', src)
gate(not ph, f'G13 остались заглушки шаблона ({len(ph)}): {sorted(set(ph))[:4]} — '
             f'страница взята из скелета, но не заполнена')

# ---------- G14. Никакой оболочки документа ----------
# Artifact оборачивает файл в <!doctype><html><head>…<body> сам. Своя оболочка даёт
# документ внутри документа; из всей этой конструкции и следует запрет на внешние ресурсы.
shell = sorted(set(s.lower() for s in re.findall(r'<!doctype\b|<html\b|<head\b|<body\b', src, re.I)))
gate(not shell, f'G14 в файле есть оболочка документа {shell} — Artifact добавляет её сам')
gate(bool(re.search(r'<title>[^<]{3,}</title>', src)),
     'G14b нет <title> — артефакт останется без имени во вкладке и в галерее')

# ---------- G15. Ни одной технической кальки в тексте страницы ----------
# Проверка живёт здесь, а не пунктом чек-листа: всё, что выражается регуляркой, обязано
# стоять на детерминированном слое — иначе это обещание, а не гарантия. Смотрим ТОЛЬКО
# то, что владелец читает: <style>, <script>, HTML-комментарии и сами теги забиваются
# пробелами той же длины, поэтому строка и позиция совпадают с исходным файлом.
def _blank(m): return re.sub(r'[^\n]', ' ', m.group(0))
visible = re.sub(r'<style[^>]*>.*?</style>', _blank, raw, flags=re.S | re.I)
visible = re.sub(r'<script[^>]*>.*?</script>', _blank, visible, flags=re.S | re.I)
visible = re.sub(r'<!--.*?-->', _blank, visible, flags=re.S)
visible = re.sub(r'<[^>]+>', _blank, visible)
# Оговорка — по конвенции правила no-stubs из `dz guard`: токен «calque: <причина>»
# освобождает ВСЮ свою строку, а оговорка БЕЗ причины отклоняется и сама становится
# находкой — освобождение, которое нельзя объяснить, это молчаливый allowlist.
# Токен ищется в СЫРОМ тексте: в `visible` комментарии уже забиты.
# Известный предел (назван, а не заметён): токен освобождает строку целиком и качества
# причины ворота не судят — защита здесь в том, что «calque:» гриппается одной командой.
# Оговорка засчитывается ТОЛЬКО внутри HTML-комментария и ТОЛЬКО с настоящей причиной
# (>= 3 буквенно-цифровых знака). `calque:` в значении атрибута не освобождает ничего:
# иначе `<div data-x="calque: x">` молча снимал бы всю строку, а на однострочном
# (минифицированном) документе — всю страницу.
WAIVER_RE = re.compile(r'<!--[^>]*?calque:\s*([^>]*?)-->')
calque_hits, bad_waivers = [], []
raw_lines, vis_lines = raw.split('\n'), visible.split('\n')
assert len(raw_lines) == len(vis_lines)   # split('\n') only — see WAIVER_RE note
for ln, (line_raw, line_txt) in enumerate(zip(raw_lines, vis_lines), 1):
    waived = False
    for wm in WAIVER_RE.finditer(line_raw):
        why = (wm.group(1) or '').strip()
        if len(re.findall(r'\w', why)) >= 3: waived = True
        else:                                bad_waivers.append(ln)
    if waived: continue
    for pat, plain in CALQUES:
        for m in pat.finditer(line_txt):
            calque_hits.append((ln, m.start() + 1, m.group(0), plain))
for ln in sorted(set(bad_waivers)):
    FAIL.append(f'G15b строка {ln}: оговорка «calque:» без причины — отклонена, она не '
                f'освобождает ничего; освобождение, которое нельзя объяснить, — молчаливый allowlist')
for ln, col, word, plain in calque_hits[:10]:
    FAIL.append(f'G15 строка {ln}, поз. {col}: калька «{word}» — скажите «{plain}»')
if len(calque_hits) > 10:
    FAIL.append(f'G15 …и ещё {len(calque_hits) - 10} калька(и): список усечён, '
                f'чините с начала страницы')

print(f'развилок: {len(groups)}   вариантов: {len(allvals)}   токенов: {len(L)}')
for w in WARN: print('  WARN  ' + w)
for f in FAIL: print('  FAIL  ' + f)
print('\nRESULT:', 'GREEN' if not FAIL else f'RED ({len(FAIL)})')
sys.exit(0 if not FAIL else 1)
