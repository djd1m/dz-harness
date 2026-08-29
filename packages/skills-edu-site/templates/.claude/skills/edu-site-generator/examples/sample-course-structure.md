# Example: 5-Section Course on "Git Best Practices"

## Step 0 Output: Content Analysis

```
Language: en
Course Title: Git Best Practices
Course Description: 5 essential Git practices for productive collaboration

Topics:
1. Commit Messages — writing clear, meaningful commits
2. Branching Strategy — when to branch and naming conventions
3. Code Review — effective PR review workflow
4. Merge vs Rebase — choosing the right integration strategy
5. Git Hooks — automating quality checks
```

## Step 1 Output: Course Structure

| # | Icon | Title | Short Title | Exercise Type |
|---|------|-------|-------------|---------------|
| 1 | "message icon" | 1. Writing Good Commit Messages | Commit Messages | quiz |
| 2 | "branch icon" | 2. Branching Strategy | Branching | flashcards |
| 3 | "review icon" | 3. Effective Code Review | Code Review | matching |
| 4 | "merge icon" | 4. Merge vs Rebase | Merge/Rebase | scenario |
| 5 | "hook icon" | 5. Git Hooks for Quality | Git Hooks | drag-and-drop |

## Step 2 Output: Data Files

### sections.js (excerpt)
```javascript
export const SECTIONS = [
  {
    id: 'commit-messages',
    order: 1,
    title: '1. Writing Good Commit Messages',
    shortTitle: 'Commit Messages',
    description: 'Learn to write clear, meaningful commit messages',
    icon: 'icon',
    interactiveType: 'quiz',
    theory: `A good commit message explains WHY a change was made...`
  },
  // ... 4 more sections
]
export const TOTAL_SECTIONS = 5
```

### quizQuestions.js (excerpt)
```javascript
export const quizQuestions = {
  'commit-messages': [
    {
      id: 'cm-q1',
      question: 'What should the first line of a commit message contain?',
      options: [
        'The full diff of changes',
        'A concise summary of the change (50 chars or less)',
        'The ticket number only',
        'The author name and date'
      ],
      correctAnswer: 1,
      explanation: 'The first line should be a brief summary...'
    },
    // ... more questions
  ]
}

export const finalTestQuestions = [
  {
    id: 'final-commit-messages',
    sectionId: 'commit-messages',
    question: 'Which commit message follows best practices?',
    options: ['fix', 'Fix login redirect for OAuth users', 'fixed stuff', 'WIP'],
    correctAnswer: 1
  },
  // ... one per section
]
```

### achievements.js (excerpt)
```javascript
export const ACHIEVEMENTS = [
  {
    id: 'first-step',
    title: 'First Commit',
    description: 'Complete your first section',
    icon: 'icon',
    condition: (s) => Object.keys(s.completedSections).length >= 1
  },
  {
    id: 'halfway',
    title: 'Branch Out',
    description: 'Complete 3 of 5 sections',
    icon: 'icon',
    condition: (s) => Object.keys(s.completedSections).length >= 3
  },
  {
    id: 'merge-master',
    title: 'Merge Master',
    description: 'Complete the Merge/Rebase section',
    icon: 'icon',
    condition: (s) => s.completedSections['merge-rebase']
  },
  // ... more achievements
]
```

## Final Output

- 5 sections with varied exercise types
- 10+ quiz questions across quiz sections
- 5 final test questions
- 8 achievements
- Full SPA with Header, Navigation, Progress, Dark Mode
- GitHub Pages deployment via Actions
- localStorage progress persistence
