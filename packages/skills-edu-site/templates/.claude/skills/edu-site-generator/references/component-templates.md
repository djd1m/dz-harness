# Component Templates Reference

Code templates for all components. Use these as the basis when generating components in Step 4.

## Layout Components

### SectionLayout.jsx
```jsx
import { useAppStore } from '../../store/useAppStore'

export default function SectionLayout({ id, icon, title, description, theory, children }) {
  const completed = useAppStore((s) => s.completedSections[id])
  const score = useAppStore((s) => s.sectionScores[id])

  return (
    <section id={`section-${id}`} className="py-12 border-t border-border">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl">{icon}</span>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-text">{title}</h2>
            <p className="text-text-muted text-sm mt-1">{description}</p>
          </div>
          {completed && (
            <span className="px-3 py-1 bg-success-500/10 text-success-600 dark:text-success-400 text-xs font-medium rounded-full">
              {score}%
            </span>
          )}
        </div>

        {theory && (
          <div className="mb-8 text-text-secondary text-sm leading-relaxed whitespace-pre-line">
            {theory}
          </div>
        )}

        {!completed && children}
        {completed && (
          <p className="text-sm text-success-600 dark:text-success-400 font-medium">
            Section completed with {score}% score
          </p>
        )}
      </div>
    </section>
  )
}
```

### Header.jsx
```jsx
import { useAppStore } from '../../store/useAppStore'
import { useProgress } from '../../hooks/useProgress'

export default function Header() {
  const { percentage, totalScore } = useProgress()
  const toggleNav = useAppStore((s) => s.toggleNav)
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={toggleNav} className="md:hidden p-2">
            {/* hamburger icon */}
          </button>
          <a href="#/" className="font-bold text-text no-underline">
            {/* Course title */}
          </a>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-muted">{totalScore} pts</span>
          <span className="text-sm text-text-muted">{percentage}%</span>
          <button onClick={toggleDarkMode}>
            {/* sun/moon icon */}
          </button>
          <a href="#/final-test" className="px-3 py-1.5 bg-primary-500 text-white text-sm rounded-lg">
            Final Test
          </a>
        </div>
      </div>
    </header>
  )
}
```

### Navigation.jsx

**CRITICAL:** Use `scrollIntoView()` via buttons, NOT `<a href="#section-...">`:
```jsx
function scrollTo(id) {
  document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth' })
  // Close nav on mobile
  setNavOpen(false)
}

// Render:
<button onClick={() => scrollTo(section.id)}>
  {section.icon} {section.shortTitle}
</button>
```

### Flashcard.jsx
```jsx
import { useState } from 'react'

export default function Flashcard({ cards, onComplete }) {
  // Toggle state: tracks which side is showing (true = back, false = front)
  const [flipped, setFlipped] = useState({})
  // Viewed state: tracks which cards have been seen at least once (for completion)
  const [viewed, setViewed] = useState({})

  function handleFlip(index) {
    // Toggle the card back and forth
    setFlipped(prev => ({ ...prev, [index]: !prev[index] }))

    // Track first-time views for completion scoring
    if (!viewed[index]) {
      const nextViewed = { ...viewed, [index]: true }
      setViewed(nextViewed)
      if (Object.keys(nextViewed).length === cards.length) {
        onComplete(100)
      }
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card, i) => (
        <button
          key={i}
          onClick={() => handleFlip(i)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFlip(i) } }}
          aria-label={flipped[i] ? 'Flip card to front' : 'Flip card to back'}
          className={`p-6 rounded-xl border-2 min-h-[120px] transition-all duration-300 text-left cursor-pointer ${
            flipped[i]
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-border hover:border-primary-400'
          }`}
        >
          <p className={`text-sm ${flipped[i] ? 'text-primary-700 dark:text-primary-300' : 'text-text font-medium'}`}>
            {flipped[i] ? card.back : card.front}
          </p>
          <p className="text-xs text-text-muted mt-2">
            {viewed[i] ? '✓ Viewed — click to flip' : 'Click to flip'}
          </p>
        </button>
      ))}
    </div>
  )
}
```

### CommandBuilder.jsx
```jsx
import { useState } from 'react'

export default function CommandBuilder({ instruction, parts, correctCommand, hints, onComplete }) {
  const [built, setBuilt] = useState([])
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)

  const availableParts = parts.filter((_, i) => !built.includes(i))
  const builtCommand = built.map((i) => parts[i]).join('')

  function handleAdd(index) {
    if (checked) return
    setBuilt([...built, index])
  }

  function handleRemove(pos) {
    if (checked) return
    setBuilt(built.filter((_, i) => i !== pos))
  }

  function handleCheck() {
    if (builtCommand === correctCommand) {
      setCorrect(true)
      setChecked(true)
      onComplete(100)
    } else {
      setHintIndex((i) => Math.min(i + 1, hints.length - 1))
    }
  }

  function handleReset() {
    setBuilt([])
    setChecked(false)
    setCorrect(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">{instruction}</p>

      <div className="bg-bg-secondary rounded-lg p-3 font-mono text-sm min-h-[44px]">
        <span className="text-text-muted">$ </span>
        {built.map((partIndex, pos) => (
          <button key={pos} onClick={() => handleRemove(pos)}
            className="text-primary-600 dark:text-primary-400 hover:line-through">
            {parts[partIndex]}
          </button>
        ))}
        {built.length === 0 && <span className="text-text-muted">click parts below...</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {availableParts.map((part, i) => {
          const originalIndex = parts.indexOf(part)
          return (
            <button key={i} onClick={() => handleAdd(originalIndex)}
              className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm hover:border-primary-400">
              {part}
            </button>
          )
        })}
      </div>

      {hintIndex > 0 && !correct && (
        <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          {hints[hintIndex - 1]}
        </p>
      )}

      {correct && (
        <p className="text-sm text-success-600 dark:text-success-400 bg-success-500/10 rounded-lg p-3">
          Correct!
        </p>
      )}

      <div className="flex gap-2">
        {!checked && built.length > 0 && (
          <button onClick={handleCheck}
            className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
            Check
          </button>
        )}
        {built.length > 0 && !correct && (
          <button onClick={handleReset}
            className="px-6 py-2 border border-border text-text-secondary rounded-lg hover:bg-bg-hover">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
```

