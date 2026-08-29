# Step 5: Gamification

## Goal
Generate the state management layer: Zustand store, progress hook, achievements hook, toast system.

## Protocol

### 1. Generate `src/store/useAppStore.js`

Zustand store with `persist` middleware (localStorage):

```javascript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set, get) => ({
      // Progress
      completedSections: {},
      sectionScores: {},
      markSectionComplete: (id, score) =>
        set((s) => ({
          completedSections: { ...s.completedSections, [id]: true },
          sectionScores: { ...s.sectionScores, [id]: score },
        })),

      // Achievements
      unlockedAchievements: [],
      unlockAchievement: (id) =>
        set((s) => ({
          unlockedAchievements: s.unlockedAchievements.includes(id)
            ? s.unlockedAchievements
            : [...s.unlockedAchievements, id],
        })),

      // Final test
      finalTestScore: null,
      finalTestAnswers: {},
      setFinalTestResult: (score, answers) =>
        set({ finalTestScore: score, finalTestAnswers: answers }),

      // UI
      navOpen: false,
      toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
      setNavOpen: (v) => set({ navOpen: v }),

      // Dark mode
      darkMode: false,
      toggleDarkMode: () =>
        set((s) => {
          const next = !s.darkMode
          document.documentElement.classList.toggle('dark', next)
          return { darkMode: next }
        }),

      // Toast
      toast: null,
      showToast: (toast) => set({ toast }),
      clearToast: () => set({ toast: null }),

      // Reset
      resetProgress: () =>
        set({
          completedSections: {},
          sectionScores: {},
          unlockedAchievements: [],
          finalTestScore: null,
          finalTestAnswers: {},
        }),
    }),
    {
      name: '{course-slug}-progress',  // Unique per course
      partialize: (state) => ({
        completedSections: state.completedSections,
        sectionScores: state.sectionScores,
        unlockedAchievements: state.unlockedAchievements,
        finalTestScore: state.finalTestScore,
        finalTestAnswers: state.finalTestAnswers,
        darkMode: state.darkMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.darkMode) {
          document.documentElement.classList.add('dark')
        }
      },
    }
  )
)
```

### 2. Generate `src/hooks/useProgress.js`

```javascript
import { useAppStore } from '../store/useAppStore'
import { TOTAL_SECTIONS, SECTIONS } from '../data/sections'

export function useProgress() {
  const completedSections = useAppStore((s) => s.completedSections)
  const sectionScores = useAppStore((s) => s.sectionScores)

  const count = Object.keys(completedSections).length
  const percentage = Math.round((count / TOTAL_SECTIONS) * 100)
  const totalScore = Object.values(sectionScores).reduce((a, b) => a + b, 0)

  return { count, total: TOTAL_SECTIONS, percentage, totalScore }
}
```

### 3. Generate `src/hooks/useAchievements.js`

```javascript
import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { ACHIEVEMENTS } from '../data/achievements'

export function useAchievements() {
  const completedSections = useAppStore((s) => s.completedSections)
  const sectionScores = useAppStore((s) => s.sectionScores)
  const finalTestScore = useAppStore((s) => s.finalTestScore)
  const unlocked = useAppStore((s) => s.unlockedAchievements)
  const unlock = useAppStore((s) => s.unlockAchievement)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    const state = useAppStore.getState()
    for (const achievement of ACHIEVEMENTS) {
      if (!unlocked.includes(achievement.id) && achievement.condition(state)) {
        unlock(achievement.id)
        showToast({
          type: 'achievement',
          title: achievement.title,
          description: achievement.description,
          icon: achievement.icon,
        })
      }
    }
  }, [completedSections, sectionScores, finalTestScore])
}
```

### 4. Wire Toast in App.jsx

Toast component auto-dismisses after 4 seconds. Displays at top-right with slide-in animation.

## Score Calculation

- Each section: 0-100 based on exercise performance
- Total score: sum of all section scores (displayed in Header)
- Final test: separate score (pass threshold: 70%)
- Progress: count of completed sections / total sections

## Checkpoint

```
Step 5/7: Gamification Complete
Store: useAppStore.js (persist to localStorage)
Hooks: useProgress.js, useAchievements.js
Achievements: {count} defined
Toast: wired in App.jsx

"ok" to continue | "[feedback]" to adjust
```
