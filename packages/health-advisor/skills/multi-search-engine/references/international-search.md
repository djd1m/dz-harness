# Руководство по углубленному поиску в международных поисковых системах

## 🔍 Углубленный поиск в Google

### 1.1 Основные операторы расширенного поиска

| Оператор | Функция | Пример | URL |
|----------|---------|--------|-----|
| `""` | Точное совпадение | `"machine learning"` | `https://www.google.com/search?q=%22machine+learning%22` |
| `-` | Исключение ключевого слова | `python -snake` | `https://www.google.com/search?q=python+-snake` |
| `OR` | Логическое ИЛИ | `machine learning OR deep learning` | `https://www.google.com/search?q=machine+learning+OR+deep+learning` |
| `*` | Подстановочный знак | `machine * algorithms` | `https://www.google.com/search?q=machine+*+algorithms` |
| `()` | Группировка | `(apple OR microsoft) phones` | `https://www.google.com/search?q=(apple+OR+microsoft)+phones` |
| `..` | Числовой диапазон | `laptop $500..$1000` | `https://www.google.com/search?q=laptop+%24500..%241000` |

### 1.2 Поиск по сайтам и типам файлов

| Оператор | Функция | Пример |
|----------|---------|--------|
| `site:` | Поиск по сайту | `site:github.com python projects` |
| `filetype:` | Тип файла | `filetype:pdf annual report` |
| `inurl:` | Содержится в URL | `inurl:login admin` |
| `intitle:` | Содержится в заголовке | `intitle:"index of" mp3` |
| `intext:` | Содержится в тексте | `intext:password filetype:txt` |
| `cache:` | Просмотр кеша | `cache:example.com` |
| `related:` | Похожие сайты | `related:github.com` |
| `info:` | Информация о сайте | `info:example.com` |

### 1.3 Параметры фильтрации по времени

| Параметр | Значение | Пример URL |
|----------|----------|------------|
| `tbs=qdr:h` | За последний час | `https://www.google.com/search?q=news&tbs=qdr:h` |
| `tbs=qdr:d` | За последние 24 часа | `https://www.google.com/search?q=news&tbs=qdr:d` |
| `tbs=qdr:w` | За последнюю неделю | `https://www.google.com/search?q=news&tbs=qdr:w` |
| `tbs=qdr:m` | За последний месяц | `https://www.google.com/search?q=news&tbs=qdr:m` |
| `tbs=qdr:y` | За последний год | `https://www.google.com/search?q=news&tbs=qdr:y` |
| `tbs=cdr:1,cd_min:1/1/2024,cd_max:12/31/2024` | Пользовательский диапазон дат | Весь 2024 год |

### 1.4 Фильтрация по языку и региону

| Параметр | Функция | Пример |
|----------|---------|--------|
| `hl=en` | Язык интерфейса | `https://www.google.com/search?q=test&hl=en` |
| `lr=lang_zh-CN` | Язык результатов поиска | `https://www.google.com/search?q=test&lr=lang_zh-CN` |
| `cr=countryCN` | Страна/регион | `https://www.google.com/search?q=test&cr=countryCN` |
| `gl=us` | Географическое положение | `https://www.google.com/search?q=test&gl=us` |

### 1.5 Специальные типы поиска

| Тип | URL | Описание |
|-----|-----|----------|
| Поиск изображений | `https://www.google.com/search?q={keyword}&tbm=isch` | `tbm=isch` означает изображения |
| Поиск новостей | `https://www.google.com/search?q={keyword}&tbm=nws` | `tbm=nws` означает новости |
| Поиск видео | `https://www.google.com/search?q={keyword}&tbm=vid` | `tbm=vid` означает видео |
| Поиск по картам | `https://www.google.com/search?q={keyword}&tbm=map` | `tbm=map` означает карты |
| Поиск товаров | `https://www.google.com/search?q={keyword}&tbm=shop` | `tbm=shop` означает покупки |
| Поиск книг | `https://www.google.com/search?q={keyword}&tbm=bks` | `tbm=bks` означает книги |
| Академический поиск | `https://scholar.google.com/scholar?q={keyword}` | Google Scholar |

### 1.6 Примеры углубленного поиска в Google

