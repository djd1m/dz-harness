# Assessment Rubrics for Brutal Honesty Reviews

## Code Quality Rubric (Linus Mode)

### Correctness
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Failing** | Wrong algorithm, logic errors, crashes | `null` pointer dereference, off-by-one errors |
| 🟡 **Passing** | Works in tested cases, no obvious bugs | Handles expected inputs correctly |
| 🟢 **Excellent** | Proven correct across edge cases | Property-based tests, formal verification |

### Performance
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Failing** | Naive O(n²) where O(n) exists | Nested loops for searchable data |
| 🟡 **Passing** | Acceptable complexity for scale | O(n log n) for reasonable n |
| 🟢 **Excellent** | Optimal algorithm + profiled | Cached, indexed, benchmarked |

### Error Handling
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Failing** | Crashes on invalid input | Uncaught exceptions, panics |
| 🟡 **Passing** | Returns error codes/exceptions | `try/catch`, error returns |
| 🟢 **Excellent** | Graceful degradation + logging — **но НЕ для значения, которое продукт ОТДАЁТ наружу** | Circuit breakers, retry logic |

> **Оговорка к высшей оценке, и она несущая.** Мягкая деградация заслуживает 🟢 для НЕДОСТУПНОСТИ
> (сервис не ответил — вернём кэш, попробуем позже) и заслуживает 🔴 для ЗНАЧЕНИЯ, которое уходит
> потребителю (цена, остаток, право доступа, результат расчёта). Подставить приблизительное вместо
> точного и записать это в журнал — значит выдать неверный ответ и назвать это устойчивостью.
> Правильный исход для значения — ОТКАЗ С НАЗВАННОЙ ПРИЧИНОЙ, а не правдоподобная замена.
>
> Оговорка появилась потому, что прежняя формулировка прямо ПООЩРЯЛА механизм, который в разборе
> реальных отказов назван причиной каждого происшествия высшей категории: подстановка запасного
> значения там, где честный ответ — «не знаю».

### Concurrency Safety
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Failing** | Race conditions, deadlocks; **а также: последовательный тест, поданный как доказательство параллельной безопасности** | Shared mutable state, no locks; «тест проходит» при одном писателе |
| 🟡 **Passing** | Thread-safe with locks | Proper mutex usage |
| 🟢 **Excellent** | Lock-free or proven safe | Immutable data, atomic operations |

### Testability
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Failing** | Impossible to unit test | Hard-coded dependencies, global state |
| 🟡 **Passing** | Can be tested with mocks | Dependency injection |
| 🟢 **Excellent** | Self-testing design | Pure functions, property-based |

### Maintainability
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Failing** | "Clever" code, unclear intent | Obfuscated logic, magic numbers |
| 🟡 **Passing** | Clear intent, reasonable | Named variables, comments |
| 🟢 **Excellent** | Self-documenting + simple | Obvious code, minimal complexity |

**Passing Threshold**: Minimum 🟡 on ALL criteria
**Ship-Ready**: Minimum 🟢 on Correctness, Performance, Error Handling

---

## Test Quality Rubric (Ramsay Mode)

### Coverage
| Level | Criteria | Acceptable % |
|-------|----------|--------------|
| 🔴 **Raw** | Only happy path | <50% branch |
| 🟡 **Acceptable** | Common failures covered | 80%+ branch |
| 🟢 **Michelin Star** | Complete boundary analysis | 95%+ branch + mutation tested |

### Edge Case Testing
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Raw** | Only happy path tested | `test('adds 2+2')` |
| 🟡 **Acceptable** | Common failures tested | Null, empty, invalid input |
| 🟢 **Michelin Star** | Boundary analysis complete | Min/max values, overflow, underflow |

### Test Clarity
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Raw** | Unclear what's being tested | `test('test1')` |
| 🟡 **Acceptable** | Clear test names | `test('handles null input')` |
| 🟢 **Michelin Star** | Self-documenting test pyramid | Given-When-Then, BDD style |

### Speed
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Raw** | Minutes to run unit tests | Calls real database/network |
| 🟡 **Acceptable** | <10s for unit tests | Mocked dependencies |
| 🟢 **Michelin Star** | <1s, parallelized | Pure functions, in-memory |

