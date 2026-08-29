---
name: edu-site-generator
description: >
  Generate a complete gamified educational single-page app from documentation or content,
  optimized for GitHub Pages deployment. Produces a learning site with modules, interactive
  examples, and progress mechanics. Triggers on "generate edu site from [docs]", "create
  learning site [topic]", "build educational app [topic]".
trust_tier: 1
---

# edu-site-generator — Gamified Educational Site Generator

<!-- Trust Tier: 1 — Structured | Path to Tier 2: run a BTO evaluation (see the skills-bto package) -->

> Generate a complete gamified educational SPA from documentation/content, optimized for GitHub Pages deployment.

## When To Activate

Trigger on:
- "generate edu site from [docs]"
- "create learning site [topic]"
- "build educational app [topic]"
- "gamified site from documentation"
- `/edu-site-generator [topic or docs path]`

## Overview

This skill takes documentation, guides, or structured content and produces a fully functional interactive educational single-page application with:

- **6 exercise types:** Quiz, Flashcards (toggle flip), Matching, Drag-to-Order, Command Builder, Scenario Game
- **Gamification:** Points, achievements, progress tracking, toast notifications
- **Final assessment:** Comprehensive test with per-section results
- **Dark mode** + responsive design + **swipe gesture navigation** on mobile
- **SEO optimized:** meta tags, Open Graph, Twitter Cards, JSON-LD, **sitemap.xml**, **robots.txt**
- **GitHub Pages** auto-deployment via GitHub Actions
- **localStorage** persistence for progress

## Architecture

```
.claude/skills/edu-site-generator/
├── SKILL.md                           <- This file (orchestrator)
├── modules/
│   ├── 00-content-analysis.md         <- Step 0: Analyze source docs
│   ├── 01-course-structure.md         <- Step 1: Split into sections + pick exercise types
│   ├── 02-data-generation.md          <- Step 2: Generate all data files
│   ├── 03-scaffold.md                 <- Step 3: Project scaffold + config
│   ├── 04-components.md               <- Step 4: Generate components
│   ├── 05-gamification.md             <- Step 5: Achievements + progress
│   ├── 06-deploy.md                   <- Step 6: GitHub Pages deployment
│   └── 07-verification.md            <- Step 7: Build + verify
├── references/
│   ├── tech-stack.md                  <- Stack versions and config
│   ├── data-schemas.md                <- All data structure schemas
│   ├── exercise-catalog.md            <- Exercise type descriptions + when to use
│   └── component-templates.md         <- Code templates for all components
└── examples/
    └── sample-course-structure.md     <- Example output for a 5-section course
```

## Pipeline

```
Step 0          Step 1            Step 2          Step 3
ANALYZE    ->  STRUCTURE    ->  DATA GEN    ->  SCAFFOLD
(read docs)   (sections +      (sections.js    (vite + tailwind
               exercise types)  exercises.js    + packages)
                                quizzes.js
                                achievements.js)
     |
     v
Step 4          Step 5           Step 6          Step 7
COMPONENTS  ->  GAMIFICATION ->  DEPLOY    ->   VERIFY
(layout +       (achievements   (GH Actions     (npm run build
 sections +      + progress      workflow +       + check)
 interactive)    + store)        index.html)
```

## Input Requirements

The skill accepts one of:
1. **Documentation URL(s)** — fetched and parsed
2. **Local file path(s)** — read directly
3. **Pasted text** — used as-is
4. **Topic description** — generates content from knowledge

Minimum: enough content for 3 sections. Maximum recommended: 20 sections.

## Output

A complete, deployable SPA in the current repository:

```
<project-root>/
├── .github/workflows/deploy.yml
├── index.html                    (SEO meta, OG tags, JSON-LD)
├── vite.config.js
├── package.json
├── eslint.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css                 (TailwindCSS v4 + theme tokens)
│   ├── data/
│   │   ├── sections.js
│   │   ├── exercises.js
│   │   ├── quizQuestions.js
│   │   └── achievements.js
│   ├── store/
│   │   └── useAppStore.js
│   ├── hooks/
│   │   ├── useProgress.js
│   │   └── useAchievements.js
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   ├── Footer.jsx
│   │   │   ├── Navigation.jsx
│   │   │   ├── ProgressBar.jsx
│   │   │   └── SectionLayout.jsx
│   │   ├── interactive/
│   │   │   ├── Quiz.jsx
│   │   │   ├── Flashcard.jsx
│   │   │   ├── MatchingExercise.jsx
│   │   │   ├── DragOrder.jsx
│   │   │   ├── CommandBuilder.jsx
│   │   │   └── ScenarioGame.jsx
│   │   ├── common/
│   │   │   ├── Accordion.jsx
│   │   │   ├── AchievementsPanel.jsx
│   │   │   └── Toast.jsx
│   │   ├── final-test/
│   │   │   ├── FinalTest.jsx
│   │   │   └── TestResults.jsx
│   │   └── sections/
│   │       └── Section1..N.jsx
│   └── pages/
│       ├── HomePage.jsx
│       └── FinalTestPage.jsx
└── public/
```

