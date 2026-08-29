# Step 2: Site Generation

## Purpose

Generate the complete `docs/index.html` — a self-contained static page with all transcript content, Tailwind CSS via CDN, SEO meta, and responsive layout.

## Protocol

### 1. Create docs/ Directory

```bash
mkdir -p docs/static
```

### 2. Generate index.html

The HTML file follows this structure:

```html
<!DOCTYPE html>
<html lang="{language}" class="scroll-smooth">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{TITLE}</title>
  <meta name="description" content="{DESCRIPTION_160_CHARS}" />
  <meta name="author" content="{AUTHOR}" />

  <!-- Open Graph -->
  <meta property="og:title" content="{TITLE}" />
  <meta property="og:description" content="{DESCRIPTION}" />
  <meta property="og:type" content="{article|video.other}" />
  <meta property="og:url" content="https://{username}.github.io/{repo}/" />
  <!-- If YouTube: -->
  <meta property="og:image" content="https://img.youtube.com/vi/{VIDEO_ID}/maxresdefault.jpg" />
  <meta property="og:video" content="https://www.youtube.com/embed/{VIDEO_ID}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{TITLE}" />
  <meta name="twitter:description" content="{DESCRIPTION}" />

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "{TITLE}",
    "author": { "@type": "Person", "name": "{AUTHOR}" },
    "datePublished": "{DATE}",
    "description": "{DESCRIPTION}",
    "wordCount": {WORD_COUNT}
  }
  </script>

  <!-- If YouTube, add VideoObject: -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": "{TITLE}",
    "description": "{DESCRIPTION}",
    "thumbnailUrl": "https://img.youtube.com/vi/{VIDEO_ID}/maxresdefault.jpg",
    "uploadDate": "{PUBLISH_DATE}",
    "contentUrl": "{YOUTUBE_URL}",
    "embedUrl": "https://www.youtube.com/embed/{VIDEO_ID}"
  }
  </script>

  <!-- Tailwind CSS via CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
                       400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
                       800: '#3730a3', 900: '#312e81', 950: '#1e1b4b' }
          }
        }
      }
    }
  </script>

  <!-- Font Awesome for icons (with SRI hash) -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
    integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="
    crossorigin="anonymous" referrerpolicy="no-referrer" />

  <link rel="stylesheet" href="static/style.css" />
</head>
```

### 3. Body Structure

