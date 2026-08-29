# Step 2: Data Generation

## Goal
Generate all data files (`sections.js`, `exercises.js`, `quizQuestions.js`, `achievements.js`) from the course structure.

## Protocol

Read `references/data-schemas.md` for exact data formats.

### 1. Generate `src/data/sections.js`

```javascript
export const SECTIONS = [
  {
    id: 'section-id',
    order: 1,
    title: '1. Section Title',
    shortTitle: 'Short Title',
    description: 'Description',
    icon: 'emoji',
    interactiveType: 'type',
    theory: `Theory text with **bold** and paragraphs separated by \\n\\n`
  },
  // ... one per section
]

export const TOTAL_SECTIONS = SECTIONS.length
```

### 2. Generate `src/data/exercises.js`

For each section, generate exercise data matching its type:

**Flashcards:**
```javascript
export const flashcardData = {
  'section-id': [
    { front: 'Term or question', back: 'Definition or answer' },
    // 4-8 cards per section
  ]
}
```

**Matching:**
```javascript
export const matchingData = {
  'section-id': [
    { left: 'Item A', right: 'Match A' },
    // 4-6 pairs per section
  ]
}
```

**Drag Order:**
```javascript
export const dragOrderData = {
  'section-id': {
    instruction: 'Arrange these in correct order:',
    items: [{ id: '1', label: 'Step 1' }, ...],
    correctOrder: ['1', '2', '3', ...]
  }
}
// Also export as orderingData if section uses 'ordering' type
```

**Command Builder:**
```javascript
export const commandBuilderData = {
  'section-id': {
    instruction: 'Build the correct command:',
    parts: ['part1', ' ', 'part2', ...],
    correctCommand: 'part1 part2...',
    hints: ['Hint for first part', 'Hint for second part']
  }
}
```

**Scenario/Simulation:**
```javascript
export const simulationData = {
  'section-id': {
    title: 'Scenario Title',
    scenario: 'Context description',
    steps: [
      {
        id: 'step1',
        description: 'What do you do?',
        options: [
          { id: 'a', text: 'Good choice', result: 'positive', feedback: 'Why this is good' },
          { id: 'b', text: 'OK choice', result: 'neutral', feedback: 'Why this is OK' },
          { id: 'c', text: 'Bad choice', result: 'negative', feedback: 'Why this is bad' }
        ]
      },
      // 3-5 steps per scenario
    ]
  }
}
// Also export as scenarioData for 'scenario' type sections
```

**FAQ:**
```javascript
export const faqData = [
  { question: 'Frequently asked question?', answer: 'Detailed answer.' },
  // 5-8 FAQ items about the course topic
]
```

### 3. Generate `src/data/quizQuestions.js`

**Per-section quizzes** (for sections with `interactiveType: 'quiz'`):
```javascript
export const quizQuestions = {
  'section-id': [
    {
      id: 'section-id-q1',
      question: 'Question text?',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0,  // index
      explanation: 'Why this is correct'
    },
    // 2-4 questions per section
  ]
}
```

**Final test** (one question per section):
```javascript
export const finalTestQuestions = [
  {
    id: 'final-section-id',
    sectionId: 'section-id',
    question: 'Comprehensive question about this section?',
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 1
  },
  // one per section
]
```

### 4. Generate `src/data/achievements.js`

Standard achievement set (adapted to section count N):

```javascript
export const ACHIEVEMENTS = [
  {
    id: 'first-step',
    title: 'First Step',           // Localized
    description: 'Complete your first section',
    icon: 'emoji',
    condition: (state) => Object.keys(state.completedSections).length >= 1
  },
  // Halfway achievement (N/2 sections)
  // Perfectionist (any section 100%)
  // Full course (all N sections)
  // Test passed (final test >= 70%)
  // 3-5 topic-specific achievements
]
```

**Achievement guidelines:**
- Always include: first-step, halfway, perfectionist, full-course, test-passed
- Add 3-5 topic-specific achievements based on related section groups
- Total: 8-12 achievements
- Icons should be distinct and relevant

## Quality Checks

- [ ] Every section in SECTIONS has matching exercise data
- [ ] Every quiz section has questions in quizQuestions
- [ ] finalTestQuestions has exactly one entry per section
- [ ] All IDs are unique and kebab-case
- [ ] correctAnswer indices are within options array bounds
- [ ] No duplicate FAQ questions
- [ ] Achievement conditions reference valid state properties

## Checkpoint

```
Step 2/7: Data Generation Complete
Files: sections.js, exercises.js, quizQuestions.js, achievements.js
Sections: N | Quiz questions: M | Final test: N questions | Achievements: K

"ok" to continue | "[feedback]" to adjust
```
