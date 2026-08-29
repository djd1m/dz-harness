# Step 5: Verification

## Purpose

Validate the generated static site for correctness, completeness, and quality.

## Protocol

### 1. File Existence Checks

| File | Required | Check |
|------|----------|-------|
| `docs/index.html` | Yes | Exists, > 10 KB |
| `docs/static/app.js` | Yes | Exists, > 5 KB |
| `docs/static/style.css` | Yes | Exists |
| `.github/workflows/deploy.yml` | Yes | Exists |
| `README.md` | Yes | Exists |

### 2. HTML Structure Validation

Check `docs/index.html` for:

- [ ] `<!DOCTYPE html>` declaration present
- [ ] `<html lang="...">` with correct language attribute
- [ ] `<meta charset="UTF-8">` present
- [ ] `<meta name="viewport">` present (mobile responsive)
- [ ] `<title>` tag not empty
- [ ] `<meta name="description">` present and not empty
- [ ] Open Graph meta tags present (`og:title`, `og:description`, `og:type`)
- [ ] Twitter Card meta tags present (`twitter:card`, `twitter:title`)
- [ ] JSON-LD `<script type="application/ld+json">` present with valid structure
- [ ] Tailwind CSS CDN script tag present
- [ ] Font Awesome CDN link present
- [ ] `<script src="static/app.js">` present at end of body
- [ ] `<link rel="stylesheet" href="static/style.css">` present in head

### 3. Content Validation

- [ ] All sections have unique `id` attributes
- [ ] Section count matches parsed section count from Step 1
- [ ] TOC links match section IDs (one `<a data-section="...">` per section)
- [ ] No empty sections (each section has text content)
- [ ] No unescaped HTML entities in transcript text
- [ ] No `{placeholder}` or `[TODO]` text remaining

### 4. Interactivity Validation

Check `docs/static/app.js` for:

- [ ] `DOMContentLoaded` event listener wraps all code
- [ ] Theme toggle references `#theme-toggle` and `#theme-icon`
- [ ] Search references `#search-btn`, `#search-modal`, `#search-input`, `#search-results`
- [ ] TOC scroll-spy uses `IntersectionObserver`
- [ ] Progress bar references `#progress-bar`
- [ ] Back-to-top references `#back-to-top`
- [ ] Event delegation for `[data-copy]` elements (copy via data attributes, no inline onclick)
- [ ] `escapeHtml` function present (XSS prevention)
- [ ] `escapeRegex` function present (search regex injection prevention)
- [ ] `highlightText` function uses string comparison (not regex.test with /g flag)
- [ ] If YouTube: `seekTo` function defined at top level (before DOMContentLoaded)
- [ ] If YouTube: event delegation for `[data-seek]` elements (no inline onclick)
- [ ] If YouTube: `onYouTubeIframeAPIReady` callback defined
- [ ] No syntax errors (can validate with `node --check docs/static/app.js`)

### 4b. Accessibility Validation

- [ ] Skip-nav link (`<a href="#main-content">`) present before header
- [ ] `<header>` has `role="banner"`
- [ ] `<main>` has `role="main"` and `id="main-content"`
- [ ] `<nav>` sidebar has `aria-label`
- [ ] Search modal has `role="dialog"` and `aria-modal="true"`
- [ ] Icon-only buttons have accessible text (`aria-label` or visible label)

### 5. Responsive Design Checks

- [ ] Mobile menu button has `lg:hidden` class
- [ ] Sidebar has `lg:translate-x-0` and `-translate-x-full` for toggle
- [ ] Content area uses `flex-1 min-w-0` to prevent overflow
- [ ] YouTube embed uses `aspect-video` for responsive sizing
- [ ] Touch targets are at least `p-2` (minimum 44px tap area)
- [ ] Text is readable without horizontal scrolling on 320px width

### 6. Dark Mode Checks

- [ ] `<html>` has `class` attribute (not `data-theme`) for Tailwind dark mode
- [ ] All `bg-white` have corresponding `dark:bg-gray-900` (or similar)
- [ ] All `text-gray-900` have corresponding `dark:text-gray-100` (or similar)
- [ ] Search modal has dark variants
- [ ] TOC active state has dark variants
- [ ] Tailwind config has `darkMode: 'class'`

### 7. SEO Checks

- [ ] `og:title` matches `<title>`
- [ ] `og:description` matches `<meta name="description">`
- [ ] JSON-LD `headline` matches title
- [ ] JSON-LD `wordCount` is a number > 0
- [ ] If YouTube: `og:image` points to valid YouTube thumbnail URL
- [ ] If YouTube: VideoObject JSON-LD includes `embedUrl`

### 8. Print Checks

- [ ] `style.css` has `@media print` rules
- [ ] `.no-print` class hides navigation, progress bar, buttons
- [ ] Print colors are black on white (overrides dark mode)
- [ ] Section breaks avoid splitting mid-content

### 9. Syntax Validation

```bash
# Validate JS syntax
node --check docs/static/app.js

# Check HTML is well-formed (basic check)
grep -c '</html>' docs/index.html  # Should be 1
```

### 10. Browser Preview (Optional)

If a local server is available:
```bash
cd docs && python3 -m http.server 8080 &
echo "Preview at http://localhost:8080"
```

## Error Recovery

| Error | Fix |
|-------|-----|
| Missing section IDs | Regenerate sections with `id="section-{slug}"` |
| TOC/section mismatch | Rebuild TOC links from actual section elements |
| JS syntax error | Fix the specific error, re-validate |
| Missing dark mode classes | Add `dark:` variant for every light class |
| Broken YouTube embed | Verify VIDEO_ID format (11 chars), check URL encoding |
| HTML entities in content | Run through `escapeHtml()` |

## Output

Verification report:
```
Step 5/5: Verification Complete

File checks: {N}/{N} passed
HTML structure: {N}/{N} passed
Content: {N}/{N} passed
Interactivity: {N}/{N} passed
Responsive: {N}/{N} passed
Dark mode: {N}/{N} passed
SEO: {N}/{N} passed
Print: {N}/{N} passed

Site ready for deployment!
Push to main to trigger GitHub Pages deploy.
Live URL: https://{username}.github.io/{repo}/
```