### Stability
| Level | Criteria | Flake Rate |
|-------|----------|------------|
| 🔴 **Raw** | Flaky, timing-dependent | >1% failure rate |
| 🟡 **Acceptable** | Stable but potentially slow | 0% flake, deterministic |
| 🟢 **Michelin Star** | Deterministic + fast | 0% flake, <100ms per test |

### Isolation
| Level | Criteria | Example |
|-------|----------|---------|
| 🔴 **Raw** | Tests depend on each other | Shared state, execution order matters |
| 🟡 **Acceptable** | Independent tests | Each test sets up own state |
| 🟢 **Michelin Star** | Pure functions, no shared state | Immutable, stateless |

**Merge Threshold**: Minimum 🟡 on ALL criteria
**Production-Ready**: Minimum 🟢 on Coverage, Stability, Isolation

---

## BS Detection Rubric (Bach Mode)

### Red Flags in Testing Practices

| Red Flag | Evidence | Impact | Harshness Level |
|----------|----------|--------|-----------------|
| **Cargo Cult Practice** | "Best practice" with no context | Wasted effort, false confidence | 🟡 Harsh |
| **Certification Theater** | Required cert unrelated to actual skills | Filters out critical thinkers | 🟢 Brutal |
| **Vendor Lock-In** | Tool solves problem it created | Expensive dependency | 🟡 Harsh |
| **False Automation** | "AI testing" still needs human verification | Automation debt | 🟡 Harsh |
| **Checkbox Quality** | Compliance without outcome measurement | Audit passes, customers suffer | 🟢 Brutal |
| **Hype Cycle** | Promises 10x improvement without evidence | Budget waste, disillusionment | 🟡 Harsh |
| **Coverage Theater** | 100% coverage of trivial code | False sense of quality | 🟡 Harsh |
| **Test Script Slavery** | Following test cases without thinking | Misses actual bugs | 🟢 Brutal |
| **Magic Tool Thinking** | Tool will solve all problems | Dependency without skill growth | 🟡 Harsh |
| **Certification Over Competence** | Hiring based on credentials, not ability | Weak team, strong resumes | 🟢 Brutal |

### Green Flag Test

Ask these questions about any practice/tool/certification:

1. **Does this help testers/developers do better work in THIS context?**
   - If yes → Worth considering
   - If no → BS alert

2. **Who benefits economically from this?**
   - Vendor/Consultant more than users → BS alert
   - Users demonstrably benefit → Potentially useful

3. **Can you measure the impact?**
   - Measurable outcomes → Worth evaluating
   - Vague claims → BS alert

4. **Does this promote thinking or compliance?**
   - Critical thinking → Good
   - Checkbox compliance → BS alert

5. **What happens if you don't adopt this?**
   - Concrete negative consequence → Worth considering
   - FOMO, vendor says so → BS alert

---

## Calibration Matrix

### When to Be Brutal

| Scenario | Linus | Ramsay | Bach | Notes |
|----------|-------|--------|------|-------|
| **Senior engineer, repeated mistake** | ✅ | ✅ | ✅ | They should know better |
| **Critical security bug** | ✅ | ✅ | ❌ | Technical precision needed |
| **Production incident** | ✅ | ✅ | ❌ | No time for sugar-coating |
| **Vendor evaluating claims** | ❌ | ❌ | ✅ | BS detection prevents waste |
| **Team explicitly requests no-BS** | ✅ | ✅ | ✅ | Permission granted |
| **Certification/process evaluation** | ❌ | ❌ | ✅ | Bach's specialty |

### When to Dial Back

| Scenario | Instead Use | Reason |
|----------|-------------|--------|
| **Junior dev, first PR** | Constructive mentoring | Build confidence |
| **Demoralized team** | Supportive guidance | Rebuild trust |
| **Public forum** | Private feedback | Avoid humiliation |
| **Unclear if fixable** | Collaborative problem-solving | Avoid frustration |
| **Personal, not technical** | Empathy + support | Not a code issue |

---

## Scoring Guide

### Overall Code Review Score (Linus Mode)

