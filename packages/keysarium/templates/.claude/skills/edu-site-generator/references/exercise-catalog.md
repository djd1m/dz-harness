# Exercise Type Catalog

## 6 Interactive Exercise Types

### 1. Quiz (`interactiveType: 'quiz'`)

**Best for:** Factual knowledge, best practices, conceptual understanding
**Content type:** Statements that can be verified as true/false or selected from options

**When to use:**
- Testing recall of facts, definitions, rules
- Multiple valid-looking answers exist (good distractors)
- Explanations add learning value

**Data needed:** 2-4 questions with 4 options each, correct answer index, explanation

**UX:** Step through questions one at a time, immediate feedback per question, final score.

---

### 2. Flashcards (`interactiveType: 'flashcards'`)

**Best for:** Vocabulary, definitions, term-concept pairs
**Content type:** Two-sided information (question/answer, term/definition)

**When to use:**
- Memorization is the goal
- Content is naturally paired (term <-> definition)
- Self-paced review is valuable

**Data needed:** 4-8 front/back card pairs

**UX:** Click/tap to toggle — cards flip back and forth freely. Tracks which cards have been viewed at least once. 100% completion on viewing all. Keyboard accessible (Enter/Space).

---

### 3. Matching Exercise (`interactiveType: 'matching'`)

**Best for:** Associations, mappings, relationships
**Content type:** Items that belong together in pairs

**When to use:**
- Concepts map to descriptions, tools to purposes, causes to effects
- Visual connection reinforces learning
- 4-6 distinct pairs available

**Data needed:** 4-6 left/right pairs

**UX:** Left column fixed, right column shuffled. Click left then right to match. Green on correct, shake on wrong.

---

### 4. Drag-to-Order (`interactiveType: 'drag-and-drop'` or `'ordering'`)

**Best for:** Sequential processes, priority ordering, step-by-step procedures
**Content type:** Items with a definitive correct order

**When to use:**
- Steps in a process must be in specific sequence
- Priority or importance ordering matters
- Understanding workflow/pipeline order

**Data needed:** 4-8 items with IDs, labels, and correct order array

**UX:** Drag items to reorder, "Check" button to verify, retry on wrong. Uses @dnd-kit.

---

### 5. Command Builder (`interactiveType: 'builder'`)

**Best for:** CLI commands, API calls, code syntax
**Content type:** Structured text that must be assembled correctly

**When to use:**
- Teaching command-line tools or API usage
- Syntax matters (order of flags, arguments)
- Progressive hints guide the learner

**Data needed:** Command parts array, correct assembled command, hints array

**UX:** Click parts to build command (shown as terminal-style), check button, progressive hints on failure.

---

### 6. Scenario Game (`interactiveType: 'simulation'` or `'scenario'`)

**Best for:** Decision-making, workflows, applied knowledge
**Content type:** Multi-step situations requiring judgment

**When to use:**
- Teaching decision-making in real-world contexts
- Multiple valid approaches with different outcomes
- Feedback on choices is more valuable than binary right/wrong

**Data needed:** Scenario description, 3-5 steps each with 2-3 options (positive/neutral/negative)

**UX:** Read scenario, step through decisions, see feedback per choice, final score = positive choices / total steps.

---

## Exercise Distribution Guidelines

| Section Count | Recommended Mix |
|---------------|----------------|
| 3-5 | 1 quiz, 1 flashcard, 1 matching/drag |
| 6-9 | 2 quiz, 1 flashcard, 1 matching, 1 drag, 1 scenario |
| 10-15 | 3 quiz, 2 flashcard, 2 matching, 2 drag, 1 builder, 2 scenario |
| 16-20 | Balanced across all 6 types |

**Rule:** Never have 3+ consecutive sections with the same exercise type.
