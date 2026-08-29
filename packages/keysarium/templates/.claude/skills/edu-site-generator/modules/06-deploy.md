# Step 6: Deployment

## Goal
Configure GitHub Pages auto-deployment via GitHub Actions.

## Protocol

### 1. Create `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build

      - uses: actions/configure-pages@v4
        with:
          enablement: true

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

      - id: deployment
        uses: actions/deploy-pages@v4
```

### 2. Verify `vite.config.js` base path

The `base` must match the GitHub repo name:
- Repo: `https://github.com/user/my-course` -> `base: '/my-course/'`

### 3. Verify `index.html` has correct asset paths

All assets use relative paths (Vite handles this with `base` config).

### 4. Verify HashRouter usage

GitHub Pages serves `index.html` for all routes. HashRouter ensures client-side routing works:
```jsx
import { HashRouter, Routes, Route } from 'react-router-dom'
// NOT BrowserRouter
```

## Important Notes

- `enablement: true` in `actions/configure-pages@v4` auto-enables Pages if not yet configured
- First deployment may take 1-2 minutes to propagate
- If Pages was previously configured for Jekyll, it will be reconfigured for Actions

## Checkpoint

```
Step 6/7: Deployment Complete
Workflow: .github/workflows/deploy.yml
Base path: /{repo-name}/
Router: HashRouter

"ok" to continue | "[feedback]" to adjust
```