```
Score = (Correctness × 3) + (Performance × 2) + (Error Handling × 3) +
        (Concurrency × 2) + (Testability × 1) + (Maintainability × 1)

Maximum: 60 points (all Excellent)
Passing: 36 points (all Passing)
Failing: <36 points

Harshness Level:
- 0-24 points: 🔴 Brutal ("This is fundamentally broken")
- 25-35 points: 🟡 Harsh ("Multiple issues need addressing")
- 36-48 points: 🟢 Direct ("Some improvements needed")
- 49-60 points: ⚪ Professional ("Minor suggestions")
```

### Test Suite Score (Ramsay Mode)

```
Score = (Coverage × 3) + (Edge Cases × 3) + (Clarity × 1) +
        (Speed × 1) + (Stability × 3) + (Isolation × 1)

Maximum: 60 points (all Michelin Star)
Merge Threshold: 36 points (all Acceptable)
Failing: <36 points

Harshness Level:
- 0-24 points: 🔴 Brutal ("This is RAW. Don't serve it.")
- 25-35 points: 🟡 Harsh ("You know what good looks like.")
- 36-48 points: 🟢 Direct ("Close, but needs refinement.")
- 49-60 points: ⚪ Professional ("Well done, minor polish.")
```

### BS Detection Score (Bach Mode)

```
Red Flags: Count from BS Detection Rubric
Green Flags: Passes all 5 Green Flag Tests

Score = (Green Flags × 20) - (Red Flags × 10)

Maximum: 100 (all green flags, no red flags)
Acceptable: 50+ (more green than red)
BS Alert: <50 (more red than green)

Harshness Level:
- Negative score: 🔴 Brutal ("This is harmful")
- 0-40: 🟡 Harsh ("This is questionable")
- 41-70: 🟢 Direct ("Some concerns")
- 71-100: ⚪ Professional ("Reasonable approach")
```

---

## Example Assessments

### Code Review Example (Linus Mode)

**Code**: Database query in HTTP handler without connection pooling

**Assessment**:
- Correctness: 🔴 Failing (connection leak)
- Performance: 🔴 Failing (O(n) connections)
- Error Handling: 🟡 Passing (has try/catch)
- Concurrency: 🔴 Failing (connection exhaustion)
- Testability: 🟡 Passing (can mock)
- Maintainability: 🟡 Passing (clear intent)

**Score**: (0×3) + (0×2) + (1×3) + (0×2) + (1×1) + (1×1) = 5/60

**Harshness**: 🔴 Brutal

**Feedback**:
> "This is fundamentally broken. You're creating a new database connection
> for every HTTP request without pooling. Under load, you'll exhaust
> connections in seconds. Did you even test this with concurrent users?
>
> Use a connection pool. This is Database 101."

---

### Test Suite Example (Ramsay Mode)

**Tests**: 15 tests, all happy path, no edge cases

**Assessment**:
- Coverage: 🔴 Raw (35% branch)
- Edge Cases: 🔴 Raw (none tested)
- Clarity: 🟡 Acceptable (clear names)
- Speed: 🟢 Michelin (fast)
- Stability: 🟢 Michelin (no flakes)
- Isolation: 🟡 Acceptable (independent)

**Score**: (0×3) + (0×3) + (1×1) + (2×1) + (2×3) + (1×1) = 9/60

**Harshness**: 🔴 Brutal

**Feedback**:
> "Look at this. You've got 15 tests and 14 of them are happy path.
> Where's the validation testing? Where's the error handling?
>
> This is RAW. You're testing if the code runs, not if it's correct.
> Don't merge this."

---

### BS Detection Example (Bach Mode)

**Claim**: "Our AI-powered test automation eliminates manual testing"

**Assessment**:
- Red Flags: Hype Cycle, Magic Tool Thinking, False Automation
- Green Flags: 0/5 (fails all tests)

**Score**: (0×20) - (3×10) = -30/100

**Harshness**: 🔴 Brutal

**Feedback**:
> "This is vendor hype. 'AI-powered' doesn't eliminate the need for humans
> to define test oracles, handle edge cases, or investigate failures.
>
> The real question: Does this tool help YOUR testers on YOUR product
> in YOUR context? If you can't answer specifically, you're buying hype."