## Execution Protocol

### Step 0: Content Analysis
```
Read: modules/00-content-analysis.md
```
- Read/fetch source documentation
- Identify distinct topics/concepts
- Estimate section count
- Determine language (Russian/English)
- **Output:** Topic list with descriptions

### Step 1: Course Structure
```
Read: modules/01-course-structure.md
Read: references/exercise-catalog.md
```
- Split content into 3-20 sections
- Assign exercise type per section based on content nature
- Define section order (simple -> complex)
- Write theory text per section
- **Output:** Section definitions + exercise assignments

### Step 2: Data Generation
```
Read: modules/02-data-generation.md
Read: references/data-schemas.md
```
- Generate `sections.js` with all section metadata
- Generate `exercises.js` with exercise data per type
- Generate `quizQuestions.js` with per-section quizzes + final test
- Generate `achievements.js` with course-specific achievements
- **Output:** All 4 data files

### Step 3: Project Scaffold
```
Read: modules/03-scaffold.md
Read: references/tech-stack.md
```
- Initialize package.json with dependencies
- Create vite.config.js with correct `base` path
- Create index.html with SEO meta
- Create index.css with TailwindCSS v4 theme
- Create eslint.config.js
- Run `npm install`
- **Output:** Buildable project skeleton

### Step 4: Components
```
Read: modules/04-components.md
Read: references/component-templates.md
```
- Generate layout components (Header, Footer, Navigation, etc.)
- Generate interactive components (all 6 types)
- Generate section components (one per section)
- Generate page components (Home, FinalTest)
- Generate common components (Accordion, Toast, AchievementsPanel)
- **Output:** All JSX components

### Step 5: Gamification
```
Read: modules/05-gamification.md
```
- Generate Zustand store with persist middleware
- Generate useProgress hook
- Generate useAchievements hook
- Wire up Toast notifications
- **Output:** State management + gamification logic

### Step 6: Deployment
```
Read: modules/06-deploy.md
```
- Create `.github/workflows/deploy.yml`
- Configure GitHub Pages in workflow
- Set correct `base` in vite.config.js
- **Output:** CI/CD pipeline

### Step 7: Verification
```
Read: modules/07-verification.md
```
- Run `npm run build`
- Verify no build errors
- Check all imports resolve
- Verify section count matches data
- **Output:** Build success confirmation

## Customization Points

| Parameter | Default | Description |
|-----------|---------|-------------|
| Language | auto-detect | UI language (ru/en) |
| Repo name | from git remote | For `base` path in vite |
| Theme colors | Blue primary | Primary color palette |
| Exercise types | auto-assigned | Override per section |
| Achievement count | ~8-12 | Based on section count |
| Final test | yes | Include final assessment |
| FAQ section | yes | Include FAQ at bottom |
| Footer link | none | Optional social/channel link |

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Too few sections (<3) | Not enough content for gamification | Combine with more docs or split deeper |
| All same exercise type | Monotonous UX | Vary types based on content nature |
| Theory too long | >500 words per section | Split into subsections or use accordion |
| Quiz questions too easy | All obvious answers | Include plausible distractors |
| No wrong-answer feedback | Just "wrong" message | Add explanations to quiz answers |
| Hardcoded content | Content in JSX instead of data/ | All content must live in data/ files |
| Missing dark mode | No .dark CSS vars | Always include dark theme tokens |
| Wrong base path | 404 on GitHub Pages | Derive from repo name |

## Checkpoint Protocol

After each step, output:
```
Step N/7: [Name] Complete
Artifacts: [list]
"ok" to continue | "[feedback]" to adjust
```