### App.jsx Template
```jsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import ProgressBar from './components/layout/ProgressBar'
import Toast from './components/common/Toast'
import HomePage from './pages/HomePage'
import FinalTestPage from './pages/FinalTestPage'
import { useAchievements } from './hooks/useAchievements'

function AppContent() {
  useAchievements()
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />
      <ProgressBar />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/final-test" element={<FinalTestPage />} />
        </Routes>
      </div>
      <Footer />
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}
```

### Toast.jsx Template
```jsx
import { useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'

export default function Toast() {
  const toast = useAppStore((s) => s.toast)
  const clearToast = useAppStore((s) => s.clearToast)

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(clearToast, 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  if (!toast) return null

  return (
    <div className="fixed top-20 right-4 z-50 animate-fade-in-up">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{toast.icon}</span>
          <div>
            <p className="font-semibold text-text text-sm">{toast.title}</p>
            <p className="text-xs text-text-muted mt-1">{toast.description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

## Interactive Components

### Quiz.jsx — CRITICAL SCORING PATTERN
```jsx
// handleSelect increments correctCount
function handleSelect(index) {
  if (selected !== null) return
  setSelected(index)
  if (index === question.correctAnswer) {
    setCorrectCount((c) => c + 1)  // Already counted here
  }
}

// handleNext uses correctCount DIRECTLY (no +1 compensation)
function handleNext() {
  if (currentIndex < questions.length - 1) {
    setCurrentIndex((i) => i + 1)
    setSelected(null)
  } else {
    setFinished(true)
    const score = Math.round((correctCount / questions.length) * 100)  // NOT correctCount + 1
    onComplete(score)
  }
}

// Finished view also uses correctCount directly
if (finished) {
  const finalCorrect = correctCount  // NOT correctCount + (selected === ...)
  // ...
}
```

### ScenarioGame.jsx — SAME SCORING PATTERN
```jsx
// handleSelect increments score
function handleSelect(option) {
  if (selectedOption) return
  setSelectedOption(option)
  if (option.result === 'positive') {
    setScore((s) => s + 1)  // Already counted here
  }
}

// handleNext uses score DIRECTLY
function handleNext() {
  // ...
  setFinished(true)
  const finalScore = score  // NOT score + (selectedOption?.result === 'positive' ? 1 : 0)
  const percentage = Math.round((finalScore / steps.length) * 100)
  onComplete(percentage)
}
```

### DragOrder.jsx — Shuffle Pattern
```jsx
// Fisher-Yates shuffle on mount
const [items, setItems] = useState(() => {
  const shuffled = [...initialItems]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
})
```

### MatchingExercise.jsx — Shuffle Right Side
```jsx
const [shuffledRight] = useState(() => {
  const arr = items.map(i => i.right)
  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
})
```

## Section Component Template

```jsx
import SectionLayout from '../layout/SectionLayout'
import Quiz from '../interactive/Quiz'  // or appropriate component
import { useAppStore } from '../../store/useAppStore'
import { SECTIONS } from '../../data/sections'
import { quizQuestions } from '../../data/quizQuestions'  // or exercises

const section = SECTIONS[0]  // adjust index

export default function Section1() {
  const markComplete = useAppStore((s) => s.markSectionComplete)

  return (
    <SectionLayout {...section} theory={section.theory}>
      <Quiz
        questions={quizQuestions[section.id]}
        onComplete={(score) => markComplete(section.id, score)}
      />
    </SectionLayout>
  )
}
```

## Component-to-Data Mapping

| Component | Data Source | Props |
|-----------|-----------|-------|
| Quiz | `quizQuestions[sectionId]` | `questions, onComplete` |
| Flashcard | `flashcardData[sectionId]` | `cards, onComplete` |
| MatchingExercise | `matchingData[sectionId]` | `items, onComplete` |
| DragOrder | `dragOrderData[sectionId]` or `orderingData[sectionId]` | `instruction, items, correctOrder, onComplete` |
| CommandBuilder | `commandBuilderData[sectionId]` | `instruction, parts, correctCommand, hints, onComplete` |
| ScenarioGame | `simulationData[sectionId]` or `scenarioData[sectionId]` | `title, scenario, steps, onComplete` |
