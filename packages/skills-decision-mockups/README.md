# @dzhechkov/skills-decision-mockups

Current package version: `0.2.0`. <!-- dz:version -->

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/skills-decision-mockups

One skill: **decision-mockups** turns findings and real choices into a self-contained
Russian HTML decision page. It explains consequences, shows visible differences with CSS
mockups, offline flow/boundary diagrams or compact text, collects explicit answers and preserves their context.

This revision uses explicitly synthetic lesson-booking scenarios. Roles, dates, numbers,
interfaces and estimates are teaching conditions, not evidence about a working product.
Sample hostnames use `example.com`. Author and repository links retain their actual identity.

Install with DZ Harness Hub's skill installer:

```bash
dz install @dzhechkov/skills-decision-mockups
```

Then invoke `/decision-mockups` in a harness that supports skills, or describe the decision
page you need. This package contains skill files; it has no executable `bin` entry.

## What the method preserves

A fork has at least two useful alternatives. Each states its cost and consequence,
a recommendation has a reason, and the page explains when the other is appropriate.
When evidence is insufficient, v2 allows no recommendation with an explicit rationale.
A branch with no useful condition is removed and reported to the reader.

Findings answer three questions: what is wrong, what it costs the reader, how to address it.
Visible changes get before/after mockups; invisible scheduling choices get prose.
The tone adapts to the audience without dropping costs or decision structure.

A partially answered synthetic page exports:

```text
Решения по записи на занятия (04.05.2032):

Выбор 1 — день занятия: Показывать дату в каждой строке
Выбор 3 — начало записи: Открыть общую запись

Без ответа: Выбор 2
```

The unanswered tail disappears after all questions have answers. Labels follow document order.

## Opt-in versioned context (0.2.0)

Legacy pages without a manifest retain the same partial/full readable export. V2 adds a prepared
schemaVersion 2 manifest with page/revision and stable IDs. Its hashed material includes task,
done/remaining, why-now, constraints, risks/unknowns, evidence/source/basis, questions, options,
costs and rationale. Recommendations stay unselected. Four answer states remain distinct:
selected, deferred, needs-data and unanswered; selection never executes work.

```bash
python3 decision-mockups/references/check_answer.py --prepare manifest.json > current-manifest.json
python3 decision-mockups/references/check_answer.py current-manifest.json answer.json
# 0 current valid; 1 invalid/stale/reconfirmation; 2 usage/unreadable
```

The shipped Python stdlib receiver recomputes the current manifest digest and refuses stale,
tampered, wrong-page or invalid answers. Only explicit authoring preparation replaces a revision.
Raw duplicate keys/nonfinite numbers, unknown fields and malformed states fail closed. A returned
manifest never replaces the receiver's authoritative current context. Changed grounds require
whole-page reconfirmation even with unchanged option IDs; legacy strings are never migrated as consent.

Both pickers export readable material context and a **separate complete JSON answer document**
in a labelled readonly field/API. Receive that entire document; never extract a candidate JSON
from quoted prose/fences/hostile labels. Without a trusted current manifest, text remains readable
but version validation is pending. The digest proves neither source truth nor respondent identity.

Compact respondents answer full visible question/option/state labels; an agent constructs the
envelope only for an unambiguous explicit reply bound to its recorded presented page/revision.
The human does not edit JSON or copy hashes. Bare A/yes/recommendation, repeated labels or
missing binding require clarification. Compact text uses the receiver plus a semantic checklist;
it does not require HTML/CSS or the HTML gate. See `references/answer-contract.md` and
`examples/context-cases.md` for synthetic product/backend/two-question repeated-A/B examples.

HTML v2 parses a unique inert manifest and actual ancestry, visible label/context/evidence parity
and adjacent diagram text. IDs including prototype names, quotes and brackets remain data.
Keyboard state controls, reset focus and polite status supplement the existing themes/panel.
Browser, assistive technology and actual host evidence must be reported separately.
Validate the exact final HTML with `check_page.py` before delivery/use and after the last edit.
The raw gate rejects duplicate attributes and repair-dependent markup; a working browser picker
cannot certify that step because parsing can discard raw duplicates. Both pickers independently
check observable DOM/JSON/IDs/states and visible material, including descendants and computed
stylesheet visibility, before interaction/export. Hidden material cannot yield selected output.
Static gate checks do not render CSS or prove arbitrary legibility, source truth or AT speech.

This implementation is staged and unreleased until the delivery owner completes release gates.
Human pilot results and time savings remain unavailable until observed.

## Gate and checks

`decision-mockups/references/check_page.py` uses Python 3's standard library:

```bash
python3 decision-mockups/references/check_page.py page.html
# 0 — required checks pass; 1 — blocking failure; 2 — call error
node --test test/*.test.mjs
```

The gate has named rule families G0–G15 with subchecks. It catches structural problems,
including untokenised colours, inconsistent theme tokens, external resources, duplicate
fork IDs, groups with fewer than two options, a counter that does not derive from the DOM,
unfinished placeholders and a document shell. Some findings are advisory. It checks price
placement and vocabulary, not whether an estimate is true or an alternative is useful.

The unfilled template deliberately fails G13. Package tests also assemble each of the
three documented HTML fragments and their combined page with the real template, then run
the actual checker and both shipped picker variants against documented export contracts.
The test DOM adapter is focused on picker methods; it does not render a browser.
The repository suite `tests/decision-context-browser.test.mjs` uses real Firefox/WebDriver,
a measured narrow iframe, a recording/blocking proxy, BiDi request events and CSP attempted-block notices.
Run it from the repository root; Firefox/geckodriver are development prerequisites, not package dependencies.
`decision-mockups/BTO_REPORT.md` records the historical 2026-10-05 legacy baseline; it does not establish v2 acceptance. Current acceptance evidence is recorded separately in the development repository's `features/decision-context-answers/08_qe_report.md`, which is not part of this package.

## Files

| Path | Purpose |
|---|---|
| `decision-mockups/SKILL.md` | workflow, audience rules and manual invariants |
| `decision-mockups/examples/README.md` | three synthetic fragments, assembly recipe and expected exports |
| `decision-mockups/evals/eval-cases.md` | legacy and v2 independent behavioral/semantic requests and criteria |
| `decision-mockups/templates/page-skeleton.html` | styles, layout and inline picker |
| `decision-mockups/templates/picker.js` | configurable picker with the same export format |
| `decision-mockups/references/check_page.py` | legacy and opt-in v2 structural gate |
| `decision-mockups/references/check_answer.py` | prepare/receive stdlib contract boundary |
| `decision-mockups/references/answer-contract.md` | exact schema, compact reply and transport rules |
| `decision-mockups/examples/context-cases.md` | synthetic product/backend/compact cases |
| `decision-mockups/references/*.md` | gate explanation, language guidance and CSS components |
| `decision-mockups/BTO_REPORT.md` | historical 2026-10-05 baseline and its limits |

## Scope and revision status

The export and gate vocabulary are Russian. The HTML file is a fragment; the intended host
supplies the document shell. Variants are buttons with `aria-pressed`, with one active choice
per group; arrow-key radio-group semantics are not implemented. Groups are flat.

The skill can explain a status with no decisions, but the unchanged gate rejects zero groups
with G6a. Do not invent a choice to satisfy that check; disclose the limitation.

A new release does not replace bytes published under earlier npm versions.
These synthetic examples make no claim of absolute non-linkability.
No historical owner approval or evaluation score carries over.

Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub). Author: @dzhechkov / djd1m.
MIT license.
