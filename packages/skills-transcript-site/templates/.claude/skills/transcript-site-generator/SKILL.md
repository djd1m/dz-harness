---
name: transcript-site-generator
description: >
  Generate a modern, interactive, mobile-friendly, SEO-optimized static website from a
  transcript or YouTube video link, ready for GitHub Pages deployment with zero build step.
  Triggers on "generate transcript site from [content]", "create interactive transcript
  [topic]", "build transcript website from YouTube [url]".
trust_tier: 2
---

# transcript-site-generator — Interactive Transcript Site Generator

<!-- Trust Tier: 2 — Validated | BTO Layer 2 Score: 7.82/10 | Promoted: 2026-03-05 -->

> Generate a modern, interactive, mobile-friendly, SEO-optimized static website from a transcript or YouTube video link, ready for GitHub Pages deployment. Zero build step required.

## When To Activate

Trigger on:
- "generate transcript site from [content]"
- "create interactive transcript [topic]"
- "build transcript website from YouTube [url]"
- "сгенерируй сайт из транскрипта"
- "сделай сайт из видео [url]"
- `/transcript-site [content or YouTube URL]`

## Overview

This skill transforms text transcripts, content, or YouTube video links into production-ready interactive websites. The **default output is a pure static site** (single HTML + JS file) that deploys to GitHub Pages with zero build step — no React, no Vite, no npm install needed.

### Features

- **Interactive transcript** with section navigation, scroll-spy TOC, full-text search (Ctrl+K)
- **YouTube embed** with clickable timestamps for video synchronization (if URL provided)
- **Dark/Light mode** toggle with localStorage persistence
- **Reading progress bar** and back-to-top button
- **Copy-quote** buttons per section (copies section text to clipboard)
- **Reading statistics** (word count, estimated reading time, section count)
- **SEO optimization** — Open Graph, Twitter Cards, JSON-LD (VideoObject/Article)
- **Print-friendly** CSS media queries
- **GitHub Pages** deployment via `docs/` folder (zero build) or GitHub Actions
- **Mobile-friendly** — responsive layout, hamburger menu, 44px touch targets
- **Speaker labels** — automatic speaker detection and visual differentiation

## Architecture

```
.claude/skills/transcript-site-generator/
├── SKILL.md                           <- This file (orchestrator)
├── modules/
│   ├── 00-input-analysis.md           <- Step 0: Detect input type, extract transcript
│   ├── 01-content-parsing.md          <- Step 1: Split into sections, extract timestamps
│   ├── 02-site-generation.md          <- Step 2: Generate index.html with all content
│   ├── 03-interactivity.md            <- Step 3: Generate app.js (search, TOC, dark mode)
│   ├── 04-deploy.md                   <- Step 4: GitHub Pages config + Actions workflow
│   └── 05-verification.md             <- Step 5: Validate output, open in browser
├── references/
│   ├── tech-stack.md                  <- Stack: Tailwind CDN, vanilla JS, static HTML
│   ├── data-schemas.md                <- Section data structure, metadata schema
│   └── component-catalog.md           <- HTML sections and JS modules catalog
└── examples/
    ├── sample-transcript-site.md      <- Example: YouTube + Russian podcast
    └── sample-text-only-site.md       <- Example: text-only, English, no YouTube
```

## Pipeline

```
Step 0          Step 1           Step 2           Step 3
INPUT      ->  PARSE       ->  GENERATE     ->  INTERACTIVITY
(text/URL/     (split into     (index.html       (app.js:
 yt-dlp)        sections +      with Tailwind     search, TOC,
                timestamps)     CDN + content)    dark mode)

     |
     v
Step 4          Step 5
DEPLOY     ->  VERIFY
(docs/ +        (file check
 GH Actions     + open)
 workflow)
```

## Input Requirements

The skill accepts one of:
1. **Text transcript** — pasted directly or as a file path
2. **YouTube URL** — extracts transcript via `yt-dlp --write-auto-sub --sub-lang ru,en --skip-download`
3. **Both** — YouTube URL for embed + custom/edited transcript text

Minimum: enough content for 3 sections. No maximum (long transcripts benefit most from navigation).

### YouTube Transcript Extraction

