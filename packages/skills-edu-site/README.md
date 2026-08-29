# @dzhechkov/skills-edu-site

**Gamified Educational Site Generator skill pack for Claude Code**

Transform documentation, guides, and knowledge bases into interactive learning SPAs with quizzes, flashcards, achievements, progress tracking, and GitHub Pages deployment. Part of the [Keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium) ecosystem.

---

## Quick Start

```bash
# One-command install via npx
npx @dzhechkov/skills-edu-site

# Or install globally
npm install -g @dzhechkov/skills-edu-site
skills-edu-site init

# Install into a project that already has @dzhechkov/keysarium
npx @dzhechkov/skills-edu-site init
```

After installation, open Claude Code in your project directory and run `/edu-site-generator [topic or docs path]` (the skill registers under its directory name, `edu-site-generator`).

---

## What You Get

| Component | Count | Description |
|-----------|-------|-------------|
| **Skill** | 1 | `edu-site-generator` -- core skill with 8 pipeline modules |
| **Modules** | 8 | Steps 00-07: Content Analysis through Verification |
| **References** | 4 | Component templates, data schemas, exercise catalog, tech stack specs |
| **Examples** | 1 | Sample generated site structure |

All skill files are installed into your project's `.claude/skills/edu-site-generator/` directory and work natively with Claude Code. In addition, a small install manifest (`.skills-edu-site.json`) is written to the project root — `update`, `remove`, `list`, and `doctor` rely on it, so keep it alongside the skill.

---

## Commands

```bash
npx @dzhechkov/skills-edu-site                    # Full install (same as init, no prompts)
npx @dzhechkov/skills-edu-site init               # Install skill pack
npx @dzhechkov/skills-edu-site init --force       # Overwrite existing files
npx @dzhechkov/skills-edu-site init --dry-run     # Preview without making changes
npx @dzhechkov/skills-edu-site update             # Sync installed files with this package's bundled templates
npx @dzhechkov/skills-edu-site remove             # Clean uninstall (asks for confirmation)
npx @dzhechkov/skills-edu-site remove --force     # Non-interactive uninstall for CI/pipes
npx @dzhechkov/skills-edu-site list               # Show installed components
npx @dzhechkov/skills-edu-site doctor             # Health check
```

Notes:

- `update` compares your installed files against the templates bundled with the CLI version you are running — it performs no network/registry check. Run it via `npx @dzhechkov/skills-edu-site@latest update` to sync against the newest published release; a stale global install will only ever offer its own bundled version.
- `remove` in automation: when stdin is not a TTY (CI, pipes) and `--force` is absent, `remove` refuses with an error and exit code 1 instead of silently doing nothing (MEASURED — reproducer: `printf '' | node bin/cli.js remove; echo $?` in an installed dir → exit 1, all files still present; `printf '' | node bin/cli.js remove --force` → removes the pack, exit 0).

---

## Pipeline

One step per shipped module (`modules/00-content-analysis.md` … `modules/07-verification.md`):

```
Step 00          Step 01          Step 02          Step 03
CONTENT      --> COURSE       --> DATA         --> SCAFFOLD
ANALYSIS         STRUCTURE        GENERATION       PROJECT
Analyze          Design           Generate         Create
source docs      modules          exercise JSON    React+Vite SPA
                                                       |
                                                       v
Step 04          Step 05          Step 06          Step 07
COMPONENT    --> GAMIFICATION --> DEPLOY       --> VERIFICATION
GENERATION       LAYER            CONFIG           & QA
Create UI +      Add quizzes,     GitHub Pages     Test and
exercise         flashcards,      deployment       validate
components       achievements     setup            output
```

### Usage in Claude Code

```bash
# Generate an educational site from documentation
/edu-site-generator ./docs/api-reference.md

# Generate from a topic description
/edu-site-generator "Kubernetes fundamentals for developers"

# Generate from multiple source files
/edu-site-generator ./docs/
```

---

## Features

- **6 Exercise Types** -- Interactive learning activities with instant feedback
- **Achievement System** -- Unlock badges and track mastery across modules
- **Progress Tracking** -- Persistent state with Zustand, per-module completion
- **Dark Mode** -- Full dark/light theme toggle with system preference detection
- **Final Assessment** -- Comprehensive test covering all modules
- **Responsive Design** -- Mobile-first, works on all screen sizes
- **SEO Optimized** -- Meta tags, Open Graph, structured data

---

## Exercise Types

| Type | Description |
|------|-------------|
| **Quiz** | Multiple-choice and true/false questions with explanations |
| **Flashcards** | Flip-card interface for concept memorization |
| **Matching** | Drag-and-drop term-to-definition matching |
| **Drag-to-Order** | Arrange items in correct sequence (steps, priorities) |
| **Command Builder** | Construct CLI commands or code snippets from parts |
| **Scenario Game** | Decision-tree scenarios with branching outcomes |

Each exercise type supports difficulty levels, hints, and detailed explanations.

---

## Output Structure

The generated project is a complete SPA ready for deployment:

```
edu-site-output/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── exercises/          # 6 exercise type components
│   │   ├── layout/             # Header, Footer, Sidebar, ThemeToggle
│   │   ├── gamification/       # Achievements, ProgressBar, ScoreBoard
│   │   └── assessment/         # FinalAssessment component
│   ├── data/
│   │   ├── modules.json        # Course structure and content
│   │   ├── exercises.json      # All exercise data
│   │   └── achievements.json   # Achievement definitions
│   ├── stores/
│   │   └── useProgress.js      # Zustand progress store
│   ├── pages/
│   │   ├── Home.jsx
│   │   ├── Module.jsx
│   │   └── Assessment.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css               # TailwindCSS v4 styles
├── index.html
├── package.json
└── vite.config.js
```

There is no `tailwind.config.js` — the project uses TailwindCSS v4, where configuration lives in CSS via the `@theme` directive (see the bundled `references/tech-stack.md`).

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19 | UI framework |
| **Vite** | Latest | Build tool and dev server |
| **TailwindCSS** | v4 | Utility-first CSS framework |
| **Zustand** | Latest | Lightweight state management |
| **React Router** | v7 | Client-side routing |

---

## Integration with Keysarium

Edu Site Generator works standalone but integrates seamlessly with `@dzhechkov/keysarium`:

```bash
# Install Keysarium first (optional)
npx @dzhechkov/keysarium init

# Then add Edu Site -- it detects Keysarium automatically
npx @dzhechkov/skills-edu-site init
```

When installed alongside Keysarium, the edu-site-generator skill is available as part of the full Keysarium toolkit and can generate educational sites from research artifacts produced by the Casarium pipeline.

---

## Requirements

- **Claude Code CLI** -- installed and configured ([installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **Node.js >= 16.0.0** -- required for the npm install method
- **npm** -- required to build the generated project (`npm install && npm run dev`)

---

## License

[MIT](https://opensource.org/licenses/MIT)

---

## Links

- **GitHub:** [https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/skills-edu-site](https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/skills-edu-site)
- **Issues:** [https://github.com/djd1m/dz-harness-hub/issues](https://github.com/djd1m/dz-harness-hub/issues)
- **npm:** [https://www.npmjs.com/package/@dzhechkov/skills-edu-site](https://www.npmjs.com/package/@dzhechkov/skills-edu-site)
- **Keysarium:** [https://www.npmjs.com/package/@dzhechkov/keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium)
