# Tech Stack Reference

## Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.2.0 | UI framework |
| react-dom | ^19.2.0 | DOM rendering |
| react-router-dom | ^7.13.1 | Client-side routing (HashRouter) |
| zustand | ^5.0.11 | State management with persist |
| @dnd-kit/core | ^6.3.1 | Drag-and-drop base |
| @dnd-kit/sortable | ^10.0.0 | Sortable drag-and-drop |
| @dnd-kit/utilities | ^3.2.2 | DnD utility functions |

## Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^7.3.1 | Build tool |
| @vitejs/plugin-react | ^5.1.1 | React support for Vite |
| tailwindcss | ^4.2.1 | CSS framework (v4, CSS-based config) |
| @tailwindcss/vite | ^4.2.1 | TailwindCSS Vite plugin |
| eslint | ^9.39.1 | Linting |
| eslint-plugin-react-hooks | ^7.0.1 | React hooks lint rules |
| eslint-plugin-react-refresh | ^0.4.24 | Fast refresh lint rules |
| globals | ^16.1.0 | Global variable definitions |

## TailwindCSS v4 Notes

- No `tailwind.config.js` — configuration is in CSS via `@theme` directive
- Custom utilities use `@utility` directive (not `@layer utilities`)
- Custom animations defined with `@keyframes` + `@utility animate-*`
- Import: `@import "tailwindcss";` (not individual layers)

## Vite Configuration

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/<repo-name>/',  // CRITICAL for GitHub Pages
})
```

## Routing

**MUST use HashRouter** for GitHub Pages compatibility:
```jsx
import { HashRouter } from 'react-router-dom'
// NOT BrowserRouter — GitHub Pages doesn't support server-side routing
```

## State Persistence

Zustand `persist` middleware with localStorage:
```javascript
import { persist } from 'zustand/middleware'

persist(storeConfig, {
  name: 'unique-storage-key',
  partialize: (state) => ({ /* only persist these fields */ }),
  onRehydrateStorage: () => (state) => {
    // Restore side effects (e.g., dark mode class)
  }
})
```
