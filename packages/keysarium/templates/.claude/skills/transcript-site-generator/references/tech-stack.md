# Tech Stack Reference

## Static Site Architecture (Default)

The transcript site is a pure static site with zero build step. This architecture was chosen for maximum simplicity and instant deployment.

### Core Stack

| Technology | Version | Role | Delivery |
|-----------|---------|------|----------|
| HTML5 | - | Page structure, semantic markup | Inline |
| Tailwind CSS | 3.x (CDN) | Utility-first styling, dark mode, responsive | CDN: `cdn.tailwindcss.com` |
| Vanilla JavaScript | ES2020+ | All interactivity | `docs/static/app.js` |
| Font Awesome | 6.5.x | Icons (moon, sun, search, copy, bars, arrow-up, youtube) | CDN: `cdnjs.cloudflare.com` |

### Why Static (Not React/Vite)?

| Criterion | Static HTML | React + Vite SPA |
|-----------|------------|-------------------|
| Build step | None | Required (npm install + npm run build) |
| Deploy complexity | Push `docs/` | Build + deploy `dist/` |
| Dependencies | 0 | 15+ npm packages |
| Load time | Instant (single file) | Initial bundle load |
| Maintenance | Zero | Dependency updates |
| GitHub Pages setup | Trivial (serve docs/) | Needs workflow |
| File count | 3 files | 30+ files |
| Searchability | Full HTML content | JavaScript-rendered |
| SEO | Native | Requires SSR/prerender |

**Bottom line:** For a read-only transcript site, static HTML is superior in every dimension.

### CDN Links (Development Default)

> **Note:** `cdn.tailwindcss.com` is the Tailwind Play CDN intended for development and prototyping.
> It works well for transcript sites (read-only, low-traffic), but is NOT recommended by the
> Tailwind team for high-traffic production use. For production hardening, see the self-hosted
> alternative below.

```html
<!-- Tailwind CSS (Play CDN — development/prototyping) -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Font Awesome (with SRI hash) -->
<link rel="stylesheet"
  href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
  integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="
  crossorigin="anonymous" referrerpolicy="no-referrer" />
```

### Self-Hosted Tailwind Alternative (Production)

For high-traffic or offline-capable deployments, replace the Play CDN with a pre-built CSS file:

```bash
# Install Tailwind CLI (one-time, no npm project needed)
curl -sLO https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-linux-x64
chmod +x tailwindcss-linux-x64

# Generate minified CSS from index.html
./tailwindcss-linux-x64 -i /dev/null -o docs/static/tailwind.min.css --content docs/index.html --minify
```

Then in `index.html`, replace the CDN script with:
```html
<link rel="stylesheet" href="static/tailwind.min.css" />
```

The user can request this mode via: "use self-hosted Tailwind" or "make it work offline".

### Tailwind Configuration

```javascript
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81', 950: '#1e1b4b'
        }
      }
    }
  }
}
```

### Browser Support

- Chrome 80+, Firefox 78+, Safari 14+, Edge 80+
- `IntersectionObserver`: supported in all modern browsers
- `navigator.clipboard.writeText`: requires HTTPS (works on GitHub Pages)
- `backdrop-filter: blur()`: Safari 14+, Chrome 76+

### YouTube Integration

- Embed via `<iframe>` with `enablejsapi=1` parameter
- Timestamp seeking via YouTube IFrame Player API (`YT.Player` + `seekTo()`)
- Fallback: `postMessage` to iframe if IFrame API hasn't loaded yet
- Thumbnail URL pattern: `https://img.youtube.com/vi/{VIDEO_ID}/maxresdefault.jpg`

### CDN Availability Note

The site depends on external CDNs (Tailwind CSS, Font Awesome). If CDNs are unavailable (corporate firewalls, offline):
- Content remains fully readable (semantic HTML)
- Layout will be unstyled but functional
- Icons will not display (consider adding `aria-label` on icon-only buttons as fallback)

### Optional: yt-dlp

For extracting transcripts from YouTube videos:
```bash
pip install yt-dlp

# Extract subtitles
yt-dlp --write-auto-sub --sub-lang ru,en --skip-download --sub-format vtt -o "transcript" "<URL>"

# Get video metadata
yt-dlp --print title --print channel --print duration --skip-download "<URL>"
```

### Output File Sizes (Typical)

| File | Size | Content |
|------|------|---------|
| `docs/index.html` | 50-150 KB | All HTML + inline content |
| `docs/static/app.js` | 10-12 KB | All JavaScript |
| `docs/static/style.css` | 0.5 KB | Print styles + overrides |
| **Total** | **60-165 KB** | **Before CDN resources** |

CDN resources are cached by the browser after first load.
