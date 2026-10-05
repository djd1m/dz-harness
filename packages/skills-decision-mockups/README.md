# @dzhechkov/skills-decision-mockups

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/skills-decision-mockups

One skill: **decision-mockups** turns findings and real choices into a self-contained
Russian HTML decision page. It explains consequences, shows visible differences with CSS
mockups, collects answers and exports text for a fresh chat.

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
one is recommended with a reason, and the page explains when the other is appropriate.
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

## Gate and checks

`decision-mockups/references/check_page.py` uses Python 3's standard library:

```bash
python3 decision-mockups/references/check_page.py page.html
# 0 — required checks pass; 1 — blocking failure; 2 — call error
node --test test/gate.test.mjs
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
Measured current results and remaining limits are in `decision-mockups/BTO_REPORT.md`.

## Files

| Path | Purpose |
|---|---|
| `decision-mockups/SKILL.md` | workflow, audience rules and manual invariants |
| `decision-mockups/examples/README.md` | three synthetic fragments, assembly recipe and expected exports |
| `decision-mockups/evals/eval-cases.md` | five future behavioral evaluation requests and criteria |
| `decision-mockups/templates/page-skeleton.html` | styles, layout and inline picker |
| `decision-mockups/templates/picker.js` | configurable picker with the same export format |
| `decision-mockups/references/check_page.py` | deterministic gate |
| `decision-mockups/references/*.md` | gate explanation, language guidance and CSS components |
| `decision-mockups/BTO_REPORT.md` | current validation record and limits |

## Scope and revision status

The export and gate vocabulary are Russian. The HTML file is a fragment; the intended host
supplies the document shell. Variants are buttons with `aria-pressed`, with one active choice
per group; arrow-key radio-group semantics are not implemented. Groups are flat.

The skill can explain a status with no decisions, but the unchanged gate rejects zero groups
with G6a. Do not invent a choice to satisfy that check; disclose the limitation.

Version remains `0.1.8`. These repository edits are an **unreleased review candidate**;
they do not replace bytes already published under that version. They make no claim of
absolute non-linkability. No historical owner approval or evaluation score carries over.

Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub). Author: @dzhechkov / djd1m.
MIT license.
