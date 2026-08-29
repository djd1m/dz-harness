# Step 4: Deployment

## Purpose

Configure GitHub Pages deployment and create project README.

## Protocol

### 1. Create GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
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
  group: "pages"
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'docs'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Key points:**
- No build step needed — `docs/` is served directly
- `path: 'docs'` points to the static site directory
- `workflow_dispatch` allows manual deploys from GitHub UI
- Concurrency group prevents parallel deploys

### 2. Create README.md

```markdown
# {TITLE}

{DESCRIPTION}

## Live Site

[{TITLE}](https://{username}.github.io/{repo}/)

## Features

- Interactive transcript with section navigation
- Full-text search (Ctrl+K)
- Dark/Light mode
- Reading progress bar
- Mobile-friendly responsive design
- SEO optimized (Open Graph, Twitter Cards, JSON-LD)
{if YouTube:}
- YouTube video embed with timestamp navigation
{/if}

## Source

{if YouTube:}
Original video: [{YOUTUBE_TITLE}]({YOUTUBE_URL})
{/if}

Transcript by {AUTHOR}

## Development

This is a static site — no build step required.
Simply edit `docs/index.html` and push to `main`.

## License

MIT
```

### 3. Repository Settings Reminder

After pushing, remind the user:
```
To enable GitHub Pages:
1. Go to repository Settings → Pages
2. Source: "GitHub Actions" (recommended) or "Deploy from a branch" (main, /docs)
3. The workflow will auto-deploy on next push to main
```

### 4. Alternative: Branch-based Deploy

If the user prefers branch-based deployment instead of Actions:
- Set GitHub Pages source to: branch `main`, folder `/docs`
- The `.github/workflows/deploy.yml` is then optional but still recommended for caching

## Output

Files created:
- `.github/workflows/deploy.yml`
- `README.md`

## Checkpoint

```
Step 4/5: Deployment Complete
Files: .github/workflows/deploy.yml, README.md
Deploy method: GitHub Actions (docs/ folder, zero build)
Live URL: https://{username}.github.io/{repo}/

"ok" to continue | "[feedback]" to adjust
```
