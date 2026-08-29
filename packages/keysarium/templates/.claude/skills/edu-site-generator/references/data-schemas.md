# Data Schemas Reference

All data files live in `src/data/`. Content is data-driven — never hardcode text in components.

## sections.js

```typescript
// Section definition
interface Section {
  id: string           // kebab-case, unique, 2-4 words
  order: number        // 1-based sequential
  title: string        // "N. Full Title" (with order prefix)
  shortTitle: string   // 2-3 words for sidebar
  description: string  // One-line summary
  icon: string         // Single emoji
  interactiveType: InteractiveType
  theory: string       // Multi-paragraph, use \n\n for breaks, **bold** for emphasis
}

type InteractiveType =
  | 'quiz'           // -> Quiz.jsx
  | 'flashcards'     // -> Flashcard.jsx
  | 'matching'       // -> MatchingExercise.jsx
  | 'drag-and-drop'  // -> DragOrder.jsx
  | 'ordering'       // -> DragOrder.jsx (alias)
  | 'builder'        // -> CommandBuilder.jsx
  | 'simulation'     // -> ScenarioGame.jsx
  | 'scenario'       // -> ScenarioGame.jsx (alias)

// Exports
export const SECTIONS: Section[]
export const TOTAL_SECTIONS: number  // = SECTIONS.length
```

## quizQuestions.js

```typescript
// Per-section quiz questions
interface QuizQuestion {
  id: string              // unique, e.g. "section-id-q1"
  question: string        // The question text
  options: string[]       // 4 options (array of 4 strings)
  correctAnswer: number   // Index (0-3) of the correct option
  explanation: string     // Why the correct answer is correct
}

// Final test question (one per section)
interface FinalTestQuestion {
  id: string              // unique, e.g. "final-section-id"
  sectionId: string       // Must match a section.id
  question: string
  options: string[]       // 4 options
  correctAnswer: number   // Index (0-3)
}

// Exports
export const quizQuestions: Record<string, QuizQuestion[]>
export const finalTestQuestions: FinalTestQuestion[]
```

## exercises.js

```typescript
// Flashcard data
interface FlashcardItem {
  front: string   // Question/term side
  back: string    // Answer/definition side
}
export const flashcardData: Record<string, FlashcardItem[]>
// 4-8 cards per section

// Matching data
interface MatchingItem {
  left: string    // Left side (stays in order)
  right: string   // Right side (shuffled)
}
export const matchingData: Record<string, MatchingItem[]>
// 4-6 pairs per section

// Drag order data
interface DragOrderItem {
  id: string      // Unique within this exercise
  label: string   // Display text
}
interface DragOrderExercise {
  instruction: string        // What to arrange
  items: DragOrderItem[]     // Items to order
  correctOrder: string[]     // Array of item IDs in correct order
}
export const dragOrderData: Record<string, DragOrderExercise>
export const orderingData: Record<string, DragOrderExercise>  // alias

// Command builder data
interface CommandBuilderExercise {
  instruction: string     // What command to build
  parts: string[]         // Command parts (including spaces)
  correctCommand: string  // Expected assembled command
  hints: string[]         // Progressive hints
}
export const commandBuilderData: Record<string, CommandBuilderExercise>

// Scenario/Simulation data
interface ScenarioOption {
  id: string                              // e.g. 'a', 'b', 'c'
  text: string                            // Option display text
  result: 'positive' | 'neutral' | 'negative'
  feedback: string                        // Feedback after selection
}
interface ScenarioStep {
  id: string              // e.g. 'step1'
  description: string     // Situation description
  options: ScenarioOption[]  // 2-3 options
}
interface ScenarioExercise {
  title: string
  scenario: string         // Context/setup text
  steps: ScenarioStep[]    // 3-5 steps
}
export const simulationData: Record<string, ScenarioExercise>
export const scenarioData: Record<string, ScenarioExercise>  // alias

// FAQ data
interface FAQItem {
  question: string
  answer: string
}
export const faqData: FAQItem[]
// 5-8 items about the course topic
```

## achievements.js

```typescript
interface Achievement {
  id: string                                    // unique kebab-case
  title: string                                 // Display name (localized)
  description: string                           // What was accomplished
  icon: string                                  // Single emoji
  condition: (state: StoreState) => boolean     // Unlock condition
}

// StoreState shape:
interface StoreState {
  completedSections: Record<string, boolean>
  sectionScores: Record<string, number>
  finalTestScore: number | null
}

export const ACHIEVEMENTS: Achievement[]
```

### Standard Achievement Set

Every course should include these base achievements:

| ID | Condition | Description |
|----|-----------|-------------|
| `first-step` | 1+ section completed | Starting the journey |
| `halfway` | N/2+ sections completed | Halfway through |
| `perfectionist` | Any section with score 100 | Perfect score |
| `full-course` | All N sections completed | Course complete |
| `test-passed` | Final test score >= 70 | Test passed |

Plus 3-5 topic-specific achievements based on section groupings.
