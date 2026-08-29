# Step 7: Verification

## Goal
Build the project and verify everything works correctly.

## Protocol

### 1. Run build
```bash
npm run build
```
Must complete with zero errors.

### 2. Verify file structure
Check that all expected files exist:
- [ ] `src/data/sections.js` — has correct number of sections
- [ ] `src/data/exercises.js` — has data for each exercise type used
- [ ] `src/data/quizQuestions.js` — has questions for quiz sections + final test
- [ ] `src/data/achievements.js` — has 8+ achievements
- [ ] `src/store/useAppStore.js` — Zustand store with persist
- [ ] `src/hooks/useProgress.js` — progress calculations
- [ ] `src/hooks/useAchievements.js` — achievement detection
- [ ] All section components (`Section1.jsx` through `SectionN.jsx`)
- [ ] All interactive components used by sections
- [ ] All layout components
- [ ] `src/App.jsx` — routing
- [ ] `src/pages/HomePage.jsx` — main page
- [ ] `src/pages/FinalTestPage.jsx` — test page
- [ ] `.github/workflows/deploy.yml` — deployment

### 3. Cross-reference checks
- [ ] Every section in `SECTIONS` array has a corresponding `SectionN.jsx` component
- [ ] Every section's `interactiveType` has matching exercise data
- [ ] `finalTestQuestions` has one entry per section with valid `sectionId`
- [ ] All imports in components resolve to existing files
- [ ] No circular dependencies

### 4. Known bug prevention
- [ ] Quiz.jsx: `handleNext` uses `correctCount` directly, NOT `correctCount + (selected === correctAnswer ? 1 : 0)`
- [ ] ScenarioGame.jsx: same pattern — no double-counting in `handleNext` or finished view
- [ ] Navigation.jsx: uses `scrollIntoView()` NOT `<a href="#section-...">` (HashRouter conflict)
- [ ] Dark mode: `onRehydrateStorage` restores `.dark` class

### 5. Responsiveness check
- [ ] Navigation hides on mobile (hamburger menu)
- [ ] Sections stack vertically on small screens
- [ ] Cards and buttons have proper touch targets (min 44px)
- [ ] Text is readable at all breakpoints
- [ ] Swipe gesture navigation works on mobile (left = next section, right = previous)
- [ ] Swipe threshold (50px) prevents accidental navigation

### 6. Flashcard toggle check
- [ ] Cards flip from front to back on click
- [ ] Cards flip back from back to front on second click
- [ ] "Viewed" indicator shows on cards that have been flipped at least once
- [ ] onComplete(100) fires when ALL cards have been viewed at least once (regardless of current flip state)
- [ ] Keyboard navigation works (Enter/Space to flip)

### 7. SEO files check
- [ ] `public/robots.txt` exists with `User-agent: *`, `Allow: /`, and `Sitemap:` directive
- [ ] `public/sitemap.xml` exists with valid XML structure
- [ ] sitemap.xml contains URL for each section
- [ ] Sitemap URL in robots.txt matches actual sitemap location

### 6. Error Recovery

If `npm run build` fails, diagnose and fix:

| Error | Cause | Fix |
|-------|-------|-----|
| `Module not found: Can't resolve './components/...'` | Missing component file or wrong import path | Create the missing file or fix the import |
| `'X' is not exported from 'Y'` | Wrong export name in data file | Check data file exports match imports |
| `Cannot find module '@dnd-kit/...'` | Missing dependency | Run `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` |
| `Unexpected token` in JSX | Syntax error in component | Check for unclosed tags, missing returns |
| TailwindCSS class not resolving | Custom class without `@theme` definition | Verify all semantic colors defined in index.css |
| `npm install` fails with ERESOLVE | Peer dependency conflict | Try `npm install --legacy-peer-deps` |
| `npm install` fails with network error | No internet or registry down | Check network, retry, or use `--registry https://registry.npmjs.org` |

**Recovery protocol:**
1. Read the full error message
2. Match to table above (or diagnose)
3. Fix the specific issue
4. Re-run `npm run build`
5. Repeat until clean build

## Output

```
Step 7/7: Verification Complete
Build: SUCCESS
Files: {count} verified
Cross-references: OK
Known bugs: mitigated

Site ready for deployment. Push to main to trigger GitHub Pages deploy.
URL: https://{user}.github.io/{repo}/
```
