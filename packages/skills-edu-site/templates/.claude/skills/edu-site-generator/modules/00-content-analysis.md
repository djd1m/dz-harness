# Step 0: Content Analysis

## Goal
Parse source documentation and extract distinct teachable topics.

## Protocol

1. **Identify input type:**
   - URL(s) → use WebFetch to retrieve content
   - Local path(s) → use Read tool
   - Pasted text → use directly
   - Topic description → generate content from knowledge

2. **Extract topics:**
   - Read through all source material
   - Identify distinct concepts/practices/techniques
   - Group related content into logical units
   - Each unit = one potential section

3. **For each topic, capture:**
   - Title (concise, 3-8 words)
   - Description (1 sentence)
   - Key concepts (3-5 bullet points)
   - Practical value (why learn this?)
   - Content depth estimate (shallow/medium/deep)

4. **Determine language:**
   - Auto-detect from source content
   - If mixed, ask user preference
   - All UI text must match chosen language

5. **Estimate scope:**
   - Count topics → section count
   - If < 3: warn user, suggest adding more content
   - If > 20: suggest grouping or splitting into multiple courses
   - Sweet spot: 5-15 sections

## Output Format

```javascript
// Topic analysis result
{
  language: 'ru' | 'en',
  courseTitle: 'string',
  courseDescription: 'string',
  topics: [
    {
      title: 'string',
      description: 'string',
      keyConcepts: ['string'],
      depth: 'shallow' | 'medium' | 'deep',
      suggestedExercise: 'quiz' | 'flashcards' | 'matching' | 'drag-order' | 'builder' | 'scenario'
    }
  ]
}
```

## Exercise Type Heuristics

| Content Nature | Best Exercise Type | `interactiveType` value |
|---------------|-------------------|------------------------|
| Definitions, terms, concepts | Flashcards | `'flashcards'` |
| Comparisons, mappings, associations | Matching | `'matching'` |
| Factual knowledge, best practices | Quiz | `'quiz'` |
| Sequential processes, ordered steps | Drag-to-Order | `'drag-and-drop'` |
| Command syntax, API calls | Command Builder | `'builder'` |
| Decision-making, workflows | Scenario Game | `'scenario'` |

**IMPORTANT:** Use ONLY these exact `interactiveType` values. Do NOT use `'drag-order'`, `'ordering'`, or `'simulation'` — they are legacy aliases.

## Checkpoint

```
Step 0/7: Content Analysis Complete
Topics: N identified
Language: {language}
Course: "{courseTitle}"

Topic list:
1. {title} — {suggestedExercise}
...

"ok" to continue | "[feedback]" to adjust
```