```javascript
// 1. Поиск проектов Python по машинному обучению на GitHub
web_fetch({"url": "https://www.google.com/search?q=site:github.com+python+machine+learning"})

// 2. Поиск PDF-учебников по машинному обучению за 2024 год
web_fetch({"url": "https://www.google.com/search?q=machine+learning+tutorial+filetype:pdf&tbs=cdr:1,cd_min:1/1/2024"})

// 3. Поиск страниц о Python с "tutorial" в заголовке
web_fetch({"url": "https://www.google.com/search?q=intitle:tutorial+python"})

// 4. Поиск новостей за последнюю неделю
web_fetch({"url": "https://www.google.com/search?q=AI+breakthrough&tbs=qdr:w&tbm=nws"})

// 5. Поиск контента на китайском языке (интерфейс на английском, результаты на китайском)
web_fetch({"url": "https://www.google.com/search?q=人工智能&lr=lang_zh-CN&hl=en"})

// 6. Поиск ноутбуков в определенном ценовом диапазоне
web_fetch({"url": "https://www.google.com/search?q=laptop+%241000..%242000+best+rating"})

// 7. Поиск с исключением Wikipedia
web_fetch({"url": "https://www.google.com/search?q=python+programming+-wikipedia"})

// 8. Поиск академической литературы
web_fetch({"url": "https://scholar.google.com/scholar?q=deep+learning+optimization"})

// 9. Поиск кешированных страниц (просмотр удаленного контента)
web_fetch({"url": "https://webcache.googleusercontent.com/search?q=cache:example.com"})

// 10. Поиск похожих сайтов
web_fetch({"url": "https://www.google.com/search?q=related:stackoverflow.com"})
```

---

## 🦆 Углубленный поиск в DuckDuckGo

### 2.1 Особые возможности DuckDuckGo

| Функция | Синтаксис | Пример |
|---------|-----------|--------|
| **Быстрые переходы (Bangs)** | `!сокращение` | `!g python` -> поиск в Google |
| **Генерация паролей** | `password` | `https://duckduckgo.com/?q=password+20` |
| **Конвертация цветов** | `color` | `https://duckduckgo.com/?q=+%23FF5733` |
| **Сокращение ссылок** | `shorten` | `https://duckduckgo.com/?q=shorten+example.com` |
| **Генерация QR-кодов** | `qr` | `https://duckduckgo.com/?q=qr+hello+world` |
| **Генерация UUID** | `uuid` | `https://duckduckgo.com/?q=uuid` |
| **Кодирование/декодирование Base64** | `base64` | `https://duckduckgo.com/?q=base64+hello` |

### 2.2 Полный список DuckDuckGo Bangs

#### Поисковые системы

| Bang | Назначение | Пример |
|------|------------|--------|
| `!g` | Google | `!g python tutorial` |
| `!b` | Bing | `!b weather` |
| `!y` | Yahoo | `!y finance` |
| `!sp` | Startpage | `!sp privacy` |
| `!brave` | Brave Search | `!brave tech` |

#### Разработка и программирование

| Bang | Назначение | Пример |
|------|------------|--------|
| `!gh` | GitHub | `!gh tensorflow` |
| `!so` | Stack Overflow | `!so javascript error` |
| `!npm` | npmjs.com | `!npm express` |
| `!pypi` | PyPI | `!pypi requests` |
| `!mdn` | MDN Web Docs | `!mdn fetch api` |
| `!docs` | DevDocs | `!docs python` |
| `!docker` | Docker Hub | `!docker nginx` |

#### Энциклопедии и справочники

| Bang | Назначение | Пример |
|------|------------|--------|
| `!w` | Wikipedia | `!w machine learning` |
| `!wen` | Wikipedia (англ.) | `!wen artificial intelligence` |
| `!wt` | Wiktionary | `!wt serendipity` |
| `!imdb` | IMDb | `!imdb inception` |

#### Покупки и цены

| Bang | Назначение | Пример |
|------|------------|--------|
| `!a` | Amazon | `!a wireless headphones` |
| `!e` | eBay | `!e vintage watch` |
| `!ali` | AliExpress | `!ali phone case` |

#### Карты и местоположение

| Bang | Назначение | Пример |
|------|------------|--------|
| `!m` | Google Maps | `!m Beijing` |
| `!maps` | OpenStreetMap | `!maps Paris` |

### 2.3 Параметры поиска DuckDuckGo