When a YouTube URL is provided:
```bash
# Check yt-dlp availability
which yt-dlp || pip install yt-dlp

# Extract auto-generated subtitles (prefer manual, fallback to auto)
yt-dlp --write-sub --sub-lang ru,en --skip-download --sub-format vtt -o "/tmp/transcript" "<URL>" 2>/dev/null \
  || yt-dlp --write-auto-sub --sub-lang ru,en --skip-download --sub-format vtt -o "/tmp/transcript" "<URL>"

# Extract video metadata
yt-dlp --print title --print channel --print duration --skip-download "<URL>"
```

If `yt-dlp` is not installed:
```
yt-dlp not found. Install with: pip install yt-dlp
Alternatively, paste the transcript text directly.
```

## Output

A **pure static site** in the `docs/` directory — zero build step, deploys directly via GitHub Pages:

```
<project-root>/
├── docs/                             <- GitHub Pages source
│   ├── index.html                    (99KB+ single-file: HTML + inline Tailwind + SEO)
│   └── static/
│       ├── app.js                    (search, TOC scroll-spy, dark mode, progress bar)
│       └── style.css                 (minimal overrides)
├── .github/workflows/deploy.yml      (GitHub Pages deployment workflow)
└── README.md                         (project description + link to live site)
```

### index.html Structure