```html
<body class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">

  <!-- Reading Progress Bar -->
  <div id="progress-bar" class="fixed top-0 left-0 h-1 bg-primary-500 z-50 transition-all duration-150" style="width: 0%"></div>

  <!-- Skip Navigation Link -->
  <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-500 focus:text-white focus:rounded-lg">
    Skip to content
  </a>

  <!-- Header -->
  <header class="sticky top-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700" role="banner">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <!-- Mobile menu button -->
        <button id="menu-toggle" class="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          <i class="fas fa-bars text-lg"></i>
        </button>
        <div>
          <h1 class="text-lg font-bold text-primary-700 dark:text-primary-400 line-clamp-1">{TITLE}</h1>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            <i class="far fa-clock"></i> {READ_TIME} {min_label} &middot;
            <i class="far fa-file-alt"></i> {WORD_COUNT} {words_label} &middot;
            {SECTION_COUNT} {sections_label}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button id="search-btn" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Ctrl+K">
          <i class="fas fa-search"></i>
        </button>
        <button id="theme-toggle" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          <i class="fas fa-moon" id="theme-icon"></i>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Layout -->
  <div class="max-w-7xl mx-auto flex">

    <!-- Sidebar TOC (desktop) / Slide-out (mobile) -->
    <nav id="sidebar" aria-label="Table of Contents" class="fixed lg:sticky top-16 left-0 h-[calc(100vh-4rem)] w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto transform -translate-x-full lg:translate-x-0 transition-transform duration-300 z-30 no-print">
      <div class="p-4">
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          {toc_label}
        </h2>
        <ul class="space-y-1">
          <!-- For each section: -->
          <li>
            <a href="#section-{id}" class="toc-link block px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors" data-section="section-{id}">
              {section_title}
            </a>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Main Content -->
    <main id="main-content" class="flex-1 min-w-0 px-4 py-8 lg:px-8" role="main">

      <!-- YouTube Embed (if video URL provided) -->
      <div class="mb-8 rounded-xl overflow-hidden shadow-lg aspect-video max-w-3xl mx-auto">
        <iframe id="yt-player" src="https://www.youtube.com/embed/{VIDEO_ID}?enablejsapi=1&origin=https://{username}.github.io"
          class="w-full h-full" frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen></iframe>
      </div>

      <!-- Transcript Sections -->
      <!-- For each section: -->
      <section id="section-{id}" class="mb-12 scroll-mt-20">
        <div class="flex items-start justify-between mb-4">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
            <!-- If timestamp: -->
            <a href="#{id}" role="button" data-seek="{seconds}" class="timestamp-link text-primary-500 hover:text-primary-600 text-sm font-mono mr-2">{timestamp}</a>
            {section_title}
          </h2>
          <button data-copy="section-{id}" class="copy-btn flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 no-print" title="{copy_label}">
            <i class="far fa-copy"></i>
          </button>
        </div>
        <!-- If speaker identified: -->
        <div class="mb-3 flex items-center gap-2">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200">
            {speaker_name} &middot; {speaker_role}
          </span>
        </div>
        <div class="prose prose-lg dark:prose-invert max-w-none">
          <!-- Transcript content paragraphs as <p> tags -->
          <p>{paragraph_1}</p>
          <p>{paragraph_2}</p>
        </div>
      </section>

      <!-- Footer -->
      <footer class="border-t border-gray-200 dark:border-gray-700 mt-16 pt-8 pb-12 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>{AUTHOR} &middot; {DATE}</p>
        <!-- If YouTube: -->
        <p class="mt-2">
          <a href="{YOUTUBE_URL}" target="_blank" class="text-primary-500 hover:text-primary-600">
            <i class="fab fa-youtube"></i> {watch_video_label}
          </a>
        </p>
      </footer>
    </main>
  </div>

  <!-- Search Modal -->
  <div id="search-modal" class="hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true" aria-label="Search">
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
      <div class="p-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-3">
          <i class="fas fa-search text-gray-400"></i>
          <input id="search-input" type="text" placeholder="{search_placeholder}" class="flex-1 bg-transparent outline-none text-lg" autocomplete="off" />
          <kbd class="hidden sm:inline-flex px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded">{esc_label}</kbd>
        </div>
      </div>
      <div id="search-results" class="max-h-[50vh] overflow-y-auto p-2">
        <!-- Results populated by app.js -->
      </div>
    </div>
  </div>

  <!-- Back to Top Button -->
  <button id="back-to-top" class="hidden fixed bottom-8 right-8 p-3 rounded-full bg-primary-500 text-white shadow-lg hover:bg-primary-600 transition-all duration-300 hover:scale-110 z-30 no-print">
    <i class="fas fa-arrow-up"></i>
  </button>

  <script src="static/app.js"></script>
</body>
</html>
```

### 4. Content Rendering Rules

When rendering transcript content into HTML:
- Each paragraph becomes a `<p>` tag inside `.prose`
- `**bold**` markers → `<strong>bold</strong>`
- `*italic*` → `<em>italic</em>`
- Code backticks → `<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm">code</code>`
- URLs → `<a href="url" target="_blank" class="text-primary-500 hover:underline">url</a>`
- Escape HTML entities in transcript text (`<`, `>`, `&`, `"`)
- Newlines within a section become paragraph breaks

### 5. Generate style.css

```css
/* docs/static/style.css */
h1 { font-family: Arial, Helvetica, sans-serif; }

@media print {
  .no-print { display: none !important; }
  body { font-size: 12pt; color: black !important; background: white !important; }
  section { break-inside: avoid; page-break-inside: avoid; }
  h2 { break-after: avoid; }
  a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; color: gray; }
  .prose { max-width: 100% !important; }
  #sidebar, #progress-bar, #back-to-top, #search-modal, .copy-btn { display: none !important; }
}
```

### 6. Language-Specific UI Strings

| Key | Russian (ru) | English (en) |
|-----|-------------|-------------|
| toc_label | Содержание | Table of Contents |
| search_placeholder | Поиск по транскрипту... | Search transcript... |
| esc_label | Esc | Esc |
| copy_label | Скопировать | Copy |
| copied_label | Скопировано! | Copied! |
| no_results | Ничего не найдено | No results found |
| watch_video_label | Смотреть видео | Watch video |
| min_label | мин чтения | min read |
| words_label | слов | words |
| sections_label | разделов | sections |
| back_to_top | Наверх | Back to top |

## Output

Files created:
- `docs/index.html` (~50-100 KB depending on transcript length)
- `docs/static/style.css` (~500 B)

## Checkpoint

```
Step 2/5: Site Generation Complete
Files: docs/index.html ({N} KB), docs/static/style.css
Sections: {N} rendered
SEO: OG + Twitter + JSON-LD configured
YouTube: {embedded | not included}

"ok" to continue | "[feedback]" to adjust
```
