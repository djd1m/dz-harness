# Step 1: Course Structure

## Goal
Transform analyzed topics into a structured course with section definitions and exercise assignments.

## Protocol

1. **Order sections** from foundational to advanced:
   - Basic concepts first
   - Build on prior knowledge
   - End with synthesis/integration topics

2. **Assign exercise types** per section:
   - Read `references/exercise-catalog.md` for guidance
   - Vary types to avoid monotony (no 3+ consecutive same type)
   - Match exercise to content nature (see heuristics in Step 0)
   - Each of the 6 types should appear at least once if section count >= 6

3. **Write theory text** per section:
   - 150-400 words per section
   - Structure: context -> core concept -> practical application
   - Use newlines for paragraph separation
   - Include **bold** for key terms
   - Keep language consistent with source material

4. **Assign icons** (emoji) per section:
   - Relevant to the topic
   - Distinct across sections (no duplicates)

5. **Define section metadata:**
   ```javascript
   {
     id: 'kebab-case-unique',  // 2-4 words, descriptive
     order: 1,                  // Sequential from 1
     title: 'N. Full Title',   // With order number prefix
     shortTitle: 'Short Name', // For sidebar (2-3 words)
     description: 'One-line summary of this section',
     icon: 'emoji',
     interactiveType: 'quiz' | 'flashcards' | 'matching' | 'drag-and-drop' | 'builder' | 'simulation' | 'scenario',
     theory: 'Multi-paragraph theory text...'
   }
   ```

6. **Define final test questions:**
   - One question per section (for final assessment)
   - 4 options each, one correct
   - Test understanding, not memorization

## Constraints

- Minimum 3 sections, maximum 20
- Each section must have exactly 1 exercise type
- `interactiveType` must be one of the 6 supported types:
  - `'quiz'` -> Quiz component
  - `'flashcards'` -> Flashcard component
  - `'matching'` -> MatchingExercise component
  - `'drag-and-drop'` or `'ordering'` -> DragOrder component
  - `'builder'` -> CommandBuilder component
  - `'simulation'` or `'scenario'` -> ScenarioGame component

## Output

Section definitions ready for `sections.js` generation in Step 2.

## Checkpoint

```
Step 1/7: Course Structure Complete
Sections: N defined

1. {icon} {title} — {interactiveType}
2. ...

"ok" to continue | "[feedback]" to adjust
```
