# Basic Evaluation: Structured Reasoning

## Eval 1: Tree-of-Thought — Architecture Decision

**Input:** "Which database should we use for our event sourcing system: PostgreSQL, EventStoreDB, or DynamoDB?"

**Expected behavior:**
- Classifies as exploration problem (multiple viable paths)
- Selects Tree-of-Thought strategy
- Generates 3 branches (one per option)
- Scores each branch on: performance, cost, operational complexity, ecosystem
- Prunes lowest-scoring option
- Expands top 2 with deeper analysis
- Selects winner with explicit justification

**Pass criteria:**
- Strategy explicitly declared as "tree-of-thought" before reasoning starts
- At least 3 branches generated
- Each branch has a numeric score (0-10)
- Winner selection justified by criteria, not by position or familiarity
- Confidence level provided

---

## Eval 2: Chain-of-Thought — Debugging

**Input:** "Why does this function return undefined when the array is empty?"
(with a code snippet containing an off-by-one error)

**Expected behavior:**
- Classifies as linear problem
- Selects Chain-of-Thought strategy
- Steps through code execution line by line
- Identifies the off-by-one error at the specific line
- Verifies conclusion by mental trace with empty array input

**Pass criteria:**
- Strategy declared as "chain-of-thought"
- Each reasoning step shown with intermediate state
- Root cause identified with exact line reference
- Conclusion verified against the input case

---

## Eval 3: Reflection-Suppression — Breaking Analysis Paralysis

**Input:** Provide a prompt that naturally leads to hedging: "Should we use microservices or monolith? Consider all tradeoffs carefully."

**Expected behavior:**
- Initially may start exploring both sides
- Detects hedging pattern (multiple "however", "on the other hand")
- Switches to Reflection-Suppression
- Commits to a position based on the strongest evidence
- States decision with confidence, moves forward

**Pass criteria:**
- Hedging loop detected and explicitly called out
- Final answer is a clear recommendation (not "it depends")
- Confidence level reflects the strength of evidence
- No re-analysis after the decision is made