| Параметр | Функция | Пример |
|----------|---------|--------|
| `kp=1` | Строгий безопасный поиск | `https://duckduckgo.com/html/?q=test&kp=1` |
| `kp=-1` | Отключение безопасного поиска | `https://duckduckgo.com/html/?q=test&kp=-1` |
| `kl=cn` | Регион — Китай | `https://duckduckgo.com/html/?q=news&kl=cn` |
| `kl=us-en` | Регион — США (англ.) | `https://duckduckgo.com/html/?q=news&kl=us-en` |
| `ia=web` | Веб-результаты | `https://duckduckgo.com/?q=test&ia=web` |
| `ia=images` | Изображения | `https://duckduckgo.com/?q=test&ia=images` |
| `ia=news` | Новости | `https://duckduckgo.com/?q=test&ia=news` |
| `ia=videos` | Видео | `https://duckduckgo.com/?q=test&ia=videos` |

### 2.4 Примеры углубленного поиска в DuckDuckGo

```javascript
// 1. Переход в Google через Bang
web_fetch({"url": "https://duckduckgo.com/html/?q=!g+machine+learning"})

// 2. Прямой поиск проектов на GitHub
web_fetch({"url": "https://duckduckgo.com/html/?q=!gh+react"})

// 3. Поиск ответов на Stack Overflow
web_fetch({"url": "https://duckduckgo.com/html/?q=!so+python+list+comprehension"})

// 4. Генерация пароля
web_fetch({"url": "https://duckduckgo.com/?q=password+16"})

// 5. Кодирование в Base64
web_fetch({"url": "https://duckduckgo.com/?q=base64+hello+world"})

// 6. Конвертация цветового кода
web_fetch({"url": "https://duckduckgo.com/?q=%23FF5733"})

// 7. Поиск видео на YouTube
web_fetch({"url": "https://duckduckgo.com/html/?q=!yt+python+tutorial"})

// 8. Просмотр Wikipedia
web_fetch({"url": "https://duckduckgo.com/html/?q=!w+artificial+intelligence"})

// 9. Поиск товаров на Amazon
web_fetch({"url": "https://duckduckgo.com/html/?q=!a+laptop"})

// 10. Генерация QR-кода
web_fetch({"url": "https://duckduckgo.com/?q=qr+https://github.com"})
```

---

## 🔎 Углубленный поиск в Brave Search

### 3.1 Особые возможности Brave Search

| Функция | Параметр | Пример |
|---------|----------|--------|
| **Собственный индекс** | Не зависит от Google/Bing | Собственный поисковый робот |
| **Goggles** | Пользовательские правила поиска | Создание персональных фильтров |
| **Discussions** | Поиск по обсуждениям на форумах | Агрегация Reddit и других форумов |
| **News** | Агрегация новостей | Независимый новостной индекс |

### 3.2 Параметры Brave Search

| Параметр | Функция | Пример |
|----------|---------|--------|
| `tf=pw` | Эта неделя | `https://search.brave.com/search?q=news&tf=pw` |
| `tf=pm` | Этот месяц | `https://search.brave.com/search?q=tech&tf=pm` |
| `tf=py` | Этот год | `https://search.brave.com/search?q=AI&tf=py` |
| `safesearch=strict` | Строгий безопасный поиск | `https://search.brave.com/search?q=test&safesearch=strict` |
| `source=web` | Веб-поиск | По умолчанию |
| `source=news` | Поиск новостей | `https://search.brave.com/search?q=tech&source=news` |
| `source=images` | Поиск изображений | `https://search.brave.com/search?q=cat&source=images` |
| `source=videos` | Поиск видео | `https://search.brave.com/search?q=music&source=videos` |

### 3.3 Brave Search Goggles (пользовательские фильтры)

Goggles позволяют создавать пользовательские правила поиска:

```
$discard  // Отбросить всё
$boost,site=stackoverflow.com  // Повысить приоритет Stack Overflow
$boost,site=github.com  // Повысить приоритет GitHub
$boost,site=docs.python.org  // Повысить приоритет документации Python
```

### 3.4 Примеры углубленного поиска в Brave Search

```javascript
// 1. Технологические новости за неделю
web_fetch({"url": "https://search.brave.com/search?q=technology&tf=pw&source=news"})

// 2. Развитие ИИ за месяц
web_fetch({"url": "https://search.brave.com/search?q=artificial+intelligence&tf=pm"})

// 3. Поиск изображений
web_fetch({"url": "https://search.brave.com/search?q=machine+learning&source=images"})

// 4. Видеоуроки
web_fetch({"url": "https://search.brave.com/search?q=python+tutorial&source=videos"})

// 5. Поиск с использованием собственного индекса
web_fetch({"url": "https://search.brave.com/search?q=privacy+tools"})
```

