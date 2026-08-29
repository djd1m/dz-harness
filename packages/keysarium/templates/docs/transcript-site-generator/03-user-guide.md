# User Guide -- @dzhechkov/skills-transcript-site

This guide covers everything you need to use the Transcript Site Generator skill pack for Claude Code. It is intended for anyone who wants to create interactive, searchable transcript websites from text, YouTube videos, or both -- with zero build steps, zero frameworks, and zero infrastructure costs.

---

## Contents

1. [Quick Start (5 minutes)](#1-quick-start-5-minutes)
2. [Input Types](#2-input-types)
3. [The 6-Step Pipeline](#3-the-6-step-pipeline)
4. [Customization Options](#4-customization-options)
5. [YouTube Features](#5-youtube-features)
6. [Search Functionality](#6-search-functionality)
7. [Dark Mode and Visual Features](#7-dark-mode-and-visual-features)
8. [Large Transcript Strategy](#8-large-transcript-strategy)
9. [Common Scenarios](#9-common-scenarios)
10. [Tips and Best Practices](#10-tips-and-best-practices)
11. [FAQ](#11-faq)

---

## 1. Quick Start (5 minutes)

Transcript Site Generator gives you three commands. Each can be used independently or as part of the full pipeline.

```
/transcript-site [source]           -- Full 6-step pipeline: analyze, parse, generate, add interactivity, deploy, verify
/transcript-site-generate [source]  -- Generate HTML only (steps 1-4)
/transcript-site-deploy [path]      -- Deploy configuration only (steps 5-6)
```

### Your first transcript site

The fastest way to see the generator in action is to provide a YouTube URL:

```
/transcript-site https://www.youtube.com/watch?v=YOUR_VIDEO_ID
```

Within 2-5 minutes you will have a complete interactive website in `docs/index.html` with:

- Full transcript text organized into sections
- YouTube video embed with timestamp synchronization
- Search functionality (Ctrl+K)
- Dark mode toggle
- Table of contents with scroll-spy
- Copy-quote buttons
- Reading statistics
- SEO metadata (Open Graph, Twitter Cards, JSON-LD)
- Ready for GitHub Pages deployment

To preview the result:

```bash
open docs/index.html
# or
xdg-open docs/index.html  # Linux
```

### Trigger phrases

You can invoke the pipeline with natural language too. These phrases all trigger the same pipeline:

```
/transcript-site https://youtube.com/watch?v=...
/transcript-site Create a transcript site from this YouTube video: https://...
/transcript-site Generate an interactive transcript page for my podcast episode
/transcript-site Turn this text into a searchable transcript website
```

---

## 2. Input Types

The generator accepts four types of input. It auto-detects the type from the argument.

### 2.1. YouTube URL

```
/transcript-site https://www.youtube.com/watch?v=dQw4w9WgXcQ
/transcript-site https://youtu.be/dQw4w9WgXcQ
```

Requires `yt-dlp` installed. The generator extracts:
- Video title, channel, upload date, duration
- Auto-generated or manual subtitles
- Thumbnail URL (for OG image)
- Video ID (for embed)

If subtitles are not available, the generator will ask you to paste the transcript manually.

### 2.2. Pasted text

```
/transcript-site

[Then paste your transcript text directly in the chat]
```

Or provide the text inline:

```
/transcript-site <<EOF
[00:00] Host: Welcome to the show.
[00:15] Guest: Thanks for having me.
...
EOF
```

The generator accepts plain text, timestamped text, and speaker-labeled text. It will detect the format automatically.

### 2.3. File path

```
/transcript-site /path/to/transcript.txt
/transcript-site ./transcripts/episode-42.md
/transcript-site researches/my-case/06_speaker_script.md
```

Any text file or markdown file works. The generator reads the file and proceeds to content parsing.

### 2.4. Both (YouTube URL + corrected text)

```
/transcript-site https://youtube.com/watch?v=... --text /path/to/corrected-transcript.txt
```

This uses the YouTube URL for metadata and embed, but the provided text file for the actual transcript content. Useful when auto-generated subtitles are inaccurate and you have a manually corrected version.

### Input format detection

The generator recognizes several common transcript formats:

| Format | Example | Detection |
|--------|---------|-----------|
| Plain text | `This is the transcript...` | No timestamps, no speakers |
| Timestamped | `[00:15] This is the text...` | Square-bracket timestamps |
| SRT-style | `1\n00:00:15,000 --> 00:00:18,000\nText` | SRT numbering + arrows |
| VTT-style | `WEBVTT\n\n00:15.000 --> 00:18.000\nText` | WEBVTT header |
| Speaker-labeled | `Host: Welcome...\nGuest: Thank you...` | Colon-separated speaker labels |
| Combined | `[00:15] Host: Welcome...` | Timestamps + speaker labels |

All formats are normalized internally before site generation.

---

## 3. The 6-Step Pipeline

Each step produces visible output and ends with a checkpoint where you can provide feedback or proceed.

### Step 1: Input Analysis

**What happens:** The generator determines the source type (YouTube, text, file), extracts metadata, detects language, and prepares the raw transcript for parsing.

**For YouTube URLs:**
- Runs `yt-dlp` to extract metadata and subtitles
- Detects video language from subtitle metadata
- Downloads thumbnail URL for SEO

**For text/files:**
- Reads the content
- Detects language using character frequency analysis
- Estimates section count from content structure

**Expected output:**

```
Step 1/6: INPUT ANALYSIS
Source type: YouTube URL
Video ID: abc123
Title: "My Conference Talk"
Duration: 45:22
Language: en
Words: 6,842
Estimated sections: 12

Checkpoint 1/6: Input Analysis Complete
```

**What you can do at this checkpoint:**
- `ok` -- proceed to Step 2
- `change language to ru` -- override detected language
- `use this text instead: [paste]` -- replace extracted transcript

### Step 2: Content Parsing

**What happens:** The raw transcript is parsed into structured sections with speakers, timestamps, and key quotes.

**Section splitting logic:**
1. If timestamps exist: split at natural topic boundaries (long pauses, topic shifts)
2. If no timestamps: split at paragraph boundaries or every 500-800 words
3. Speaker changes always create section boundaries (configurable)

**Speaker detection:**
- Named speakers: `Host:`, `Guest:`, `Dr. Smith:` -- detected from labels
- Unnamed speakers: `Speaker A`, `Speaker B` -- detected from voice change patterns (YouTube) or paragraph alternation (text)

**Expected output:**

```
Step 2/6: CONTENT PARSING
Sections: 12
Speakers: 3 (Host, Dr. Smith, Audience Q&A)
Timestamps: 67 anchor points
Key quotes: 5

Section preview:
  1. Introduction (0:00-2:15) -- 342 words
  2. Background Context (2:15-8:30) -- 1,204 words
  3. Main Findings (8:30-18:45) -- 2,567 words
  ...

Checkpoint 2/6: Content Parsing Complete
```

**What you can do:**
- `ok` -- proceed
- `split section 3` -- split a large section into two
- `merge sections 4 and 5` -- combine small sections
- `rename speaker "Speaker A" to "Dr. Chen"` -- fix speaker names

### Step 3: Site Generation

**What happens:** The parsed content is transformed into a complete HTML page with Tailwind CSS styling, SEO meta tags, and structural markup.

**Generated structure:**
- `<head>`: SEO meta tags (OG, Twitter Card, JSON-LD), Tailwind CDN, viewport
- `<nav>`: Site header with title, dark mode toggle, search button
- `<aside>`: Table of contents (sidebar on desktop, hamburger on mobile)
- `<main>`: Transcript content organized by sections
- `<footer>`: Statistics, credits, print button

**Expected output:**

```
Step 3/6: SITE GENERATION
Template: YouTube transcript (with embed)
Theme: indigo
Language: en

Generated:
  - HTML5 semantic structure
  - Tailwind CSS CDN loaded
  - YouTube iframe embed (enablejsapi=1)
  - 12-section table of contents
  - 67 timestamp links
  - Speaker color coding (3 speakers)
  - SEO: OG tags + Twitter Card + JSON-LD VideoObject

Checkpoint 3/6: Site Generation Complete
File: docs/index.html (52 KB)
```

**What you can do:**
- `ok` -- proceed
- `change theme to emerald` -- change color scheme
- `remove youtube embed` -- generate text-only version
- `add custom header "My Podcast"` -- customize the header

### Step 4: Interactivity

**What happens:** Vanilla JavaScript is added to the HTML for all interactive features. No build step, no dependencies, no bundler.

**Features added:**

| Feature | Trigger | Implementation |
|---------|---------|---------------|
| Search | Ctrl+K or click search icon | Debounced input, regex-based matching, highlighted results |
| Dark mode | Toggle button in header | CSS class on `<html>`, localStorage persistence |
| Table of Contents | Always visible (desktop) or hamburger (mobile) | IntersectionObserver scroll-spy |
| Back-to-top | Appears on scroll > 300px | Smooth scroll to top |
| Copy quote | Click copy button next to quotes | Clipboard API with visual feedback |
| YouTube sync | Click timestamp link | iframe postMessage seekTo() |
| Progress bar | Top of page | Scroll position indicator |
| Reading stats | Below header | Word count, reading time, section count |
| Print | Print button in footer | Print-optimized stylesheet |

**Expected output:**

```
Step 4/6: INTERACTIVITY
Features added: 9
  + Search (Ctrl+K)
  + Dark mode (localStorage)
  + TOC scroll-spy (IntersectionObserver)
  + Back-to-top
  + Copy quote (Clipboard API)
  + YouTube sync (seekTo)
  + Progress bar
  + Reading stats
  + Print stylesheet

Checkpoint 4/6: Interactivity Complete
File: docs/index.html (updated, 68 KB)
```

**What you can do:**
- `ok` -- proceed
- `remove search` -- disable search functionality
- `remove youtube sync` -- disable timestamp click-to-seek
- `add keyboard navigation` -- add arrow key navigation between sections

### Step 5: Deploy

**What happens:** Deployment configuration files are generated. By default, the target is GitHub Pages via the `docs/` folder.

**Generated files:**
- `docs/robots.txt` -- Search engine directives
- `docs/sitemap.xml` -- Sitemap for SEO
- GitHub Pages instructions (printed to console, not a file)

**Expected output:**

```
Step 5/6: DEPLOY CONFIGURATION
Target: GitHub Pages (docs/ folder)

Files generated:
  docs/robots.txt
  docs/sitemap.xml

To deploy:
  1. git add docs/
  2. git commit -m "add transcript site"
  3. git push
  4. Settings > Pages > Source: main, /docs

Checkpoint 5/6: Deploy Complete
```

**What you can do:**
- `ok` -- proceed to verification
- `custom domain example.com` -- add CNAME file
- `skip deploy` -- skip this step

### Step 6: Verification

**What happens:** The generated site is validated across five categories: HTML structure, JavaScript correctness, CSS validity, SEO completeness, and accessibility compliance.

**Checks performed:**

| Category | Checks | Examples |
|----------|--------|---------|
| HTML | 8 | Valid structure, tags closed, no deprecated attrs |
| JavaScript | 6 | No syntax errors, event delegation, escape functions |
| CSS | 4 | Tailwind loaded, dark mode classes, print styles |
| SEO | 5 | OG tags, Twitter Card, JSON-LD, canonical, sitemap |
| Accessibility | 5 | Skip-nav, ARIA roles, keyboard nav, alt text |
| Security | 4 | No inline handlers, escapeHtml, SRI, CSP |
| Performance | 3 | HTML size, DOM nodes, no render-blocking |

**Expected output:**

```
Step 6/6: VERIFICATION
  HTML:          8/8 passed
  JavaScript:    6/6 passed
  CSS:           4/4 passed
  SEO:           5/5 passed
  Accessibility: 5/5 passed
  Security:      4/4 passed
  Performance:   3/3 passed

All 35 checks passed!

PIPELINE COMPLETE
Output: docs/index.html (68 KB)
```

---

## 4. Customization Options

### Theme color

The default color scheme is indigo. Change it with:

```
/transcript-site [source] --theme emerald
/transcript-site [source] --theme rose
/transcript-site [source] --theme amber
```

Available themes correspond to Tailwind color palettes: `slate`, `gray`, `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`.

### Language

Override auto-detected language:

```
/transcript-site [source] --lang ru
```

This affects:
- HTML `lang` attribute
- UI string translations (search placeholder, button labels, etc.)
- OG locale tag
- JSON-LD language field

### Timestamps

Control timestamp display:

```
/transcript-site [source] --timestamps visible     # Show timestamps (default for YouTube)
/transcript-site [source] --timestamps hidden       # Hide timestamps
/transcript-site [source] --timestamps hover        # Show on hover only
```

### Statistics display

```
/transcript-site [source] --stats                   # Show stats (default)
/transcript-site [source] --no-stats                # Hide stats
```

### Copy buttons

```
/transcript-site [source] --copy-buttons            # Show copy buttons (default)
/transcript-site [source] --no-copy-buttons          # Hide copy buttons
```

### Output directory

```
/transcript-site [source] --output docs/            # Default
/transcript-site [source] --output public/
/transcript-site [source] --output build/transcript/
```

### All options combined

```
/transcript-site https://youtube.com/watch?v=abc123 \
  --lang en \
  --theme emerald \
  --timestamps visible \
  --stats \
  --copy-buttons \
  --output docs/my-transcript/ \
  --title "My Conference Talk Transcript"
```

---

## 5. YouTube Features

### 5.1. Timestamp links

Every timestamp in the transcript becomes a clickable link. Clicking a timestamp:
1. Scrolls the YouTube embed into view (if off-screen)
2. Calls `player.seekTo(seconds)` to jump to that point in the video
3. Highlights the current section in the table of contents

The timestamp links use `data-seek` attributes for event delegation:

```html
<a href="#" data-seek="125" class="timestamp-link">[2:05]</a>
```

### 5.2. YouTube embed

The YouTube player is embedded at the top of the page with `enablejsapi=1` for JavaScript control:

```html
<iframe id="yt-player"
  src="https://www.youtube.com/embed/VIDEO_ID?enablejsapi=1&origin=..."
  class="w-full aspect-video rounded-lg shadow-lg"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen>
</iframe>
```

The embed is responsive (100% width, 16:9 aspect ratio) and works on all screen sizes.

### 5.3. Sticky player (optional)

For long transcripts, you can enable a sticky player that stays visible while scrolling:

```
/transcript-site [URL] --sticky-player
```

The player shrinks to a small floating window in the bottom-right corner when scrolled past.

### 5.4. Disabling YouTube features

```
/transcript-site [URL] --no-embed          # No YouTube iframe, timestamps as text
/transcript-site [URL] --no-sync           # YouTube iframe present but no seekTo()
```

---

## 6. Search Functionality

### 6.1. Keyboard shortcut

Press `Ctrl+K` (or `Cmd+K` on macOS) to open the search dialog. Press `Escape` to close it.

### 6.2. How search works

1. User types in the search input
2. After 300ms of inactivity (debounce), the search executes
3. Search uses regex matching with `escapeRegex()` for safety
4. All matching text segments are highlighted with `<mark>` tags
5. A result count is displayed
6. The first result is scrolled into view

### 6.3. Highlighted results

Matching text is wrapped in:

```html
<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">matched text</mark>
```

The highlight colors adapt to dark mode automatically.

### 6.4. Navigating between results

After searching:
- Press `Enter` or click the down arrow to jump to the next result
- Press `Shift+Enter` or click the up arrow to jump to the previous result
- The current result is highlighted with a stronger outline

### 6.5. Search limitations

- Minimum query length: 2 characters
- Maximum highlighted results: 50 (for performance on large transcripts)
- Case-insensitive by default
- No fuzzy matching -- exact substring match only

### 6.6. Clearing search

Click the X button in the search input, press `Escape`, or delete all text. All highlights are removed and the page returns to its original state.

---

## 7. Dark Mode and Visual Features

### 7.1. Dark mode

Toggle dark mode by clicking the sun/moon icon in the header. The setting is saved in `localStorage` and persists across visits.

If your system is set to dark mode (`prefers-color-scheme: dark`) and you have not manually toggled the setting, the site starts in dark mode automatically.

### 7.2. Progress bar

A thin progress bar at the very top of the page indicates how far you have scrolled through the transcript. It uses the primary theme color and is visible in both light and dark modes.

### 7.3. Back-to-top button

A floating button appears in the bottom-right corner when you scroll more than 300 pixels down. Clicking it smoothly scrolls to the top of the page.

### 7.4. Table of contents scroll-spy

The table of contents in the sidebar highlights the currently visible section as you scroll. This uses `IntersectionObserver` to detect which section heading is in the viewport.

On mobile, the TOC is hidden behind a hamburger menu button. Tapping the button opens a slide-out drawer with the full table of contents.

### 7.5. Reading statistics

Below the header, a stats bar shows:
- Total word count
- Estimated reading time (assumes 200 words per minute)
- Number of sections
- Number of speakers (if detected)

### 7.6. Speaker color coding

When multiple speakers are detected, each speaker is assigned a distinct color from the theme palette:

- Speaker 1: primary-600 (e.g., indigo-600)
- Speaker 2: emerald-600
- Speaker 3: amber-600
- Speaker 4: rose-600
- Additional speakers cycle through the palette

Speaker labels are bold and color-coded:

```html
<span class="font-bold text-indigo-600 dark:text-indigo-400">Host:</span>
```

---

## 8. Large Transcript Strategy

### 8.1. When to consider chunking

| Transcript size | Recommendation |
|----------------|----------------|
| Under 5,000 words | Single page, no special treatment |
| 5,000 - 15,000 words | Single page, default settings work well |
| 15,000 - 30,000 words | Single page with lazy loading |
| Over 30,000 words | Multi-page chunking recommended |

### 8.2. Single page with lazy loading

For transcripts between 15,000 and 30,000 words, the generator automatically enables lazy loading. Sections below the third viewport are loaded on demand as you scroll toward them. The table of contents and search still work across the entire transcript.

### 8.3. Multi-page chunking

For very long transcripts (over 30,000 words), the generator splits the content into multiple HTML pages:

```
docs/
  index.html        -- Landing page with TOC and overview
  section-01.html   -- First section
  section-02.html   -- Second section
  ...
```

Each page includes:
- Navigation (previous/next section links)
- Mini table of contents
- Search (searches current page only)
- Consistent header and footer

To force multi-page mode:

```
/transcript-site [source] --chunking multi
```

To force single-page mode (even for long transcripts):

```
/transcript-site [source] --chunking single
```

### 8.4. Performance characteristics

| Feature | Single page (10K words) | Single page (25K words) | Multi-page (50K words) |
|---------|------------------------|-----------------------|----------------------|
| HTML size | ~50 KB | ~120 KB | ~50 KB per page |
| Initial load | < 1 second | 1-2 seconds | < 1 second |
| Search speed | Instant | ~100ms | Instant (per page) |
| DOM nodes | ~2,000 | ~5,000 | ~2,000 per page |

---

## 9. Common Scenarios

### Scenario A: Podcast transcript

You have a podcast episode and want to create a permanent, searchable transcript page.

```
/transcript-site https://youtube.com/watch?v=PODCAST_EPISODE_ID
```

The generator creates a single-page site with:
- Episode title and metadata from YouTube
- Speaker labels (Host, Guest)
- Timestamp links for easy navigation
- YouTube embed for listening while reading

### Scenario B: Conference talk

You recorded a conference talk and want to share the transcript alongside the video.

```
/transcript-site https://youtube.com/watch?v=TALK_ID --title "Building AI Systems at Scale - PyConf 2026"
```

Key features for conference talks:
- Slide references (if timestamps are provided)
- Q&A section at the end (auto-detected from speaker changes)
- Technical terms highlighted (if detected)

### Scenario C: Interview

You conducted an interview and have a text transcript.

```
/transcript-site /path/to/interview-transcript.txt
```

The generator detects the interview format (two speakers alternating) and applies:
- Speaker color coding
- Quote extraction for notable statements
- Clean two-column layout on desktop

### Scenario D: Text-only article

You have a long-form article (not a transcript) and want to create an interactive reading experience.

```
/transcript-site /path/to/article.md
```

The generator adapts:
- No speaker detection (single author)
- No timestamp links
- Sections from markdown headers
- Reading progress bar

### Scenario E: Keysarium research artifact

You completed a Keysarium case study and want to publish the executive summary.

```
/transcript-site researches/bank-automation/08_executive_summary.md --title "Bank Automation Case Study"
```

The generator treats Keysarium artifacts as text input and creates a clean, publishable website.

### Scenario F: Batch generation

Generate sites for multiple transcripts:

```
/transcript-site episode-1.txt --output docs/ep1/
/transcript-site episode-2.txt --output docs/ep2/
/transcript-site episode-3.txt --output docs/ep3/
```

Each site is independent and can be deployed separately or together under one GitHub Pages domain.

### Scenario G: Custom branding

Generate a site with custom colors and title for a specific brand:

```
/transcript-site [source] \
  --theme rose \
  --title "Acme Corp Podcast - Episode 42" \
  --description "This week we discuss..." \
  --lang en
```

---

## 10. Tips and Best Practices

### Provide clean transcripts when possible

Auto-generated YouTube subtitles often have errors. If you have a manually corrected transcript, use it:

```
/transcript-site https://youtube.com/watch?v=... --text corrected-transcript.txt
```

The YouTube URL provides metadata and embed, while the text file provides accurate content.

### Use speaker labels

If your transcript does not have speaker labels, add them. It dramatically improves readability:

```
Host: Welcome to the show.
Guest: Thank you for having me.
```

The generator color-codes speakers and creates a more visually engaging layout.

### Keep sections reasonable

Sections of 500-1500 words work best. Very short sections (under 100 words) create too many TOC entries. Very long sections (over 3000 words) make navigation difficult.

If the auto-detected sections are not ideal, adjust at Step 2:

```
split section 3
merge sections 7 and 8
```

### Test locally before deploying

Always preview the generated site locally:

```bash
open docs/index.html
```

Check:
- All sections render correctly
- YouTube embed loads (if applicable)
- Search works
- Dark mode toggles cleanly
- Mobile layout is acceptable (resize browser window)

### Commit generated files to git

The generated site files should be committed to your repository:

```bash
git add docs/
git commit -m "add transcript site: Episode 42"
git push
```

This enables GitHub Pages deployment and provides version history.

### Use descriptive titles

The title appears in:
- The browser tab
- Open Graph previews (social media shares)
- Search engine results
- The site header

Make it descriptive and specific:

```
--title "How We Built Our ML Pipeline - Engineering Podcast Ep. 42"
```

Not:

```
--title "Transcript"
```

---

## 11. FAQ

### Q: Do I need Node.js to view the generated site?

No. The generated site is pure static HTML with Tailwind CDN and vanilla JavaScript. Open `docs/index.html` in any modern browser. Node.js is only needed for the `npx` CLI commands during installation.

### Q: Can I edit the generated HTML manually?

Yes. The HTML is clean, well-structured, and uses standard Tailwind classes. You can edit it with any text editor. The site does not depend on any build tool or preprocessor.

### Q: Does the site work offline?

If you used `--tailwind inline`, yes -- the site works completely offline. If you used the default Tailwind CDN, the site needs internet access on the first visit (after which the CDN is cached by the browser). The YouTube embed always requires internet access.

### Q: Can I use this with a non-YouTube video platform?

Currently, only YouTube URLs are supported for automatic metadata and subtitle extraction. For other platforms (Vimeo, Twitch, etc.), download the transcript separately and provide it as text input. You can embed the video manually by editing the HTML after generation.

### Q: How do I update a transcript site after editing the transcript?

Re-run the pipeline:

```
/transcript-site [updated source] --output docs/ --clean
```

The `--clean` flag removes previously generated files before writing new ones. Alternatively, manually delete `docs/index.html` and re-run.

### Q: Can I generate multiple pages from one long transcript?

Yes. Use `--chunking multi`:

```
/transcript-site [source] --chunking multi
```

This splits the transcript into separate HTML pages by section.

### Q: How do I add Google Analytics or other tracking?

Edit the generated `docs/index.html` and add the tracking script to the `<head>` section. The generator does not add tracking by default -- this is intentional for privacy.

### Q: The YouTube subtitles are inaccurate. What can I do?

Three options:
1. Download and correct the subtitles, then provide as text: `--text corrected.txt`
2. Use a transcription service (Whisper, AssemblyAI) and provide the result as text
3. Correct the HTML manually after generation

### Q: Can I change the font?

Yes, by editing the Tailwind config in the generated HTML:

```html
<script>
  tailwind.config = {
    theme: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  }
</script>
```

Add the font import in the `<head>`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Q: What is the maximum transcript length?

There is no hard limit. Single-page mode works well up to 30,000 words (~150 KB HTML). Beyond that, multi-page chunking is recommended. The generator handles transcripts of 100,000+ words with chunking enabled.

### Q: Can I deploy to something other than GitHub Pages?

Yes. The generated site is static HTML -- it works on any static hosting:
- Netlify: drag and drop the `docs/` folder
- Vercel: point to the `docs/` directory in project settings
- AWS S3: upload `docs/` contents to an S3 bucket with static hosting
- Any web server: copy `docs/` to your server's document root

### Q: Does the site support right-to-left (RTL) languages?

The generator sets `dir="rtl"` on the HTML element when it detects an RTL language (Arabic, Hebrew, Persian, Urdu). Tailwind utilities handle the layout adjustments automatically.

### Q: How do I remove the "Generated by" footer credit?

Edit `docs/index.html` and remove or modify the footer section. The credit is not required -- it is a default that you are free to change.

### Q: Can I use this in a CI/CD pipeline?

The generation step requires Claude Code (an interactive AI tool), so it cannot run in a headless CI/CD pipeline. However, you can:
1. Generate the site locally with Claude Code
2. Commit the output to git
3. Deploy via GitHub Pages (automatic on push) or CI/CD for the static files

### Q: The generated site is too large (over 200 KB). What should I do?

1. Enable multi-page chunking: `--chunking multi`
2. Use inline Tailwind: `--tailwind inline` (removes CDN dependency, smaller CSS)
3. Check for unusually long sections and split them
4. Remove features you do not need: `--no-copy-buttons --no-stats`
