# @dzhechkov/skills-transcript-site

**Interactive Transcript Site Generator skill pack for Claude Code**

Transform transcripts and YouTube videos into SEO-optimized static websites with search, table of contents, dark mode, and GitHub Pages deployment. Part of the [Keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium) ecosystem.

---

## Quick Start

```bash
# One-command install via npx
npx @dzhechkov/skills-transcript-site

# Or install globally
npm install -g @dzhechkov/skills-transcript-site
skills-transcript-site init

# Install into a project that already has @dzhechkov/keysarium
npx @dzhechkov/skills-transcript-site init
```

After installation, open Claude Code in your project directory and run `/transcript-site` to generate a site.

---

## What You Get

| Component | Count | Description |
|-----------|-------|-------------|
| **Skill** | 1 | `transcript-site-generator` -- core skill with 6 modules |
| **Modules** | 6 | Input analysis, content parsing, site generation, interactivity, deploy config, verification |
| **References** | 3 | SEO checklist, accessibility guidelines, performance best practices |
| **Examples** | 2 | Sample generated site, sample configuration |

Everything is installed into your project's `.claude/skills/transcript-site-generator/` directory and works natively with Claude Code.

---

## Commands

```bash
npx @dzhechkov/skills-transcript-site                    # Full install (interactive, same as init)
npx @dzhechkov/skills-transcript-site init               # Install all components
npx @dzhechkov/skills-transcript-site init --force       # Overwrite existing files
npx @dzhechkov/skills-transcript-site init --dry-run     # Preview without making changes
npx @dzhechkov/skills-transcript-site update             # Update to latest version
npx @dzhechkov/skills-transcript-site remove             # Clean uninstall
npx @dzhechkov/skills-transcript-site list               # Show installed components
npx @dzhechkov/skills-transcript-site doctor             # Health check
```

---

## Pipeline

```
INPUT        CONTENT       SITE          INTERACTIVE    DEPLOY        VERIFY
ANALYSIS --> PARSING   --> GENERATION --> FEATURES   --> CONFIG    --> CHECK
  |            |            |              |              |            |
  |            |            |              |              |            +-- Lighthouse audit, link check
  |            |            |              |              +-- GitHub Actions workflow, Pages config
  |            |            |              +-- Search, TOC, dark mode, copy-quote, progress bar
  |            |            +-- HTML structure, Tailwind CSS, responsive layout
  |            +-- Transcript segmentation, speaker detection, timestamps
  +-- Detect input type (text, YouTube URL, or both)
```

### Usage in Claude Code

```bash
# Generate site from a transcript file
/transcript-site transcript.txt

# Generate site from a YouTube video URL
/transcript-site https://www.youtube.com/watch?v=...

# Generate site with custom title
/transcript-site transcript.txt --title "My Conference Talk"
```

---

## Features

- **Full-text search** -- instant client-side search across all transcript content
- **Table of contents** -- auto-generated from transcript sections and timestamps
- **Dark mode** -- system-aware theme with manual toggle
- **YouTube sync** -- clickable timestamps link to video positions
- **Progress bar** -- visual reading progress indicator
- **Copy-quote** -- select and copy any transcript segment with attribution
- **Mobile navigation** -- responsive hamburger menu and swipe gestures
- **SEO optimized** -- Open Graph tags, structured data, semantic HTML, sitemap

---

## Input Types

| Input | Description | Example |
|-------|-------------|---------|
| **Text file** | Raw transcript text (.txt, .md, .srt, .vtt) | `transcript.txt` |
| **YouTube URL** | Video URL (requires yt-dlp for subtitle download) | `https://youtube.com/watch?v=...` |
| **Both** | Text file + YouTube URL for linked playback | `transcript.txt + URL` |

---

## Output Structure

```
docs/
  index.html              # Main site page (single-page app)
  static/
    app.js                 # Vanilla JS: search, TOC, dark mode, progress
    style.css              # Tailwind CSS utilities + custom styles
.github/
  workflows/
    deploy.yml             # GitHub Actions workflow for Pages deployment
README.md                  # Auto-generated project documentation
```

---

## Tech Stack

- **Tailwind CSS** via CDN -- no build step required
- **Vanilla JavaScript** -- zero framework dependencies
- **Font Awesome** via CDN -- icons for UI elements
- **No build step** -- output is ready to deploy as-is

---

## Integration with Keysarium

Transcript Site works standalone but integrates seamlessly with `@dzhechkov/keysarium`:

```bash
# Install Keysarium first (optional)
npx @dzhechkov/keysarium init

# Then add Transcript Site -- it detects Keysarium automatically
npx @dzhechkov/skills-transcript-site init
```

When installed alongside Keysarium, the Transcript Site skill is available as part of the broader skill library.

---

## Requirements

- **Claude Code CLI** -- installed and configured ([installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **Node.js >= 16.0.0** -- required for the npm install method
- **yt-dlp** (optional) -- required only for YouTube URL input ([install guide](https://github.com/yt-dlp/yt-dlp#installation))

---

## License

[MIT](https://opensource.org/licenses/MIT)

---

## Links

- **GitHub:** [https://github.com/dzhechko/product-keysarium-2026](https://github.com/dzhechko/product-keysarium-2026)
- **Issues:** [https://github.com/dzhechko/product-keysarium-2026/issues](https://github.com/dzhechko/product-keysarium-2026/issues)
- **npm:** [https://www.npmjs.com/package/@dzhechkov/skills-transcript-site](https://www.npmjs.com/package/@dzhechkov/skills-transcript-site)
- **Keysarium:** [https://www.npmjs.com/package/@dzhechkov/keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium)