---

## 📊 WolframAlpha — вычислительный поиск знаний

### 4.1 Типы данных WolframAlpha

| Тип | Пример запроса | URL |
|-----|---------------|-----|
| **Математические вычисления** | `integrate x^2 dx` | `https://www.wolframalpha.com/input?i=integrate+x%5E2+dx` |
| **Конвертация единиц** | `100 miles to km` | `https://www.wolframalpha.com/input?i=100+miles+to+km` |
| **Конвертация валют** | `100 USD to CNY` | `https://www.wolframalpha.com/input?i=100+USD+to+CNY` |
| **Данные по акциям** | `AAPL stock` | `https://www.wolframalpha.com/input?i=AAPL+stock` |
| **Прогноз погоды** | `weather in Beijing` | `https://www.wolframalpha.com/input?i=weather+in+Beijing` |
| **Данные о населении** | `population of China` | `https://www.wolframalpha.com/input?i=population+of+China` |
| **Химические элементы** | `properties of gold` | `https://www.wolframalpha.com/input?i=properties+of+gold` |
| **Пищевая ценность** | `nutrition of apple` | `https://www.wolframalpha.com/input?i=nutrition+of+apple` |
| **Расчет дат** | `days between Jan 1 2020 and Dec 31 2024` | Расчет интервала между датами |
| **Конвертация часовых поясов** | `10am Beijing to New York` | Конвертация часовых поясов |
| **IP-адрес** | `8.8.8.8` | Запрос информации об IP |
| **Штрихкод** | `scan barcode 123456789` | Информация о штрихкоде |
| **Авиарейс** | `flight AA123` | Информация о рейсе |

### 4.2 Примеры углубленного поиска в WolframAlpha

```javascript
// 1. Вычисление интеграла
web_fetch({"url": "https://www.wolframalpha.com/input?i=integrate+sin%28x%29+from+0+to+pi"})

// 2. Решение уравнения
web_fetch({"url": "https://www.wolframalpha.com/input?i=solve+x%5E2-5x%2B6%3D0"})

// 3. Актуальный курс валют
web_fetch({"url": "https://www.wolframalpha.com/input?i=100+USD+to+CNY"})

// 4. Данные по акциям в реальном времени
web_fetch({"url": "https://www.wolframalpha.com/input?i=Apple+stock+price"})

// 5. Погода в городе
web_fetch({"url": "https://www.wolframalpha.com/input?i=weather+in+Shanghai+tomorrow"})

// 6. Статистика по странам
web_fetch({"url": "https://www.wolframalpha.com/input?i=GDP+of+China+vs+USA"})

// 7. Химические расчеты
web_fetch({"url": "https://www.wolframalpha.com/input?i=molar+mass+of+H2SO4"})

// 8. Физические константы
web_fetch({"url": "https://www.wolframalpha.com/input?i=speed+of+light"})

// 9. Информация о питательности
web_fetch({"url": "https://www.wolframalpha.com/input?i=calories+in+banana"})

// 10. Исторические даты
web_fetch({"url": "https://www.wolframalpha.com/input?i=events+on+July+20+1969"})
```

---

## 🔧 Поиск с защитой конфиденциальности — Startpage

### 5.1 Особые возможности Startpage

| Функция | Описание | URL |
|---------|----------|-----|
| **Прокси-просмотр** | Анонимный доступ к результатам поиска | Кнопка «Анонимный просмотр» |
| **Без отслеживания** | История поиска не сохраняется | Включено по умолчанию |
| **Серверы в ЕС** | Защита законами ЕС о конфиденциальности | Данные хранятся в Европе |
| **Прокси для изображений** | Загрузка изображений через прокси | Скрытие IP-адреса |

### 5.2 Параметры Startpage

