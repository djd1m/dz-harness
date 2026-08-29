# Infrastructure Requirements -- @dzhechkov/skills-transcript-site

## Contents

1. [Overview](#1-overview)
2. [Minimal Requirements](#2-minimal-requirements)
3. [Optional Dependencies](#3-optional-dependencies)
4. [CDN Dependencies](#4-cdn-dependencies)
5. [Network Requirements](#5-network-requirements)
6. [Storage Requirements](#6-storage-requirements)
7. [Hosting Options](#7-hosting-options)
8. [Scaling Considerations](#8-scaling-considerations)
9. [Cost Analysis](#9-cost-analysis)
10. [Readiness Checklist](#10-readiness-checklist)

---

## 1. Overview

@dzhechkov/skills-transcript-site is a zero-infrastructure tool. It generates pure static HTML files that require no server, no database, no build step, and no persistent process. The generated site is a single HTML file (or a few HTML files for chunked transcripts) that can be opened directly in a browser or hosted on any static file server.

### Architecture

```
+--------------------------------------------------+
|              Developer Machine                    |
|                                                   |
|  +-------------------------------------------+   |
|  |  Claude Code CLI                          |   |
|  |  +-- .claude/skills/transcript-site/      |   |
|  |  |   +-- SKILL.md                         |   |
|  |  |   +-- modules/ (6 pipeline steps)      |   |
|  |  |   +-- references/ (templates, SEO)     |   |
|  |  +-- .claude/commands/                    |   |
|  |      +-- transcript-site.md               |   |
|  |      +-- transcript-site-generate.md      |   |
|  |      +-- transcript-site-deploy.md        |   |
|  +---------------+---------------------------+   |
|                  | HTTPS (port 443)               |
+------------------+-------------------------------+
                   |
           +-------v--------+
           | Anthropic API  |
           | (content gen)  |
           +----------------+

+--------------------------------------------------+
|              Generated Output                     |
|                                                   |
|  docs/                                            |
|  +-- index.html     (~50-100 KB, self-contained)  |
|  +-- robots.txt     (~50 bytes)                   |
|  +-- sitemap.xml    (~300 bytes)                  |
|                                                   |
|  Runtime CDN dependencies:                        |
|  +-- cdn.tailwindcss.com (CSS framework)          |
|  +-- cdnjs.cloudflare.com (Font Awesome icons)    |
|  +-- www.youtube.com (iframe embed, optional)     |
+--------------------------------------------------+
```

There are no backend services to operate. No Redis, no databases, no queues. The Anthropic API is used only during generation -- the resulting site is fully static and independent.

---

## 2. Minimal Requirements

### 2.1. For generation (creating the site)

| Component | Requirement | Check |
|-----------|------------|-------|
| Node.js | 16+ (20+ recommended) | `node --version` |
| npm | 8+ | `npm --version` |
| Claude Code CLI | Latest | `claude --version` |
| Anthropic API key | Valid key with API access | Environment variable `ANTHROPIC_API_KEY` set |
| Internet connection | Required during generation | For Anthropic API calls |

### 2.2. For viewing (opening the generated site)

| Component | Requirement |
|-----------|------------|
| Web browser | Chrome 90+, Firefox 90+, Safari 15+, Edge 90+ |
| Internet connection | Required for Tailwind CDN (unless `--tailwind inline` was used) |

### 2.3. For deployment (hosting the site)

| Component | Requirement |
|-----------|------------|
| git | 2.20+ (for GitHub Pages) |
| GitHub account | Free tier sufficient |

No build tools, no bundlers, no package managers are needed for the generated output. The output is plain HTML.

### 2.4. Hardware requirements

The generator itself runs within Claude Code and delegates all compute-intensive work to the Anthropic API. Local hardware requirements are minimal:

| Component | Minimum | Notes |
|-----------|---------|-------|
| CPU | 1 core | Not compute-intensive locally |
| RAM | 2 GB | Node.js + Claude Code process |
| Disk | 10 MB free | Generated sites are tiny |
| Terminal | 80 columns | Wider terminals display pipeline output better |

A five-year-old laptop with a stable internet connection is sufficient.

---

## 3. Optional Dependencies

### 3.1. yt-dlp (YouTube extraction)

Required only if you want to generate sites from YouTube URLs. Not needed for text input.

| Property | Value |
|----------|-------|
| Purpose | Extract subtitles and metadata from YouTube |
| Installation | `pip install yt-dlp` or `brew install yt-dlp` |
| Check | `yt-dlp --version` |
| Without it | YouTube URLs not supported; text input still works |

### 3.2. git (deployment)

Required only for GitHub Pages deployment. Not needed for local preview.

| Property | Value |
|----------|-------|
| Purpose | Push generated files to GitHub for hosting |
| Installation | `apt install git` or `brew install git` |
| Check | `git --version` |
| Without it | Local preview works; manual upload to other hosts works |

### 3.3. No other optional dependencies

The generator does not use:
- Python (except for yt-dlp installation via pip)
- Docker
- Any database
- Any build tool (webpack, vite, etc.)
- Any CSS preprocessor (sass, less, etc.)
- Any JavaScript framework (React, Vue, etc.)

---

## 4. CDN Dependencies

The generated site relies on two CDN resources at runtime (when the user views the page):

### 4.1. Tailwind CSS Play CDN

```
https://cdn.tailwindcss.com
```

| Property | Value |
|----------|-------|
| Purpose | CSS framework (utility classes) |
| Size | ~300 KB (cached after first load) |
| Fallback | Use `--tailwind inline` to eliminate this dependency |
| SRI | Subresource Integrity hash included in the script tag |

### 4.2. Font Awesome CDN (optional)

```
https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css
```

| Property | Value |
|----------|-------|
| Purpose | Icons (search, dark mode, copy, etc.) |
| Size | ~90 KB (cached after first load) |
| Fallback | Can be replaced with inline SVG icons using `--icons inline` |
| SRI | Subresource Integrity hash included in the link tag |

### 4.3. YouTube iframe API (conditional)

```
https://www.youtube.com/embed/VIDEO_ID?enablejsapi=1
```

| Property | Value |
|----------|-------|
| Purpose | Embedded video player with seekTo() support |
| Loaded when | Source was a YouTube URL and `--no-embed` was not specified |
| Size | Varies (loaded by YouTube) |
| Fallback | Use `--no-embed` to generate text-only site |

### 4.4. Fully offline mode

To generate a site with zero CDN dependencies:

```
/transcript-site [source] --tailwind inline --icons inline --no-embed
```

This produces a single HTML file that works entirely offline. Estimated size increase: +15-25 KB for inlined CSS and SVG icons.

---

## 5. Network Requirements

### 5.1. During generation

The generator communicates only with the Anthropic API over HTTPS (port 443). If using YouTube URLs, `yt-dlp` also connects to YouTube.

| Destination | Port | Purpose | When |
|-------------|------|---------|------|
| `api.anthropic.com` | 443 | AI content generation | Always |
| `www.youtube.com` | 443 | Subtitle and metadata extraction | YouTube URLs only |
| `i.ytimg.com` | 443 | Thumbnail download | YouTube URLs only |

Total data transferred during generation: under 500 KB (API request/response payloads are text).

### 5.2. During viewing (user opens the site)

| Destination | Port | Purpose | When |
|-------------|------|---------|------|
| `cdn.tailwindcss.com` | 443 | CSS framework | Default mode (not inline) |
| `cdnjs.cloudflare.com` | 443 | Icons | Default mode (not inline) |
| `www.youtube.com` | 443 | Video embed | YouTube source with embed |

Total data on first view: ~400-500 KB (mostly cached after first visit).

### 5.3. Bandwidth

Generation requires minimal bandwidth. A 3G connection is sufficient. Viewing requires CDN access on first load -- after that, browser cache handles it.

### 5.4. Proxy and firewall

If your network uses a proxy or firewall, ensure outbound HTTPS to these domains is permitted:

```
Required for generation:
  api.anthropic.com:443

Required for YouTube extraction:
  www.youtube.com:443
  i.ytimg.com:443

Required for viewing (default mode):
  cdn.tailwindcss.com:443
  cdnjs.cloudflare.com:443
```

---

## 6. Storage Requirements

### 6.1. Installation footprint

| Component | Size |
|-----------|------|
| Skill files (SKILL.md, modules/, references/, examples/) | ~70 KB |
| Commands (3 files) | ~10 KB |
| Rules (1 file) | ~5 KB |
| Manifest | ~1 KB |
| **Total installation** | **~86 KB** |

### 6.2. Generated site size

| Transcript length | Output size (CDN mode) | Output size (inline mode) |
|-------------------|----------------------|--------------------------|
| 1,000 words | ~20 KB | ~40 KB |
| 5,000 words | ~40 KB | ~60 KB |
| 10,000 words | ~65 KB | ~85 KB |
| 20,000 words | ~110 KB | ~130 KB |
| 50,000 words (multi-page) | ~50 KB per page | ~70 KB per page |

Additional files per site:
- `robots.txt`: ~50 bytes
- `sitemap.xml`: ~300 bytes

### 6.3. Long-term storage

Each generated site occupies 50-150 KB. A repository with 100 transcript sites uses approximately 10-15 MB. This is negligible for any modern storage system or git repository.

---

## 7. Hosting Options

### 7.1. GitHub Pages (recommended, free)

The default deployment target. GitHub Pages serves static files from the `docs/` folder.

| Property | Value |
|----------|-------|
| Cost | Free (for public repositories) |
| HTTPS | Automatic (via GitHub) |
| Custom domain | Supported (via CNAME file) |
| CDN | GitHub's global CDN |
| Bandwidth limit | 100 GB/month (soft limit) |
| Storage limit | 1 GB per repository (soft limit) |

Setup:
1. Push `docs/` to your repository
2. Go to Settings > Pages
3. Source: "Deploy from a branch", Branch: main, Folder: `/docs`

### 7.2. Netlify (free tier)

Drag and drop the `docs/` folder to Netlify's deploy interface, or connect your git repository.

| Property | Value |
|----------|-------|
| Cost | Free tier: 100 GB bandwidth/month |
| HTTPS | Automatic |
| Custom domain | Supported |
| Build step | None needed (static files) |

### 7.3. Vercel (free tier)

Point Vercel to the `docs/` directory in your repository settings.

| Property | Value |
|----------|-------|
| Cost | Free tier: 100 GB bandwidth/month |
| HTTPS | Automatic |
| Custom domain | Supported |

### 7.4. Any static file server

The generated site is a plain HTML file. Serve it from any web server:

```bash
# Python (quick local server)
cd docs && python -m http.server 8000

# nginx
cp docs/* /var/www/html/

# Apache
cp docs/* /var/www/html/

# AWS S3
aws s3 sync docs/ s3://my-bucket/ --acl public-read

# Cloudflare Pages
# Connect your git repo and point to docs/
```

### 7.5. Local file (no hosting)

For personal use or sharing via file transfer, just open `docs/index.html` directly in a browser:

```bash
open docs/index.html        # macOS
xdg-open docs/index.html    # Linux
start docs\index.html       # Windows
```

No server needed. The file protocol (`file:///`) works for all features except YouTube embed (which requires HTTPS origin for the iframe API).

---

## 8. Scaling Considerations

### 8.1. One site at a time

The generator produces one site per invocation. There is no batching or concurrent generation mode. For multiple sites, run the pipeline sequentially:

```
/transcript-site source1 --output docs/site1/
/transcript-site source2 --output docs/site2/
```

### 8.2. No server-side scaling needed

The generated sites are static. They can handle any traffic level without server-side changes. GitHub Pages, Netlify, and similar CDN-backed hosts handle scaling automatically.

### 8.3. Repository size management

If you generate many sites in one repository, keep an eye on the total repository size:

| Number of sites | Estimated total size | Git-friendly? |
|----------------|---------------------|---------------|
| 1-10 | 0.5-1.5 MB | No issues |
| 10-50 | 1.5-7 MB | No issues |
| 50-100 | 7-15 MB | Acceptable |
| 100+ | 15+ MB | Consider separate repos |

For large collections, consider a monorepo with separate `docs/` subdirectories or a dedicated repository per site.

---

## 9. Cost Analysis

### 9.1. Generation cost (Anthropic API)

The generation pipeline uses the Anthropic API. Token consumption scales with transcript length:

| Transcript length | Estimated tokens | Estimated cost |
|-------------------|-----------------|----------------|
| 1,000 words | ~15,000 | < $0.10 |
| 5,000 words | ~30,000 | ~$0.20 |
| 10,000 words | ~50,000 | ~$0.35 |
| 25,000 words | ~80,000 | ~$0.55 |

These estimates include all 6 pipeline steps.

### 9.2. Hosting cost

| Platform | Cost |
|----------|------|
| GitHub Pages | Free (public repos) |
| Netlify free tier | Free (100 GB/month) |
| Vercel free tier | Free (100 GB/month) |
| Local file | Free |
| AWS S3 | ~$0.02/month for a single site |

### 9.3. CDN cost

Tailwind CDN and Font Awesome CDN are free. YouTube iframe is free. There are no CDN costs.

### 9.4. Total cost of ownership

```
Generation:     $0.10-$0.55 per site (one-time, Anthropic API)
Hosting:        $0.00 per month (GitHub Pages / Netlify / Vercel free tier)
CDN:            $0.00 per month (Tailwind CDN + Font Awesome CDN are free)
Infrastructure: $0.00 per month (no server, no database)
Maintenance:    $0.00 per month (static files, no updates needed)

Total:          $0.10-$0.55 per site, once.
```

---

## 10. Readiness Checklist

Use this checklist before your first run to confirm the environment is properly configured.

### Software

- [ ] Node.js 16+ installed (`node --version` returns v16.x.x or higher)
- [ ] npm 8+ installed (`npm --version` returns 8.x.x or higher)
- [ ] Claude Code CLI installed (`claude --version` succeeds)
- [ ] @dzhechkov/skills-transcript-site initialized (`npx @dzhechkov/skills-transcript-site init` completed)

### Optional

- [ ] yt-dlp installed (`yt-dlp --version` succeeds) -- needed for YouTube URLs
- [ ] git installed (`git --version` succeeds) -- needed for GitHub Pages deployment

### Files

- [ ] `.claude/skills/transcript-site-generator/SKILL.md` exists and is non-empty
- [ ] `.claude/skills/transcript-site-generator/modules/` contains 6 module files
- [ ] `.claude/skills/transcript-site-generator/references/` contains 4 reference files
- [ ] `.claude/commands/transcript-site.md` exists
- [ ] `.claude/commands/transcript-site-generate.md` exists
- [ ] `.claude/commands/transcript-site-deploy.md` exists

### API access

- [ ] `ANTHROPIC_API_KEY` environment variable set, or `claude auth login` completed
- [ ] Outbound HTTPS to `api.anthropic.com:443` is permitted

### Verification

```bash
npx @dzhechkov/skills-transcript-site doctor
```

Expected output when everything is in order:

```
Transcript Site Doctor -- Health Check
---------------------------------------
Node.js:        v20.11.0  OK
npm:            10.2.4    OK
Claude Code:    1.x.x     OK
SKILL.md:       12.4 KB   OK
modules/:       6 files   OK
references/:    4 files   OK
commands/:      3 files   OK
yt-dlp:         2024.12   OK (optional)
API key:        present   OK (not validated)
---------------------------------------
Status: READY
Run /transcript-site [source] to generate your first site.
---------------------------------------
```
