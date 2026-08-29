# Step 4: Components

## Goal
Generate all React components: layout, interactive exercises, sections, pages, and common utilities.

## Protocol

Read `references/component-templates.md` for full component code.

### Generation Order

1. **Layout components** (no dependencies on data):
   - `Header.jsx` — sticky top bar with title, score, progress %, dark mode toggle, nav toggle, final test link
   - `Footer.jsx` — bottom bar with copyright, optional social link
   - `Navigation.jsx` — sidebar with section links (uses `scrollIntoView` NOT `<a href="#...">` to avoid HashRouter conflicts)
   - `ProgressBar.jsx` — visual bar showing course progress
   - `SectionLayout.jsx` — wrapper for each section: icon, title, description, completion badge, theory, children

2. **Interactive components** (reusable, data-driven):
   - `Quiz.jsx` — multiple choice with score tracking
   - `Flashcard.jsx` — flip cards for term memorization
   - `MatchingExercise.jsx` — pair matching with shuffle
   - `DragOrder.jsx` — drag-and-drop ordering (@dnd-kit)
   - `CommandBuilder.jsx` — click-to-build command
   - `ScenarioGame.jsx` — multi-step scenario with choices

3. **Common components:**
   - `Accordion.jsx` — expandable FAQ items
   - `AchievementsPanel.jsx` — grid of achievement badges
   - `Toast.jsx` — notification popup for achievements
   - `useSwipeNav.js` — custom hook for swipe gesture navigation between sections (mobile). Uses native touch events (touchstart/touchend), 50px threshold, horizontal only. No external dependencies.
     ```jsx
     // src/hooks/useSwipeNav.js
     import { useRef, useEffect } from 'react'

     export default function useSwipeNav(sectionIds, containerRef) {
       const touchStart = useRef(null)

       useEffect(() => {
         const el = containerRef?.current || document
         function onTouchStart(e) { touchStart.current = e.touches[0].clientX }
         function onTouchEnd(e) {
           if (touchStart.current === null) return
           const diff = touchStart.current - e.changedTouches[0].clientX
           if (Math.abs(diff) < 50) return  // threshold
           const currentIdx = sectionIds.findIndex(id =>
             document.getElementById(id)?.getBoundingClientRect().top >= -100
           )
           if (currentIdx === -1) return
           const nextIdx = diff > 0
             ? Math.min(currentIdx + 1, sectionIds.length - 1)  // swipe left → next
             : Math.max(currentIdx - 1, 0)                       // swipe right → prev
           document.getElementById(sectionIds[nextIdx])?.scrollIntoView({ behavior: 'smooth' })
           touchStart.current = null
         }
         el.addEventListener('touchstart', onTouchStart, { passive: true })
         el.addEventListener('touchend', onTouchEnd, { passive: true })
         return () => {
           el.removeEventListener('touchstart', onTouchStart)
           el.removeEventListener('touchend', onTouchEnd)
         }
       }, [sectionIds, containerRef])
     }
     ```
     Usage in `HomePage.jsx`: `useSwipeNav(SECTIONS.map(s => s.id))`

4. **Section components** (one per section):
   - `Section1.jsx` through `SectionN.jsx`
   - Each follows the pattern:
     ```jsx
     import SectionLayout from '../layout/SectionLayout'
     import {InteractiveComponent} from '../interactive/{Component}'
     import { useAppStore } from '../../store/useAppStore'
     import { SECTIONS } from '../../data/sections'
     import { exerciseData } from '../../data/exercises'  // or quizQuestions

     const section = SECTIONS[INDEX]

     export default function SectionN() {
       const markComplete = useAppStore((s) => s.markSectionComplete)
       return (
         <SectionLayout {...section} theory={section.theory}>
           <InteractiveComponent
             {...data}
             onComplete={(score) => markComplete(section.id, score)}
           />
         </SectionLayout>
       )
     }
     ```

5. **Page components:**
   - `HomePage.jsx` — main page with Navigation sidebar, all sections, AchievementsPanel, FAQ, reset button
   - `FinalTestPage.jsx` — final test with results display

6. **App component:**
   - `App.jsx` — HashRouter with routes, Header, Footer, ProgressBar, Toast

## Critical Implementation Notes

### Navigation: Use scrollIntoView, NOT href anchors
HashRouter interprets `#section-id` as a route. Use `<button>` with `document.getElementById(id).scrollIntoView()`.

### Quiz scoring: Do NOT double-count
`handleSelect` increments `correctCount` on correct answer. `handleNext` must use `correctCount` directly without adding `+1` for the current answer (it's already counted).

### ScenarioGame scoring: Same pattern
`handleSelect` increments `score` on positive result. `handleNext` finished block uses `score` directly.

### Dark mode: Toggle class on documentElement
```javascript
document.documentElement.classList.toggle('dark')
```
Persist to Zustand store + restore in `onRehydrateStorage`.

### DragOrder: Randomize initial order
Shuffle items on mount so user has to reorder them. Use Fisher-Yates shuffle.

### MatchingExercise: Shuffle right side only
Left side stays in order, right side is shuffled.

## Checkpoint

```
Step 4/7: Components Complete
Layout: 5 | Interactive: 6 | Common: 3 | Sections: N | Pages: 2 | App: 1
Total components: {count}

"ok" to continue | "[feedback]" to adjust
```