| Параметр | Функция | Пример |
|----------|---------|--------|
| `cat=web` | Веб-поиск | По умолчанию |
| `cat=images` | Поиск изображений | `...&cat=images` |
| `cat=video` | Поиск видео | `...&cat=video` |
| `cat=news` | Поиск новостей | `...&cat=news` |
| `language=english` | Результаты на английском | `...&language=english` |
| `time=day` | За последние 24 часа | `...&time=day` |
| `time=week` | За последнюю неделю | `...&time=week` |
| `time=month` | За последний месяц | `...&time=month` |
| `time=year` | За последний год | `...&time=year` |
| `nj=0` | Отключение семейного фильтра | `...&nj=0` |

### 5.3 Примеры углубленного поиска в Startpage

```javascript
// 1. Поиск с защитой конфиденциальности
web_fetch({"url": "https://www.startpage.com/sp/search?query=privacy+tools"})

// 2. Поиск изображений с конфиденциальностью
web_fetch({"url": "https://www.startpage.com/sp/search?query=nature&cat=images"})

// 3. Новости за неделю (режим конфиденциальности)
web_fetch({"url": "https://www.startpage.com/sp/search?query=tech+news&time=week&cat=news"})

// 4. Поиск результатов на английском языке
web_fetch({"url": "https://www.startpage.com/sp/search?query=machine+learning&language=english"})
```

---

## 🌍 Комплексная стратегия поиска

### 6.1 Выбор поисковой системы по цели поиска

| Цель поиска | Основная система | Альтернатива | Причина |
|-------------|-----------------|--------------|---------|
| **Научные исследования** | Google Scholar | Google, Brave | Индексация академических ресурсов |
| **Разработка и программирование** | Google | GitHub (DuckDuckGo bang) | Полнота технической документации |
| **Защита конфиденциальности** | DuckDuckGo | Startpage, Brave | Отсутствие отслеживания |
| **Новости в реальном времени** | Brave News | Google News | Независимый новостной индекс |
| **Вычисления и знания** | WolframAlpha | Google | Структурированные данные |
| **Контент на китайском языке** | Google HK | Bing | Хорошая оптимизация для китайского |
| **Европейская перспектива** | Qwant | Startpage | Соответствие требованиям ЕС |
| **Экологическая поддержка** | Ecosia | DuckDuckGo | Посадка деревьев за поиск |
| **Без фильтрации** | Brave | Startpage | Непредвзятые результаты |

### 6.2 Перекрестная проверка через несколько систем

```javascript
// Стратегия: поиск одного ключевого слова в нескольких системах, сравнение результатов
const keyword = "climate change 2024";

// Получение различных точек зрения
const searches = [
  { engine: "Google", url: `https://www.google.com/search?q=${keyword}&tbs=qdr:m` },
  { engine: "Brave", url: `https://search.brave.com/search?q=${keyword}&tf=pm` },
  { engine: "DuckDuckGo", url: `https://duckduckgo.com/html/?q=${keyword}` },
  { engine: "Ecosia", url: `https://www.ecosia.org/search?q=${keyword}` }
];

// Анализ различий в результатах разных систем
```

### 6.3 Стратегия поиска с учетом актуальности

| Требование к актуальности | Выбор системы | Настройка параметров |
|--------------------------|---------------|---------------------|
| **В реальном времени (часы)** | Google News, Brave News | `tbs=qdr:h`, `tf=pw` |
| **Недавние (дни)** | Google, Brave | `tbs=qdr:d`, `time=day` |
| **За неделю** | Все системы | `tbs=qdr:w`, `tf=pw` |
| **За месяц** | Все системы | `tbs=qdr:m`, `tf=pm` |
| **Архивные** | Google Scholar | Академические архивы |

### 6.4 Углубленный поиск по специализированным областям

#### Разработка и технологии

```javascript
// Поиск проектов на GitHub
web_fetch({"url": "https://duckduckgo.com/html/?q=!gh+tensorflow+stars:%3E1000"})

// Вопросы на Stack Overflow
web_fetch({"url": "https://duckduckgo.com/html/?q=!so+python+memory+leak"})

// Документация MDN
web_fetch({"url": "https://duckduckgo.com/html/?q=!mdn+javascript+async+await"})

// Пакеты PyPI
web_fetch({"url": "https://duckduckgo.com/html/?q=!pypi+requests"})

// Пакеты npm
web_fetch({"url": "https://duckduckgo.com/html/?q=!npm+express"})
```

#### Научные исследования

```javascript
// Научные статьи в Google Scholar
web_fetch({"url": "https://scholar.google.com/scholar?q=deep+learning+2024"})

