# Step 3: Project Scaffold

## Goal
Create the project skeleton: package.json, vite config, index.html, CSS theme, ESLint.

## Protocol

Read `references/tech-stack.md` for versions and configuration.

### 1. Determine `base` path

```javascript
// Derive from git remote URL
// git remote get-url origin → https://github.com/{user}/{repo}.git
// base = '/{repo}/'
```

If no git remote, ask user for the GitHub repo name.

### 2. Create `package.json`

```json
{
  "name": "{repo-name}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.13.1",
    "zustand": "^5.0.11",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2"
  },
  "devDependencies": {
    "vite": "^7.3.1",
    "@vitejs/plugin-react": "^5.1.1",
    "tailwindcss": "^4.2.1",
    "@tailwindcss/vite": "^4.2.1",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.1.0"
  }
}
```

### 3. Create `vite.config.js`

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/{repo-name}/',
  build: {
    outDir: 'dist',
  },
})
```

### 4. Create `index.html`

- `lang` attribute matches course language
- Title = course title
- SEO meta tags: description, keywords, author
- Open Graph tags: title, description, type, url, image
- Twitter Card meta
- JSON-LD structured data (Course type)
- Favicon (optional)
- `<div id="root"></div>`
- `<script type="module" src="/src/main.jsx"></script>`

### 5. Create `public/robots.txt`

```
User-agent: *
Allow: /
Sitemap: https://{user}.github.io/{repo-name}/sitemap.xml
```

Replace `{user}` and `{repo-name}` with actual GitHub username and repository name.

### 6. Create `public/sitemap.xml`

Generate a sitemap listing all course sections:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://{user}.github.io/{repo-name}/</loc>
    <lastmod>{build-date}</lastmod>
    <priority>1.0</priority>
  </url>
  <!-- One <url> entry per section -->
  <url>
    <loc>https://{user}.github.io/{repo-name}/#section-{id}</loc>
    <lastmod>{build-date}</lastmod>
    <priority>0.8</priority>
  </url>
</urlset>
```

Use ISO 8601 date format for `{build-date}`. Generate one `<url>` entry for each section in the SECTIONS array.

### 7. Create `src/index.css`

TailwindCSS v4 configuration with semantic color tokens:

```css
@import "tailwindcss";

@theme {
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;
  --color-primary-900: #1e3a8a;

  --color-accent-400: #c084fc;
  --color-accent-500: #a855f7;
  --color-accent-600: #9333ea;

  --color-success-400: #4ade80;
  --color-success-500: #22c55e;
  --color-success-600: #16a34a;
  --color-success-700: #15803d;

  --color-danger-400: #f87171;
  --color-danger-500: #ef4444;
  --color-danger-600: #dc2626;
  --color-danger-700: #b91c1c;

  --color-surface: var(--surface);
  --color-card: var(--card);
  --color-text: var(--text);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-border: var(--border);
  --color-border-light: var(--border-light);
  --color-bg-secondary: var(--bg-secondary);
  --color-bg-hover: var(--bg-hover);
}

:root {
  --surface: #f8fafc;
  --card: #ffffff;
  --text: #1e293b;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border: #e2e8f0;
  --border-light: #f1f5f9;
  --bg-secondary: #f1f5f9;
  --bg-hover: #f8fafc;
}

.dark {
  --surface: #0f172a;
  --card: #1e293b;
  --text: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border: #334155;
  --border-light: #1e293b;
  --bg-secondary: #1e293b;
  --bg-hover: #334155;
}

body {
  @apply bg-surface text-text min-h-screen;
}

/* Custom animations */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}
@keyframes bounce-in {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.05); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@utility animate-shake { animation: shake 0.5s ease-in-out; }
@utility animate-bounce-in { animation: bounce-in 0.5s ease-out; }
@utility animate-fade-in-up { animation: fade-in-up 0.3s ease-out; }
```

### 6. Create `eslint.config.js`

Standard React + hooks ESLint config.

### 7. Create `src/main.jsx`

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

### 8. Run `npm install`

Install all dependencies.

### 9. Create directory structure

```
mkdir -p src/{components/{layout,interactive,common,sections,final-test},data,store,hooks,pages}
```

## Checkpoint

```
Step 3/7: Project Scaffold Complete
Base path: /{repo-name}/
Dependencies installed: yes
Files: package.json, vite.config.js, index.html, index.css, main.jsx, eslint.config.js

"ok" to continue | "[feedback]" to adjust
```
