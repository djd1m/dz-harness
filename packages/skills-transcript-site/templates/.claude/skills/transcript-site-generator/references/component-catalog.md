# Component Catalog Reference

## HTML Sections (in index.html)

Since this is a static site, "components" are HTML sections within the single `index.html` file. Each section below maps to a distinct HTML block.

### Layout Components

| Component | HTML Element | ID | Description |
|-----------|-------------|-----|-------------|
| Progress Bar | `<div>` | `progress-bar` | Fixed top bar showing scroll progress |
| Header | `<header>` | - | Sticky header with title, stats, dark mode, search |
| Sidebar TOC | `<nav>` | `sidebar` | Fixed sidebar with section links, scroll-spy active state |
| Mobile Menu Button | `<button>` | `menu-toggle` | Hamburger button, visible only on `lg:hidden` |
| Footer | `<footer>` | - | Author credits, video link, date |

### Interactive Components

| Component | HTML Element | ID | Trigger |
|-----------|-------------|-----|---------|
| Search Modal | `<div>` | `search-modal` | Click search button or Ctrl+K |
| Search Input | `<input>` | `search-input` | Auto-focused when modal opens |
| Search Results | `<div>` | `search-results` | Populated by app.js after 2+ chars |
| Theme Toggle | `<button>` | `theme-toggle` | Toggles `dark` class on `<html>` |
| Theme Icon | `<i>` | `theme-icon` | Swaps between `fa-moon` and `fa-sun` |
| Back to Top | `<button>` | `back-to-top` | Appears after 500px scroll |
| Copy Button | `<button>` | - (per section) | Copies section prose to clipboard |
| YouTube Player | `<iframe>` | `yt-player` | Loaded on page, seeked via timestamp clicks |

### Content Components

| Component | HTML Element | ID Pattern | Description |
|-----------|-------------|------------|-------------|
| Transcript Section | `<section>` | `section-{slug}` | One per transcript section |
| Section Title | `<h2>` | - | Includes optional timestamp link |
| Timestamp Link | `<a>` | - | Calls `seekTo(seconds)` on click |
| Speaker Badge | `<span>` | - | Colored badge with speaker name + role |
| Prose Container | `<div class="prose">` | - | Contains rendered transcript paragraphs |
| TOC Link | `<a class="toc-link">` | `data-section="{id}"` | Sidebar link, highlighted by scroll-spy |

## JavaScript Modules (in app.js)

All functionality is in a single `app.js` file, organized into numbered sections:

| # | Module | Key APIs Used | Elements Referenced |
|---|--------|--------------|---------------------|
| 1 | Dark Mode | `localStorage`, `classList` | `#theme-toggle`, `#theme-icon`, `<html>` |
| 2 | Mobile Nav | `classList.toggle` | `#menu-toggle`, `#sidebar` |
| 3 | TOC Scroll-Spy | `IntersectionObserver` | `.toc-link`, `main section[id]` |
| 4 | Progress Bar | `requestAnimationFrame`, `scrollY` | `#progress-bar` |
| 5 | Back to Top | `scrollY`, `scrollTo` | `#back-to-top` |
| 6 | Search Modal | `setTimeout` (debounce), DOM generation | `#search-btn/modal/input/results` |
| 7 | Keyboard Shortcuts | `keydown` event | Ctrl+K, Escape |
| 8 | Copy Quote | `navigator.clipboard.writeText` | `.copy-btn` per section |
| 9 | YouTube Seek | YouTube IFrame Player API (`YT.Player`) + `postMessage` fallback | `#yt-player` |

## CSS Classes (Tailwind)

### Key Custom Classes

| Class | Purpose | Where Used |
|-------|---------|------------|
| `toc-link` | TOC navigation link, targeted by scroll-spy | Sidebar `<a>` elements |
| `copy-btn` | Copy button, icon swap on click | Section copy buttons |
| `no-print` | Hidden in print media | Sidebar, buttons, progress bar |
| `prose` | Tailwind typography styling | Transcript content container |
| `scroll-mt-20` | Scroll margin for sticky header offset | Section elements |
| `line-clamp-1` | Truncate title to single line | Header title |

### Responsive Breakpoints

| Breakpoint | Width | Layout Change |
|-----------|-------|---------------|
| Default | < 1024px | Sidebar hidden, hamburger menu shown |
| `lg:` | >= 1024px | Sidebar visible, hamburger hidden |
| `sm:` | >= 640px | Keyboard shortcut hints shown |

### Dark Mode Classes Pattern

Every visible element follows the pattern:
```
bg-white dark:bg-gray-900
text-gray-900 dark:text-gray-100
border-gray-200 dark:border-gray-700
hover:bg-gray-100 dark:hover:bg-gray-800
```
