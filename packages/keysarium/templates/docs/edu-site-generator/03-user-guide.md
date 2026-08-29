# User Guide — @dzhechkov/skills-edu-site

This guide covers everything you need to use the edu-site skill pack for Claude Code. It is intended for developers, educators, and content creators who want to generate gamified educational SPA websites from documentation, topics, or raw text — with zero frontend coding required.

---

## Contents

1. [Quick Start (5 minutes)](#1-quick-start-5-minutes)
2. [Input Types](#2-input-types)
3. [The 8-Step Pipeline](#3-the-8-step-pipeline)
4. [Exercise Types Explained](#4-exercise-types-explained)
5. [Gamification Features](#5-gamification-features)
6. [Final Assessment](#6-final-assessment)
7. [Customization Options](#7-customization-options)
8. [Data Files Reference](#8-data-files-reference)
9. [Common Scenarios](#9-common-scenarios)
10. [Tips and Best Practices](#10-tips-and-best-practices)
11. [FAQ](#11-faq)

---

## 1. Quick Start (5 minutes)

Edu-site gives you one primary command that generates a complete educational website:

```
/edu-site [topic, URL, file path, or pasted text]
```

### Your first edu-site run

The fastest way to see edu-site in action is to provide a topic:

```
/edu-site "Introduction to Docker: containers, images, Dockerfile, docker-compose"
```

Within 5-10 minutes, Claude Code will execute an 8-step pipeline and produce a complete project directory:

```
docker-course/
+-- package.json
+-- vite.config.js
+-- index.html
+-- src/
    +-- App.jsx
    +-- data/
    |   +-- sections.js         (5 sections)
    |   +-- exercises.js        (19 exercises, 6 types)
    |   +-- quizQuestions.js    (25 final test questions)
    |   +-- achievements.js    (12 achievements)
    +-- components/
    +-- pages/
    +-- store/
```

To see it live:

```bash
cd docker-course/
npm install
npm run dev
# Open http://localhost:5173
```

### Trigger phrases

The `/edu-site` command responds to various input styles:

```
# Topic description
/edu-site "Learn Python basics: variables, loops, functions, classes"

# Documentation URL
/edu-site https://docs.example.com/api-reference

# Local file
/edu-site ./docs/cli-manual.md

# Direct text (paste documentation into the chat)
/edu-site "Here is the content: [your text]"
```

### What you get

Every edu-site run produces a self-contained React SPA with:

- **Structured learning path** — content organized into progressive sections
- **6 exercise types** — Quiz, Flashcards, Matching, Drag-to-Order, Command Builder, Scenario Game
- **Gamification** — points, achievements, streaks, progress tracking
- **Final assessment** — graded test covering all sections
- **GitHub Pages deployment** — one push to deploy
- **Persistent progress** — localStorage-backed state, survives page refresh

---

## 2. Input Types

Edu-site accepts four types of input. The pipeline automatically detects which type you provided and adjusts the Content Analysis step accordingly.

### 2.1. Documentation URL

```
/edu-site https://docs.docker.com/get-started/
```

The pipeline will:
1. Fetch the page content
2. Follow internal links up to 3 levels deep (configurable)
3. Extract text, code blocks, and headings
4. Discard navigation, footers, and boilerplate

**Best for:** Official documentation, API references, tutorials with multiple pages.

**Limitations:** Sites behind authentication or with aggressive anti-bot protection may not be fetchable. In that case, download the content manually and provide it as a file.

### 2.2. Local file path

```
/edu-site ./docs/git-guide.md
/edu-site /absolute/path/to/manual.txt
```

Supported formats:
- Markdown (`.md`) — best results, preserves structure
- Plain text (`.txt`) — works but loses heading hierarchy
- HTML (`.html`) — parsed and cleaned automatically
- Multiple files — provide a directory path to include all `.md` files

```
/edu-site ./docs/
```

When given a directory, the pipeline reads all markdown files, sorts them alphabetically, and combines them into a single content stream.

### 2.3. Pasted text

Paste documentation content directly into the chat:

```
/edu-site "Here is the documentation for our CLI tool:

## Installation
Run npm install -g my-tool

## Commands
### my-tool init
Initializes a new project...

### my-tool build
Builds the project...
"
```

**Best for:** Quick generation from short documentation, README files, or notes you have on hand.

### 2.4. Topic description

Provide a topic and the pipeline will generate educational content from scratch:

```
/edu-site "Fundamentals of SQL: SELECT, WHERE, JOIN, GROUP BY, subqueries, indexes"
```

When given a topic description (no URL, no file path, no extensive text), the pipeline enters **generative mode** — it creates educational content based on the AI's knowledge of the topic, rather than analyzing existing documentation.

**Best for:** Well-known topics where official documentation is unnecessary. Programming languages, frameworks, design patterns, algorithms.

**Caution:** For niche or proprietary tools, provide actual documentation rather than a topic description. The AI cannot invent accurate details about tools it has not been trained on.

---

## 3. The 8-Step Pipeline

The pipeline runs automatically from start to finish. Here is what happens at each step and what output to expect.

### Step 1: Content Analysis

**What happens:** The pipeline reads your input, detects the language (Russian or English), identifies key topics, extracts terminology, and estimates the scope of the course.

**Expected output:**

```
Step 1/8: Content Analysis
---
Input type: documentation URL
Detected language: en
Content length: 4,200 words
Topics identified: 14
Key concepts: 38
Technical terms: 22
Code examples found: 8
Estimated sections: 5-6
---
Proceeding to Step 2...
```

**What can go wrong:** If the input is too short (under 500 characters), the pipeline will warn you and suggest providing more content. If a URL is unreachable, it will offer alternative input methods.

### Step 2: Course Structure

**What happens:** Topics are organized into a hierarchical structure of sections and subsections. The pipeline determines the learning order, identifies dependencies between topics, and assigns exercise types based on content characteristics.

**Expected output:**

```
Step 2/8: Course Structure
---
Sections planned:

  1. Getting Started
     - Installation (Flashcards)
     - First Project (CommandBuilder)
     - Basic Concepts (Quiz)

  2. Core Commands
     - File Operations (CommandBuilder)
     - Status and Diff (Matching)
     - Commit Workflow (DragToOrder)
     - Undo Changes (ScenarioGame)

  3. Branching
     - Create and Switch (CommandBuilder)
     - Merge Basics (DragToOrder)
     - Conflict Resolution (ScenarioGame)

  4. Remote Repositories
     - Clone and Fork (Flashcards)
     - Push and Pull (CommandBuilder)
     - Pull Requests (ScenarioGame)

  5. Advanced Topics
     - Rebase (DragToOrder)
     - Cherry Pick (Quiz)
     - Stash (Matching)

Total: 5 sections, 15 exercises
---
Proceeding to Step 3...
```

### Step 3: Data Generation

**What happens:** Four JavaScript data files are generated containing all course content: sections with descriptions, exercises with questions and answers, final test questions, and achievements.

**Expected output:**

```
Step 3/8: Data Generation
---
Generated files:
  - src/data/sections.js      (5 sections, 15 subsections)
  - src/data/exercises.js     (15 exercises across 6 types)
  - src/data/quizQuestions.js  (25 questions for final test)
  - src/data/achievements.js  (12 achievements)
---
Proceeding to Step 4...
```

### Step 4: Scaffold

**What happens:** The project skeleton is created: `package.json` with all dependencies, Vite configuration, TailwindCSS v4 setup, `index.html` with SEO tags, GitHub Actions workflow for deployment.

**Expected output:**

```
Step 4/8: Scaffold
---
Created project structure:
  - package.json (React 19, Vite 6, TailwindCSS 4, Zustand 5)
  - vite.config.js (base: /docker-course/)
  - index.html (OG tags, JSON-LD, lang="en")
  - src/app.css (TailwindCSS v4 @theme)
  - src/main.jsx (entry point)
  - .github/workflows/deploy.yml
---
Proceeding to Step 5...
```

### Step 5: Components

**What happens:** All React components are generated — layout (Header, Footer, Sidebar), interactive exercises (6 types), common UI elements (Toast, ProgressBar, Badge), and page components (Home, Section, FinalTest, Results).

**Expected output:**

```
Step 5/8: Components
---
Generated 22 components:
  Layout (4):    Header, Footer, Sidebar, Navigation
  Interactive (6): Quiz, Flashcards, Matching, DragToOrder,
                   CommandBuilder, ScenarioGame
  Common (6):    Toast, ProgressBar, Badge, AchievementPopup,
                 Button, Card
  Pages (4):     HomePage, SectionPage, FinalTestPage, ResultsPage
  Sections (2):  SectionList, ExerciseRenderer
---
Proceeding to Step 6...
```

### Step 6: Gamification

**What happens:** The Zustand store is configured with persist middleware, point calculations are wired to exercise completion, achievement unlock logic is connected, and toast notifications are set up.

**Expected output:**

```
Step 6/8: Gamification
---
Configured:
  - Zustand store (persist -> localStorage)
  - Points: +10 per exercise, +5 streak bonus
  - 12 achievements with criteria
  - Progress tracking per section
  - Toast notifications
  - Streak counter (resets on wrong answer)
---
Proceeding to Step 7...
```

### Step 7: Deploy

**What happens:** A GitHub Actions workflow file is generated that automates building and deploying the site to GitHub Pages on every push to main.

**Expected output:**

```
Step 7/8: Deploy
---
Created:
  - .github/workflows/deploy.yml
  - Vite base path: /docker-course/
  - Build command: npm run build
  - Deploy target: GitHub Pages
---
Proceeding to Step 8...
```

### Step 8: Verification

**What happens:** The pipeline runs automated checks on the generated project to ensure everything is correctly wired.

**Expected output:**

```
Step 8/8: Verification
---
Checks:
  [PASS] All imports resolve (22 components, 4 data files)
  [PASS] Data file structure valid (sections, exercises, quizzes, achievements)
  [PASS] Component hierarchy correct (App -> Router -> Pages -> Layout)
  [PASS] Router configuration valid (4 routes, all point to existing pages)
  [PASS] Build simulation passed (no compilation errors detected)

All 5 checks passed!
---
Generation complete. Your project is at: ./docker-course/
Next steps:
  cd docker-course && npm install && npm run dev
```

---

## 4. Exercise Types Explained

Each exercise type is designed for a specific kind of learning content. The pipeline automatically selects the best type for each topic, but you can override this.

### 4.1. Quiz

**What it is:** A question with 2-4 answer options. The student selects one (or multiple for multi-select). Immediate feedback is provided.

**When it is used:** Testing knowledge of facts, definitions, concepts, or syntax. Best for "what is X" or "which of the following" questions.

**Example:**

```
Question: Which command creates a new Git branch?
  A) git branch new-feature     <- correct
  B) git checkout new-feature
  C) git create new-feature
  D) git new new-feature

[Select answer] -> [Show result + explanation]
```

**Scoring:** +10 points for correct answer, 0 for incorrect.

### 4.2. Flashcards

**What it is:** A card with a question or term on the front side. The student mentally recalls the answer, then flips the card to verify. They mark the card as "Known" or "Review again."

**When it is used:** Memorization of terms, definitions, command syntax, keyboard shortcuts. Effective for vocabulary-style learning.

**Example:**

```
Front: git stash
[Flip card]
Back: Temporarily saves uncommitted changes and reverts
      the working directory to the last commit state.

[I knew it] [Review again]
```

**Scoring:** +10 points per card marked "Known". Cards marked "Review again" can be revisited.

### 4.3. Matching

**What it is:** Two columns of items. The student drags items from the left column to match them with the correct items in the right column.

**When it is used:** Linking related concepts: command to description, term to definition, input to output, flag to behavior.

**Example:**

```
Left column:          Right column:
  git add             Stage changes for commit
  git commit          Record staged changes
  git push            Upload commits to remote
  git pull            Download and merge remote changes
```

**Scoring:** +10 points if all matches are correct. Partial credit: +5 for 75%+ correct.

### 4.4. Drag-to-Order

**What it is:** A list of items displayed in random order. The student reorders them by dragging items into the correct sequence.

**When it is used:** Sequences of steps, priority ordering, lifecycle stages, workflow steps.

**Example:**

```
Put these Git workflow steps in order:
  [ ] Push to remote
  [ ] Stage changes (git add)
  [ ] Make changes to files
  [ ] Create a commit (git commit)

Correct order: Make changes -> Stage -> Commit -> Push
```

**Scoring:** +10 points for fully correct order. +5 for one swap away from correct.

### 4.5. Command Builder

**What it is:** The student assembles a command from individual parts (base command, subcommand, flags, arguments) by selecting or dragging pieces into a command line.

**When it is used:** CLI tools, SQL queries, API requests, shell commands. Any scenario where the student needs to construct a precise command.

**Example:**

```
Build the command to clone a repository with depth 1:

Available parts:
  [git] [clone] [--depth] [1] [--branch] [main] [https://repo.url]

Build area:
  [ git ] [ clone ] [ --depth ] [ 1 ] [ https://repo.url ]

[Check command]
```

**Scoring:** +10 points for exact match. +5 for correct command with extra unnecessary flags.

### 4.6. Scenario Game

**What it is:** A narrative scenario is presented (a situation, a problem, a decision point). The student reads the context and chooses one of 2-4 actions. Each action leads to an outcome with feedback explaining why it was correct or suboptimal.

**When it is used:** Decision-making, troubleshooting, best practices, conflict resolution, real-world application of knowledge.

**Example:**

```
Scenario:
  You are working on a feature branch and your teammate tells you
  that the main branch has critical fixes you need. Your branch
  has 5 uncommitted files.

What do you do?
  A) git merge main (merging into dirty working directory)
  B) git stash && git pull origin main && git stash pop
  C) git commit -a -m "WIP" && git merge main
  D) git checkout main (switching with uncommitted changes)

Best answer: B
Explanation: Stashing saves your work cleanly, lets you update
from main, and restores your changes afterward. Option C creates
an unnecessary WIP commit. Options A and D risk losing changes.
```

**Scoring:** +10 points for the best answer. +5 for acceptable alternative (if marked as such in data).

---

## 5. Gamification Features

### 5.1. Points

Every interaction earns points:

| Action | Points | Condition |
|--------|-------:|-----------|
| Correct exercise answer | +10 | Always |
| Streak bonus | +5 | 3+ correct answers in a row |
| Section completion bonus | +25 | Complete all exercises in a section |
| Achievement unlock | +50 to +200 | Varies by achievement rarity |
| Final test passing | +100 | Score >= 70% |
| Final test perfect | +300 | Score = 100% |

Points are displayed in the Header component and update in real-time as the student progresses.

### 5.2. Achievements

Achievements are unlocked by meeting specific criteria. When an achievement unlocks, a toast notification slides in from the corner with the achievement name, icon, and points earned.

**Achievement rarity tiers:**

| Rarity | Points | Typical criteria |
|--------|-------:|-----------------|
| Common | 50 | Complete first exercise, visit all sections |
| Uncommon | 75 | Complete a section, reach a point milestone |
| Rare | 100 | Perfect score on a section, 10-streak |
| Epic | 150 | Complete all sections, pass final test |
| Legendary | 200 | Perfect final test, unlock all other achievements |

**Sample achievements:**

```
  First Step (Common)       - Complete your first exercise
  Fast Learner (Common)     - Complete 5 exercises
  Streak Master (Rare)      - Get 10 correct answers in a row
  Perfectionist (Rare)      - Score 100% on any section
  Scholar (Epic)            - Complete all sections
  Grand Master (Legendary)  - Score 100% on the final test
```

### 5.3. Progress tracking

Progress is tracked at two levels:

**Section-level progress:** A percentage bar on each section card shows how many exercises have been completed. 100% means all exercises in the section are done.

**Overall progress:** The sidebar (or header on mobile) shows total course progress as a percentage of all exercises completed across all sections.

Progress persists across browser sessions via localStorage (Zustand persist middleware). Clearing browser data resets progress.

### 5.4. Toast notifications

Toasts appear for:
- Achievement unlocked (gold border, achievement icon)
- Section completed (green border, checkmark)
- Streak milestone (blue border, flame icon)
- Points earned (+10, +25, etc.)

Toasts auto-dismiss after 4 seconds. They stack if multiple events fire simultaneously (e.g., completing an exercise that also triggers an achievement).

---

## 6. Final Assessment

### 6.1. How it works

The final test is a timed quiz covering all course sections. Questions are drawn from `quizQuestions.js` and shuffled randomly. Each question has 4 options with one correct answer.

**Flow:**

1. Student navigates to "Final Test" from the navigation menu
2. All questions are presented (no section-by-section breakdown)
3. Student answers each question and can navigate forward/backward
4. Upon submission, answers are graded immediately
5. Results page shows: total score, per-section breakdown, letter grade

### 6.2. Grading

The grading scale:

| Grade | Score range | Label |
|-------|-----------|-------|
| A | 90-100% | Excellent |
| B | 80-89% | Good |
| C | 70-79% | Satisfactory (passing) |
| D | 60-69% | Needs improvement |
| F | 0-59% | Failing |

The default passing threshold is 70% (grade C or higher). This can be configured in the admin settings.

### 6.3. After the test

- Results are saved in the Zustand store (persisted to localStorage)
- The student can retake the test at any time — the latest score replaces the previous one
- If the student passes, the "Final Test Passed" achievement unlocks
- If the student scores 100%, the "Perfect Score" achievement unlocks
- The results page shows which sections had the most incorrect answers, helping the student identify areas for review

---

## 7. Customization Options

### 7.1. Language

```
/edu-site "Docker basics" --lang ru    # Force Russian
/edu-site "Docker basics" --lang en    # Force English
/edu-site "Docker basics"              # Auto-detect
```

Language affects all UI labels, exercise instructions, achievement names, and toast messages.

### 7.2. Theme and color palette

```
/edu-site "Git basics" --palette tech-blue
/edu-site "Git basics" --palette green-learn
/edu-site "Git basics" --palette purple-code
/edu-site "Git basics" --palette warm-orange
/edu-site "Git basics" --palette dark-mode
```

You can also edit `src/app.css` after generation to fully customize the theme via TailwindCSS v4 `@theme` variables.

### 7.3. Exercise types per section

Force specific exercise types for specific sections:

```
/edu-site "Git basics" --exercise-mix "quiz:3,commandbuilder:5,scenario:3"
```

Or let the pipeline choose automatically (default behavior).

### 7.4. Achievement count

```
/edu-site "Git basics" --achievements 8     # Minimal
/edu-site "Git basics" --achievements 20    # Comprehensive
```

Default: 12 achievements.

### 7.5. Base path for deployment

```
/edu-site "Git basics" --base /my-git-course/
```

This sets the Vite `base` configuration for correct asset loading on GitHub Pages.

### 7.6. Output directory

```
/edu-site "Git basics" --output ./my-custom-directory/
```

Default: a directory named after the course topic (kebab-case).

---

## 8. Data Files Reference

The generated project has four data files in `src/data/`. Understanding their structure helps you customize the course after generation.

### 8.1. sections.js

```javascript
export const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Set up your environment and learn the basics.',
    icon: 'rocket',              // emoji or icon name
    order: 1,
    subsections: [
      {
        id: 'installation',
        title: 'Installation',
        content: 'How to install Git on your system...',
      },
      // ...
    ],
  },
  // ...
]
```

### 8.2. exercises.js

```javascript
export const exercises = [
  {
    id: 'ex-001',
    sectionId: 'getting-started',
    type: 'quiz',                  // quiz | flashcards | matching | drag-to-order | command-builder | scenario-game
    title: 'Installation Check',
    data: {
      question: 'Which command verifies Git installation?',
      options: ['git --version', 'git check', 'git verify', 'git status'],
      correctAnswer: 0,
      explanation: 'git --version prints the installed Git version.',
    },
    points: 10,
    order: 1,
  },
  {
    id: 'ex-002',
    sectionId: 'core-commands',
    type: 'command-builder',
    title: 'Build a Clone Command',
    data: {
      instruction: 'Clone a repository with shallow depth of 1',
      parts: ['git', 'clone', '--depth', '1', '--branch', 'main', 'https://github.com/user/repo.git'],
      correctCommand: ['git', 'clone', '--depth', '1', 'https://github.com/user/repo.git'],
      acceptableAlternatives: [
        ['git', 'clone', '--depth', '1', '--branch', 'main', 'https://github.com/user/repo.git'],
      ],
    },
    points: 10,
    order: 1,
  },
  {
    id: 'ex-003',
    sectionId: 'branching',
    type: 'scenario-game',
    title: 'Merge Conflict',
    data: {
      situation: 'You and your colleague both edited the same file. When you pull, Git reports a merge conflict.',
      choices: [
        {
          text: 'Delete your changes and accept theirs',
          outcome: 'This works but you lose your work. Not ideal unless your changes were minor.',
          isOptimal: false,
          points: 5,
        },
        {
          text: 'Open the file, review both versions, and manually resolve the conflict',
          outcome: 'This is the recommended approach. You preserve the best of both changes.',
          isOptimal: true,
          points: 10,
        },
        {
          text: 'Force push your version',
          outcome: 'This overwrites your colleague\'s work without review. Never do this on shared branches.',
          isOptimal: false,
          points: 0,
        },
      ],
    },
    points: 10,
    order: 2,
  },
  // ... more exercises
]
```

### 8.3. quizQuestions.js

```javascript
export const quizQuestions = [
  {
    id: 'fq-001',
    sectionId: 'getting-started',
    question: 'What does git init do?',
    options: [
      'Creates a new Git repository',
      'Initializes a remote connection',
      'Installs Git on your system',
      'Creates a .gitignore file',
    ],
    correctAnswer: 0,
    explanation: 'git init creates a new .git directory in the current folder, initializing a new repository.',
  },
  // ... 15-30 questions
]
```

### 8.4. achievements.js

```javascript
export const achievements = [
  {
    id: 'first-exercise',
    title: 'First Step',
    description: 'Complete your first exercise',
    icon: 'rocket',
    criteria: { type: 'exercise_count', count: 1 },
    points: 50,
    rarity: 'common',
  },
  {
    id: 'streak-10',
    title: 'On Fire',
    description: 'Get 10 correct answers in a row',
    icon: 'fire',
    criteria: { type: 'streak', count: 10 },
    points: 100,
    rarity: 'rare',
  },
  {
    id: 'final-master',
    title: 'Grand Master',
    description: 'Score 100% on the final test',
    icon: 'trophy',
    criteria: { type: 'final_test_perfect' },
    points: 200,
    rarity: 'legendary',
  },
  // ...
]
```

---

## 9. Common Scenarios

### Scenario A: CLI tool documentation

You have a CLI tool with a README or docs site and want to create an interactive training course.

```
/edu-site https://docs.my-tool.dev/getting-started
```

The pipeline will:
1. Fetch and parse the documentation pages
2. Identify commands, flags, and options
3. Generate CommandBuilder exercises for each command
4. Create ScenarioGame exercises for troubleshooting scenarios
5. Add Flashcards for memorizing flag meanings
6. Build a final test with questions from all sections

**Result:** A gamified training site that teaches users your CLI tool interactively.

### Scenario B: API reference

```
/edu-site ./docs/api-reference.md
```

The pipeline adapts to API content by:
- Creating Matching exercises (endpoint -> description)
- Generating Quiz questions about HTTP methods, status codes, authentication
- Building CommandBuilder exercises for API calls (curl commands)
- Adding ScenarioGame for error handling scenarios

### Scenario C: Onboarding course for a new team member

```
/edu-site "Onboarding for Backend Team: our tech stack (Node.js, PostgreSQL, Redis, Docker), coding conventions, PR review process, deployment pipeline, monitoring with Grafana"
```

In generative mode, the pipeline creates educational content from scratch. Ideal for internal training materials where no formal documentation exists.

### Scenario D: Programming tutorial

```
/edu-site "Python for Data Science: pandas DataFrames, data cleaning, visualization with matplotlib, basic statistics, linear regression"
```

The pipeline generates:
- Progressive sections from basics to advanced
- Quiz exercises for theory (statistics concepts)
- CommandBuilder exercises for code construction
- DragToOrder exercises for data processing workflows
- Flashcards for function/method signatures

### Scenario E: Language learning (non-programming)

While designed for technical content, edu-site can work for any factual knowledge:

```
/edu-site "Introduction to Music Theory: notes, scales, chords, rhythm, time signatures, key signatures"
```

Exercises adapt:
- Matching: note name to frequency, chord to its notes
- Quiz: identify intervals, recognize scales
- DragToOrder: arrange notes in a scale
- Flashcards: musical term definitions

---

## 10. Tips and Best Practices

### Provide structured input for best results

The more structured your input, the better the course structure. Markdown with headings produces better section hierarchies than plain text:

```markdown
# Good input (structured)
## Installation
Install with npm install -g my-tool

## Basic Commands
### init
Creates a new project...

### build
Compiles the project...
```

```
# Weaker input (unstructured)
My tool can do init and build. Init creates a project.
Build compiles it. You install with npm.
```

### Keep sections focused

Each section should cover one cohesive topic. If a section spans too many concepts, the exercises become unfocused and less effective. Aim for 3-5 exercises per section.

### Review generated data files

After generation, skim through the data files (`sections.js`, `exercises.js`, `quizQuestions.js`, `achievements.js`). Fix any factual errors, adjust difficulty levels, and add context-specific alternatives for CommandBuilder exercises.

### Test on mobile

The generated site uses TailwindCSS responsive utilities and works on mobile browsers. Check that:
- Navigation collapses properly
- Drag-to-Order and Matching exercises are usable with touch
- Text is readable without horizontal scrolling

### Use the final test as a quality check

Take the final test yourself. If questions are ambiguous, options are too similar, or explanations are unclear, edit `quizQuestions.js` directly. Each question has an `explanation` field — use it to provide helpful context.

### Commit the generated project to git before editing

```bash
cd generated-site/
git init
git add .
git commit -m "initial generation"
```

This gives you a clean baseline to diff against after manual edits.

### Choose the right exercise type for the content

| Content type | Best exercise types |
|-------------|-------------------|
| Definitions, terminology | Flashcards, Quiz |
| CLI commands, syntax | CommandBuilder |
| Step-by-step processes | DragToOrder |
| Concept relationships | Matching |
| Decision-making, best practices | ScenarioGame |
| Multiple-choice knowledge checks | Quiz |

---

## 11. FAQ

### Q: How long does generation take?

Approximately 5-10 minutes for a typical course (5-8 sections, 15-25 exercises). Larger inputs with more topics may take up to 15 minutes.

### Q: Can I edit the generated site after creation?

Yes. The generated project is a standard React + Vite project. Edit any file — components, data, styles — using your preferred editor. Run `npm run dev` to see changes instantly with hot module replacement.

### Q: Does the site require a backend server?

No. The generated site is a fully static SPA. All content is embedded in JavaScript data files. No API calls are made at runtime. After `npm run build`, the `dist/` directory can be served by any static file server.

### Q: Can I add my own exercises after generation?

Yes. Add entries to `src/data/exercises.js` following the existing format. Each exercise must have a unique `id`, a valid `sectionId` matching a section in `sections.js`, and a `type` matching one of the six supported types. The `ExerciseRenderer` component will automatically render the new exercise.

### Q: How do I change the passing score for the final test?

Edit `src/pages/FinalTestPage.jsx`. Find the constant `PASSING_THRESHOLD` (default: `0.7` for 70%) and change it to your preferred value.

### Q: Can I deploy to Vercel or Netlify instead of GitHub Pages?

Yes. The generated project builds to a standard `dist/` directory. For Vercel or Netlify:
1. Set `base: '/'` in `vite.config.js` (not the GitHub Pages repo name)
2. Connect your repository to Vercel/Netlify
3. Set build command: `npm run build`
4. Set output directory: `dist`

### Q: What browsers are supported?

Modern browsers supporting ES2020+: Chrome 80+, Firefox 80+, Safari 14+, Edge 80+. No IE11 support.

### Q: Can I generate a course in a language other than English or Russian?

The pipeline auto-detects English and Russian. For other languages, provide content in the desired language and set `--lang en` or `--lang ru` for UI elements. The exercises and content will use whatever language you provided; only the UI chrome (buttons, labels) will be in the specified language.

### Q: How do I reset student progress?

Students can clear their progress by clearing localStorage in their browser (Developer Tools > Application > Local Storage > delete `edu-site-storage`). Alternatively, add a "Reset Progress" button to the settings page by wiring it to the `resetProgress` action in the Zustand store.

### Q: Can I use TypeScript instead of JavaScript?

The default generation uses `.jsx` files. TypeScript support can be added by renaming files to `.tsx`, adding a `tsconfig.json`, and installing TypeScript dependencies. This is a manual post-generation step.

### Q: The generated site has a factual error in an exercise. How do I fix it?

Edit the corresponding entry in `src/data/exercises.js`. Find the exercise by its `id` or `title`, correct the data (question text, answer options, correct answer index, explanation), save, and the change takes effect immediately in dev mode.

### Q: Can I add images to the exercises?

The default exercise types are text-based. To add images, modify the exercise data to include image URLs and update the corresponding exercise component to render `<img>` tags. Images should be placed in the `public/` directory for static serving.

### Q: How much does the generated site weigh?

The production build is typically 80-160 KB gzipped, depending on content volume. This includes React, Zustand, TailwindCSS (tree-shaken), and all application code plus data. It loads in under 2 seconds on broadband connections.