The HTML file is self-contained with:
- **Tailwind CSS via CDN** (`<script src="https://cdn.tailwindcss.com">`) with dark mode config
- **Font Awesome via CDN** for icons (moon/sun, search, copy, hamburger)
- **Full SEO head**: Open Graph, Twitter Cards, JSON-LD structured data
- **Semantic HTML**: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<footer>`
- **All transcript content** rendered as HTML sections with anchor IDs
- **Responsive layout**: fixed sidebar TOC (desktop) + hamburger menu (mobile)
- **YouTube embed** (if video URL provided): responsive iframe with aspect-ratio container

### app.js Features

Vanilla JavaScript (no frameworks) implementing:
- **Full-text search** — Ctrl+K modal, 300ms debounce, highlighted results with context
- **TOC scroll-spy** — IntersectionObserver highlights the active section in sidebar
- **Dark/Light mode** — toggle with localStorage persistence, icon switch (moon/sun)
- **Reading progress bar** — requestAnimationFrame-based scroll tracking
- **Back-to-top button** — appears after 500px scroll
- **Copy-quote** — per-section copy button with "Copied!" feedback
- **Mobile navigation** — hamburger toggle with slide-out sidebar
- **Keyboard shortcuts** — Ctrl/Cmd+K (search), Escape (close modal)
- **Timestamp links** — clickable timestamps that seek YouTube player (if embedded)

## Execution Protocol

### Step 0: Input Analysis
```
Read: modules/00-input-analysis.md
```
- Detect input type (text / YouTube URL / both)
- If YouTube URL: extract transcript via yt-dlp, get video metadata
- If text: accept as-is
- Detect language (Russian / English)
- **Output:** Raw transcript text + optional video metadata + language

### Step 1: Content Parsing
```
Read: modules/01-content-parsing.md
```
- Split transcript into logical sections (by topic shifts, speaker changes, or markers)
- Extract timestamps if present (from VTT or inline `[HH:MM:SS]`)
- Generate section titles from content
- Detect speakers if multi-speaker transcript
- Calculate word counts and reading time
- **Output:** Structured section list with titles, content, timestamps, speakers

### Step 2: Site Generation
```
Read: modules/02-site-generation.md
Read: references/data-schemas.md
```
- Generate `docs/index.html` — complete self-contained page:
  - Tailwind CSS + Font Awesome via CDN
  - Full SEO meta tags (OG, Twitter, JSON-LD)
  - Header with title, stats, dark mode toggle, search button
  - Sidebar TOC with all section links
  - YouTube embed (if video URL provided)
  - All transcript sections as HTML with anchor IDs
  - Footer with author credits and source link
- Generate `docs/static/style.css` — minimal CSS overrides
- **Output:** Complete HTML + CSS files

### Step 3: Interactivity
```
Read: modules/03-interactivity.md
Read: references/component-catalog.md
```
- Generate `docs/static/app.js` — vanilla JS:
  - Search modal with highlighting and context snippets
  - TOC scroll-spy (IntersectionObserver)
  - Dark mode toggle with localStorage
  - Reading progress bar
  - Back-to-top button
  - Copy-quote buttons
  - Mobile hamburger menu
  - Keyboard shortcuts
  - YouTube timestamp sync (if video embedded)
- **Output:** Complete JS file

### Step 4: Deployment
```
Read: modules/04-deploy.md
```
- Create `.github/workflows/deploy.yml` for GitHub Pages from `docs/`
- Create or update `README.md` with project description and live site link
- Configure GitHub Pages source as `docs/` on `main` branch
- **Output:** Deploy config + README

### Step 5: Verification
```
Read: modules/05-verification.md
```
- Verify `docs/index.html` exists and has valid HTML structure
- Verify `docs/static/app.js` exists and has no syntax errors
- Check all section IDs are unique
- Check SEO meta tags are present
- Verify mobile responsiveness classes
- Check dark mode CSS works
- **Output:** Verification report

## Customization Points

| Parameter | Default | How to specify | Description |
|-----------|---------|---------------|-------------|
| Language | auto-detect | "language: en" in prompt | UI language (ru/en) |
| Theme color | Indigo | "use green theme" in prompt | Primary Tailwind color palette |
| YouTube URL | none | Include URL in input | Optional video embed with timestamps |
| Author | from transcript/video | "author: John Doe" in prompt | Attribution in footer |
| Show timestamps | auto (if available) | "hide timestamps" in prompt | Toggle timestamp display |
| Show stats | yes | "no stats" in prompt | Word count, reading time in header |
| Show copy buttons | yes | "no copy buttons" in prompt | Copy-quote per section |
| Output dir | docs/ | "output to site/" in prompt | Static site output directory |
| Deploy method | docs/ folder | "use GitHub Actions" in prompt | `docs/` (zero build) or GitHub Actions |

Customization is passed via natural language in the user's prompt. The agent parses these from the initial request during Step 0. If the output directory is not `docs/`, update the deploy workflow `path` accordingly.

### Conflict Detection

Before writing to the output directory, check if it already exists:
- If `docs/` has existing content, warn: `"docs/ already exists. Overwrite? (yes/no/use different dir)"`
- Never silently overwrite existing files

## Large Transcript Strategy

For transcripts exceeding 30,000 words (~150 KB HTML output), the generated `index.html` may exceed single-file output limits. In this case:

1. **Generate the HTML shell first** — `<head>`, header, sidebar TOC, search modal, footer (without section content)
2. **Generate transcript sections in batches** — 5-10 sections per Write operation, appending to the HTML file
3. **Close the HTML** — add closing `</main>`, `</div>`, `</body>`, `</html>` tags
4. **Verify integrity** — check that `</html>` appears exactly once and all section IDs are present

This chunked approach ensures complete output regardless of transcript length.

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Using React/Vite for simple transcript | Unnecessary complexity | Use static HTML + vanilla JS (default) |
| Transcript split into too many files | Multiple HTML pages | Single index.html with anchor navigation |
| Missing Tailwind CDN script | No styling | Always include `<script src="https://cdn.tailwindcss.com">` |
| Missing dark mode config in Tailwind | Dark mode broken | Add `tailwind.config = { darkMode: 'class' }` |
| Too few sections (<3) | Not enough for navigation | Merge more content or split deeper |
| Giant monolithic section | Section > 3000 words | Split into sub-sections |
| No search results feedback | Empty search shows nothing | Show "no results" message |
| Missing print styles | Page breaks mid-section | Add `@media print` rules |
| No mobile TOC | Desktop-only sidebar | Add hamburger menu for screens < 768px |
| YouTube embed not responsive | Fixed-width iframe | Use padding-bottom aspect-ratio trick |
| Missing fallback for yt-dlp | Script crashes if not installed | Check availability, offer text paste |
| No Font Awesome CDN | Missing icons | Include FA CDN link in `<head>` |
| Content in separate JS files | Unnecessary indirection for static site | Inline content directly in HTML |
| Using npm/build step | Over-engineering for static content | Deploy `docs/` directly, zero build |

## Dependencies

- **Tech stack:** Pure HTML + Tailwind CSS (CDN) + Vanilla JavaScript
- **External CDNs:** Tailwind CSS, Font Awesome
- **Optional:** yt-dlp (for YouTube transcript extraction)
- **Skills used:** None (standalone skill)
- **Deployment:** GitHub Pages via `docs/` folder (no build step)

## Checkpoint Protocol

After each step, output:
```
Step N/5: [Name] Complete
Artifacts: [list]
"ok" to continue | "[feedback]" to adjust
```
