# Infrastructure Requirements — @dzhechkov/skills-edu-site

## Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Build Requirements](#2-build-requirements)
3. [Runtime Dependencies](#3-runtime-dependencies)
4. [Storage Requirements](#4-storage-requirements)
5. [Hosting Options](#5-hosting-options)
6. [Network Requirements](#6-network-requirements)
7. [Browser Support](#7-browser-support)
8. [Accessibility](#8-accessibility)
9. [Readiness Checklist](#9-readiness-checklist)

---

## 1. Architecture Overview

@dzhechkov/skills-edu-site generates a fully static React SPA. The architecture has two distinct phases with fundamentally different infrastructure needs:

```
PHASE 1: GENERATION                       PHASE 2: RUNTIME (post-build)
(Claude Code + Anthropic API)              (Static files only)

+------------------------------+          +-------------------------+
|     Developer Machine        |          |   Static File Server    |
|                              |          |   (GitHub Pages, etc.)  |
|  +------------------------+  |          |                         |
|  |  Claude Code CLI       |  |          |   dist/                 |
|  |  +-- edu-site-generator|  |          |   +-- index.html        |
|  |      skill             |  |          |   +-- assets/           |
|  +----------+-------------+  |          |   |   +-- index-*.js    |
|             | HTTPS          |          |   |   +-- index-*.css   |
+-------------+----------------+          |   +-- favicon.ico       |
              |                           |                         |
      +-------v--------+                 +-------------------------+
      | Anthropic API   |                       |
      | (generation     |                       | HTTPS
      |  phase only)    |                       |
      +----------------+                 +------v-------+
                                         |   Browser    |
                                         |  (end user)  |
                                         |  No API calls|
                                         |  All offline |
                                         +--------------+
```

**Key architectural property:** After `npm run build`, the generated site is a collection of static files. No server-side code runs. No API calls are made. No database is needed. The entire application — content, exercises, gamification logic — runs in the browser.

This means:
- **Generation phase** requires Node.js, Claude Code CLI, and Anthropic API access
- **Runtime phase** requires only a static file server (or even opening `index.html` locally)

---

## 2. Build Requirements

These requirements apply to the developer machine where the site is generated and built.

### 2.1. Software dependencies

| Component | Minimum version | Recommended | Check | Purpose |
|-----------|----------------|-------------|-------|---------|
| Node.js | 16.0.0 | 20 LTS | `node --version` | Build toolchain, Vite, React |
| npm | 8.0.0 | 10+ | `npm --version` | Package management |
| Claude Code CLI | Latest | Latest | `claude --version` | Skill execution environment |
| git | 2.20+ | Latest | `git --version` | Version control, GitHub Pages deploy |

### 2.2. Hardware requirements

The build process is lightweight. Vite is fast and requires minimal resources.

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| CPU | 1 core | 2+ cores | Vite build is fast even on single core |
| RAM | 1 GB free | 2+ GB | Node.js process during build |
| Disk | 100 MB free | 500 MB | node_modules (~150 MB) + build output |
| Terminal | 80 x 24 | 120+ columns | Wider terminals display pipeline output better |

### 2.3. Build commands

```bash
# Install dependencies (one-time, or after generation)
npm install

# Development server with hot module replacement
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview
```

### 2.4. Build output

The `npm run build` command produces the `dist/` directory:

```
dist/
+-- index.html              (~2 KB)
+-- assets/
|   +-- index-[hash].js     (~100-300 KB, gzipped ~40-120 KB)
|   +-- index-[hash].css    (~10-30 KB, gzipped ~3-8 KB)
+-- favicon.ico              (~1 KB)
```

Total output size: 200-500 KB uncompressed, 50-150 KB gzipped.

---

## 3. Runtime Dependencies

These are the npm packages included in the generated project.

### 3.1. Production dependencies

| Package | Version | Size (gzip) | Purpose |
|---------|---------|------------|---------|
| react | ^19.0.0 | ~6 KB | UI library |
| react-dom | ^19.0.0 | ~40 KB | DOM rendering |
| react-router-dom | ^7.0.0 | ~12 KB | Client-side routing (HashRouter) |
| zustand | ^5.0.0 | ~1 KB | State management with persist |

### 3.2. Dev dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^6.0.0 | Build tool and dev server |
| @vitejs/plugin-react | ^4.0.0 | React Fast Refresh for Vite |
| tailwindcss | ^4.0.0 | Utility-first CSS framework |
| @tailwindcss/vite | ^4.0.0 | TailwindCSS v4 Vite integration |

### 3.3. No runtime API dependencies

The generated site makes **zero network requests** after loading. All content — sections, exercises, quiz questions, achievements — is bundled into the JavaScript assets at build time. The site works fully offline once loaded.

This is a deliberate design choice:
- No backend server to maintain
- No API keys to manage
- No CORS issues
- Works in air-gapped environments
- Instant page transitions (all data is local)

---

## 4. Storage Requirements

### 4.1. Source project (before build)

| Directory | Typical size | Contains |
|-----------|-------------|---------|
| `node_modules/` | ~150 MB | npm dependencies (not deployed) |
| `src/` | 50-200 KB | Application source code |
| `public/` | 1-10 KB | Static assets (favicon) |
| `.github/` | 1 KB | GitHub Actions workflow |
| **Total (with node_modules)** | **~150 MB** | |
| **Total (without node_modules)** | **~100-250 KB** | |

### 4.2. Build output

| File | Typical size |
|------|-------------|
| `dist/index.html` | 1-3 KB |
| `dist/assets/*.js` | 100-300 KB |
| `dist/assets/*.css` | 10-30 KB |
| `dist/favicon.ico` | ~1 KB |
| **Total dist/** | **200-500 KB** |

### 4.3. Client-side storage (localStorage)

The Zustand persist middleware stores user progress in localStorage:

| Data | Typical size | Description |
|------|-------------|-------------|
| Completed exercises | 0.5-2 KB | Set of exercise IDs per section |
| Points and streaks | < 0.1 KB | Numeric values |
| Unlocked achievements | 0.2-0.5 KB | Array of achievement IDs |
| Final test results | 0.5-1 KB | Answers and score |
| **Total localStorage** | **~1-4 KB** | |

This is well within browser localStorage limits (5-10 MB typical).

---

## 5. Hosting Options

### 5.1. GitHub Pages (recommended, free)

The generated project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) for automated deployment.

**Setup:**
1. Push the generated project to a GitHub repository
2. Go to Settings > Pages > Source: GitHub Actions
3. The workflow runs on every push to `main`

**Requirements:**
- GitHub account (free tier is sufficient)
- Repository (public or private — Pages works with both on paid plans)
- Correct `base` path in `vite.config.js` matching the repository name

**URL format:** `https://username.github.io/repository-name/`

**Limitations:**
- Max site size: 1 GB (generated sites are well under this)
- Bandwidth: 100 GB/month on free tier
- Build minutes: 2,000/month on free tier

### 5.2. Self-hosted static file server

Any static file server can host the `dist/` directory.

**Nginx example:**
```nginx
server {
    listen 80;
    server_name edu.example.com;
    root /var/www/edu-site/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Requirements:** Any server capable of serving static files (Nginx, Apache, Caddy, Python http.server).

### 5.3. Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (from project root)
vercel --prod
```

Set `base: '/'` in `vite.config.js` when deploying to Vercel.

### 5.4. Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

Create `netlify.toml` in the project root:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 5.5. Local file system (offline)

For offline use or internal distribution, the built site can be opened directly from the file system. Since the project uses `HashRouter` (not `BrowserRouter`), routing works correctly without a server.

```bash
# Build the project
npm run build

# Open directly in browser
open dist/index.html     # macOS
xdg-open dist/index.html # Linux
start dist/index.html    # Windows
```

---

## 6. Network Requirements

### 6.1. Generation phase

During generation (running `/edu-site` in Claude Code), the tool requires:

| Destination | Port | Protocol | Purpose |
|-------------|------|----------|---------|
| api.anthropic.com | 443 | HTTPS | Claude API calls |
| Target documentation URL (if applicable) | 443 | HTTPS | Content fetching (Step 1) |
| registry.npmjs.org | 443 | HTTPS | npm install (one-time) |

If behind a firewall or proxy, ensure outbound HTTPS access to these domains.

### 6.2. Build phase

```bash
npm install  # Requires network (downloads packages)
npm run build  # No network required (local operation)
```

After `npm install` completes, `npm run build` runs entirely offline.

### 6.3. Runtime phase

**The generated site makes zero network calls.** Once the browser loads the HTML, CSS, and JS assets, everything runs locally. No analytics, no tracking, no telemetry, no API calls.

This means:
- The site works after initial load even if the network goes down
- The site works in incognito/private mode
- The site works behind restrictive firewalls
- The site works on local intranets with no internet access

---

## 7. Browser Support

### 7.1. Supported browsers

The generated site targets modern browsers with ES2020+ support:

| Browser | Minimum version | Status |
|---------|----------------|--------|
| Chrome | 80+ | Fully supported |
| Firefox | 80+ | Fully supported |
| Safari | 14+ | Fully supported |
| Edge | 80+ (Chromium-based) | Fully supported |
| Mobile Chrome | 80+ | Fully supported |
| Mobile Safari | 14+ | Fully supported |
| Internet Explorer | Any | Not supported |

### 7.2. JavaScript features used

The generated code uses:
- ES Modules (`import` / `export`)
- Optional chaining (`?.`)
- Nullish coalescing (`??`)
- `Array.prototype.at()`
- Template literals
- Destructuring
- Arrow functions
- `async` / `await` (for lazy loading)

All of these are supported in the browser versions listed above.

### 7.3. CSS features used

TailwindCSS v4 output uses:
- CSS Custom Properties (`--color-primary`)
- CSS Grid and Flexbox
- `@media` queries for responsive design
- `clamp()` for fluid typography (optional)
- `:has()` pseudo-class (in some generated patterns)

### 7.4. Touch support

Drag-to-Order and Matching exercises support both mouse and touch events. The generated components use pointer events where possible and fall back to touch events for older mobile browsers.

---

## 8. Accessibility

### 8.1. Keyboard navigation

All interactive elements are keyboard-accessible:

| Element | Key | Action |
|---------|-----|--------|
| Quiz options | Tab, Space/Enter | Navigate and select |
| Flashcards | Space/Enter | Flip card |
| Navigation links | Tab, Enter | Navigate between pages |
| Buttons | Tab, Space/Enter | Activate |
| Modal/Toast | Escape | Dismiss |

### 8.2. ARIA attributes

Generated components include relevant ARIA attributes:

```jsx
// Quiz example
<div role="radiogroup" aria-labelledby="question-title">
  <label>
    <input
      type="radio"
      name="answer"
      value={index}
      aria-checked={selected === index}
    />
    {option}
  </label>
</div>

// Progress bar
<div
  role="progressbar"
  aria-valuenow={progress}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="Section progress"
/>

// Toast notification
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  Achievement Unlocked!
</div>
```

### 8.3. Color contrast

The default themes meet WCAG 2.1 AA contrast ratios:
- Text on background: minimum 4.5:1
- Large text on background: minimum 3:1
- Interactive element boundaries: minimum 3:1

### 8.4. Screen reader support

- All pages have descriptive `<title>` tags
- Headings follow a logical hierarchy (h1 > h2 > h3)
- Images (if added) require `alt` attributes
- Form inputs have associated `<label>` elements
- Navigation landmarks use `<nav>`, `<main>`, `<aside>`, `<footer>`

---

## 9. Readiness Checklist

Use this checklist before running your first edu-site generation.

### Generation environment

- [ ] Node.js 16+ installed (`node --version` returns v16.x.x or higher)
- [ ] npm 8+ installed (`npm --version` returns 8.x.x or higher)
- [ ] Claude Code CLI installed (`claude --version` succeeds)
- [ ] git installed (`git --version` succeeds)
- [ ] @dzhechkov/skills-edu-site initialized (`npx @dzhechkov/skills-edu-site init` completed)

### Skill files

- [ ] `.claude/skills/edu-site-generator/SKILL.md` exists and is non-empty
- [ ] `.claude/skills/edu-site-generator/modules/` contains 8 module files
- [ ] `.claude/skills/edu-site-generator/references/` contains 5 reference files
- [ ] `.claude/commands/edu-site.md` exists

### API access (generation phase only)

- [ ] `ANTHROPIC_API_KEY` environment variable set, or `claude auth login` completed
- [ ] Outbound HTTPS to `api.anthropic.com:443` is permitted
- [ ] (Optional) Outbound HTTPS to documentation URLs is permitted

### Deployment (if using GitHub Pages)

- [ ] GitHub account active
- [ ] Target repository created
- [ ] GitHub Pages enabled (Settings > Pages > Source: GitHub Actions)

### Verification

Run the doctor command to confirm the skill installation:

```bash
npx @dzhechkov/skills-edu-site doctor
```

Expected output when everything is in order:

```
Edu-Site Doctor -- Health Check
---
Node.js:        v20.11.0  OK
npm:            10.2.4    OK
Claude Code:    1.x.x     OK
SKILL.md:       present   OK
modules/:       8 files   OK
references/:    5 files   OK
commands/:      1 file    OK
API key:        present   OK (not validated)
---
Status: READY
Run /edu-site "test topic" to verify end-to-end.
```
