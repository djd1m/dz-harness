# Example: Podcast Transcript Site

## Input

```
YouTube URL: https://www.youtube.com/watch?v=julbw1JuAz0
Title: "Building Claude Code with Boris Cherny"
Language: Russian
```

## Parsed Sections (Step 1 Output)

```
Section 1: "Введение" (00:00:00) - 342 words
Section 2: "Ранняя карьера: от Pokemon до программирования" (00:02:15) - 890 words
Section 3: "Опыт в Meta: Instagram, Facebook, WhatsApp" (00:08:30) - 1240 words
Section 4: "Приход в Anthropic и первый pull request" (00:15:45) - 780 words
Section 5: "Рождение Claude Code" (00:22:10) - 1450 words
Section 6: "Рабочие паттерны: 20-30 PR в день" (00:32:00) - 950 words
Section 7: "Code Review с AI" (00:38:20) - 670 words
Section 8: "Архитектура и безопасность" (00:43:15) - 1100 words
Section 9: "Культура Anthropic" (00:50:30) - 820 words
Section 10: "Claude как коллега" (00:56:45) - 560 words
Section 11: "Agent Teams и будущее" (01:02:10) - 740 words
Section 12: "Метафора печатного станка" (01:08:30) - 1320 words
Section 13: "Навыки инженера будущего" (01:15:00) - 680 words

Total: 11,542 words, ~58 min read, 2 speakers
```

## Generated File Structure

```
project-root/
├── docs/
│   ├── index.html       (87 KB)
│   └── static/
│       ├── app.js        (11 KB)
│       └── style.css     (0.4 KB)
├── .github/
│   └── workflows/
│       └── deploy.yml
└── README.md
```

## index.html Highlights

### SEO Head

```html
<title>Building Claude Code with Boris Cherny — Транскрипт</title>
<meta name="description" content="Полный русский транскрипт подкаста Pragmatic Engineer с Борисом Черным, создателем Claude Code в Anthropic." />
<meta property="og:type" content="video.other" />
<meta property="og:image" content="https://img.youtube.com/vi/julbw1JuAz0/maxresdefault.jpg" />
```

### JSON-LD

```json
[
  {
    "@type": "Article",
    "headline": "Building Claude Code with Boris Cherny — Транскрипт",
    "wordCount": 11542
  },
  {
    "@type": "VideoObject",
    "name": "Building Claude Code with Boris Cherny",
    "embedUrl": "https://www.youtube.com/embed/julbw1JuAz0"
  }
]
```

### Sample Section HTML

```html
<section id="section-birth-of-claude-code" class="mb-12 scroll-mt-20">
  <div class="flex items-start justify-between mb-4">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
      <a href="#section-birth-of-claude-code" role="button" data-seek="1330"
         class="timestamp-link text-primary-500 hover:text-primary-600 text-sm font-mono mr-2">22:10</a>
      5. Рождение Claude Code
    </h2>
    <button data-copy="section-birth-of-claude-code"
            class="copy-btn flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800
                   text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 no-print"
            aria-label="Скопировать">
      <i class="far fa-copy"></i>
    </button>
  </div>
  <div class="mb-3 flex items-center gap-2">
    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                 bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200">
      Boris Cherny &middot; Guest
    </span>
  </div>
  <div class="prose prose-lg dark:prose-invert max-w-none">
    <p>Когда я пришел в Anthropic, мой первый pull request был написан от руки...</p>
    <p>И тогда я подумал: а что если Claude сможет сам писать код?...</p>
  </div>
</section>
```

### YouTube Embed

```html
<div class="mb-8 rounded-xl overflow-hidden shadow-lg aspect-video max-w-3xl mx-auto">
  <iframe id="yt-player"
    src="https://www.youtube.com/embed/julbw1JuAz0?enablejsapi=1&origin=https://user.github.io"
    class="w-full h-full" frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
  </iframe>
</div>
```

## Stats Displayed in Header

```
⏱ 58 мин чтения · 📄 11 542 слов · 13 разделов
```

## Verification Results

```
File checks: 5/5 passed
HTML structure: 13/13 passed
Content: 6/6 passed
Interactivity: 10/10 passed
Responsive: 6/6 passed
Dark mode: 6/6 passed
SEO: 7/7 passed
Print: 4/4 passed
```