// Поиск PDF-статей
web_fetch({"url": "https://www.google.com/search?q=machine+learning+filetype:pdf+2024"})

// Статьи на arXiv
web_fetch({"url": "https://duckduckgo.com/html/?q=site:arxiv.org+quantum+computing"})
```

#### Финансы и инвестиции

```javascript
// Данные по акциям в реальном времени
web_fetch({"url": "https://www.wolframalpha.com/input?i=AAPL+stock"})

// Конвертация валют
web_fetch({"url": "https://www.wolframalpha.com/input?i=EUR+to+USD"})

// Поиск финансовых отчетов в PDF
web_fetch({"url": "https://www.google.com/search?q=Apple+Q4+2024+earnings+filetype:pdf"})
```

#### Новости и текущие события

```javascript
// Новости Google
web_fetch({"url": "https://www.google.com/search?q=breaking+news&tbm=nws&tbs=qdr:h"})

// Новости Brave
web_fetch({"url": "https://search.brave.com/search?q=world+news&source=news"})

// Новости DuckDuckGo
web_fetch({"url": "https://duckduckgo.com/html/?q=tech+news&ia=news"})
```

---

## 🛠️ Сводка продвинутых приемов поиска

### Функция URL-кодирования

```javascript
// URL-кодирование ключевых слов
function encodeKeyword(keyword) {
  return encodeURIComponent(keyword);
}

// Пример
const keyword = "machine learning";
const encoded = encodeKeyword(keyword); // "machine%20learning"
```

### Шаблон массового поиска

```javascript
// Функция массового поиска в нескольких системах
function generateSearchUrls(keyword) {
  const encoded = encodeURIComponent(keyword);
  return {
    google: `https://www.google.com/search?q=${encoded}`,
    google_hk: `https://www.google.com.hk/search?q=${encoded}`,
    duckduckgo: `https://duckduckgo.com/html/?q=${encoded}`,
    brave: `https://search.brave.com/search?q=${encoded}`,
    startpage: `https://www.startpage.com/sp/search?query=${encoded}`,
    bing_intl: `https://cn.bing.com/search?q=${encoded}&ensearch=1`,
    yahoo: `https://search.yahoo.com/search?p=${encoded}`,
    ecosia: `https://www.ecosia.org/search?q=${encoded}`,
    qwant: `https://www.qwant.com/?q=${encoded}`
  };
}

// Пример использования
const urls = generateSearchUrls("artificial intelligence");
```

### Функция быстрой фильтрации по времени

```javascript
// Генерация URL для поиска Google с фильтрацией по времени
function googleTimeSearch(keyword, period) {
  const periods = {
    hour: 'qdr:h',
    day: 'qdr:d',
    week: 'qdr:w',
    month: 'qdr:m',
    year: 'qdr:y'
  };
  return `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbs=${periods[period]}`;
}

// Пример использования
const recentNews = googleTimeSearch("AI breakthrough", "week");
```

---

## 📝 Полная коллекция примеров поиска

```javascript
// ==================== Разработка и технологии ====================

// 1. Поиск Python-проектов с высоким рейтингом на GitHub
web_fetch({"url": "https://www.google.com/search?q=site:github.com+python+stars:%3E1000"})

// 2. Лучшие ответы на Stack Overflow
web_fetch({"url": "https://duckduckgo.com/html/?q=!so+best+way+to+learn+python"})

// 3. Запрос документации MDN
web_fetch({"url": "https://duckduckgo.com/html/?q=!mdn+promises"})

// 4. Поиск пакетов npm
web_fetch({"url": "https://duckduckgo.com/html/?q=!npm+axios"})

// ==================== Научные исследования ====================

// 5. Статьи в Google Scholar
web_fetch({"url": "https://scholar.google.com/scholar?q=transformer+architecture"})

// 6. Поиск PDF-статей
web_fetch({"url": "https://www.google.com/search?q=attention+is+all+you+need+filetype:pdf"})

// 7. Последние статьи на arXiv
web_fetch({"url": "https://duckduckgo.com/html/?q=site:arxiv.org+abs+quantum"})

// ==================== Новости и текущие события ====================

// 8. Последние новости Google (за 1 час)
web_fetch({"url": "https://www.google.com/search?q=breaking+news&tbs=qdr:h&tbm=nws"})

// 9. Технологические новости Brave за неделю
web_fetch({"url": "https://search.brave.com/search?q=technology&tf=pw&source=news"})

// 10. Новости DuckDuckGo
web_fetch({"url": "https://duckduckgo.com/html/?q=world+news&ia=news"})

// ==================== Финансы и инвестиции ====================

// 11. Данные по акциям в реальном времени
web_fetch({"url": "https://www.wolframalpha.com/input?i=Tesla+stock"})

// 12. Курсы валют
web_fetch({"url": "https://www.wolframalpha.com/input?i=1+BTC+to+USD"})

// 13. Финансовые отчеты компаний в PDF
web_fetch({"url": "https://www.google.com/search?q=Microsoft+annual+report+2024+filetype:pdf"})

// ==================== Вычисления и знания ====================

// 14. Математические вычисления
web_fetch({"url": "https://www.wolframalpha.com/input?i=derivative+of+x%5E3+sin%28x%29"})

// 15. Конвертация единиц
web_fetch({"url": "https://www.wolframalpha.com/input?i=convert+100+miles+to+kilometers"})

// 16. Информация о питательности
web_fetch({"url": "https://www.wolframalpha.com/input?i=protein+in+chicken+breast"})

// ==================== Поиск с защитой конфиденциальности ====================

// 17. Конфиденциальный поиск DuckDuckGo
web_fetch({"url": "https://duckduckgo.com/html/?q=privacy+tools"})

// 18. Анонимный поиск Startpage
web_fetch({"url": "https://www.startpage.com/sp/search?query=secure+messaging"})

// 19. Поиск Brave без отслеживания
web_fetch({"url": "https://search.brave.com/search?q=encryption+software"})

// ==================== Комбинированный расширенный поиск ====================

// 20. Точный поиск Google с несколькими условиями
web_fetch({"url": "https://www.google.com/search?q=%22machine+learning%22+site:github.com+filetype:pdf+2024"})

// 21. Поиск с исключением определенных сайтов
web_fetch({"url": "https://www.google.com/search?q=python+tutorial+-wikipedia+-w3schools"})

// 22. Поиск по ценовому диапазону
web_fetch({"url": "https://www.google.com/search?q=laptop+%24800..%241200+best+review"})

// 23. Быстрый переход через Bangs
web_fetch({"url": "https://duckduckgo.com/html/?q=!g+site:medium.com+python"})

// 24. Поиск изображений (Google)
web_fetch({"url": "https://www.google.com/search?q=beautiful+landscape&tbm=isch"})

// 25. Поиск академических цитирований
web_fetch({"url": "https://scholar.google.com/scholar?q=author:%22Geoffrey+Hinton%22"})
```

---

## 🔐 Лучшие практики защиты конфиденциальности

### Уровни конфиденциальности поисковых систем

| Система | Уровень отслеживания | Хранение данных | Шифрование | Рекомендуемый сценарий |
|---------|---------------------|-----------------|------------|----------------------|
| **DuckDuckGo** | Без отслеживания | Не хранит | Да | Повседневный конфиденциальный поиск |
| **Startpage** | Без отслеживания | Не хранит | Да | Результаты Google с защитой конфиденциальности |
| **Brave** | Без отслеживания | Не хранит | Да | Собственный индекс, непредвзятость |
| **Qwant** | Без отслеживания | Не хранит | Да | Соответствие требованиям ЕС |
| **Google** | Высокий уровень | Долгосрочное хранение | Да | Персонализированные результаты |
| **Bing** | Средний уровень | Долгосрочное хранение | Да | Интеграция с сервисами Microsoft |

### Рекомендации по конфиденциальному поиску

1. **Повседневное использование**: DuckDuckGo или Brave
2. **Нужны результаты Google, но с защитой конфиденциальности**: Startpage
3. **Научные исследования**: Google Scholar (меньше отслеживания для академических целей)
4. **Чувствительные запросы**: Браузер Tor + onion-сервис DuckDuckGo
5. **Синхронизация между устройствами**: Избегайте входа в аккаунты поисковых систем

---

## 📚 Справочные материалы

- [Полный список операторов поиска Google](https://support.google.com/websearch/answer/...)
- [Полный список DuckDuckGo Bangs](https://duckduckgo.com/bang)
- [Документация Brave Search](https://search.brave.com/help/...)
- [Примеры WolframAlpha](https://www.wolframalpha.com/examples/)
