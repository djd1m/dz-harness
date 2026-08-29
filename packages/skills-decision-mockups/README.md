# @dzhechkov/skills-decision-mockups

One Claude Code skill: **`decision-mockups`** — turn a review, an audit or an architecture fork into a
single self-contained HTML page that a **non-engineer** can read and answer, and get their answers
back as text you paste into the session.

```bash
npx @dzhechkov/skills-decision-mockups   # or: dz install @dzhechkov/skills-decision-mockups
```

Then, in Claude Code: `/decision-mockups` — or just describe the situation; the skill triggers when a
stakeholder has to choose between real alternatives.

## What it is for

An engineer has four architecture forks and needs the product owner to pick. Writing them in chat
gets a "do what you think is best". Writing an ADR gets nothing at all — the owner does not read
diffs. This skill produces the third thing: a page that explains the position in plain language,
shows the visible difference where there is one, makes each fork clickable, and hands back an export
like this:

```
Решения по переносимому бандлу телеметрии (13 августа 2026):

Решение 1 — куда класть привезённые следы: На общие полки — рекомендуем
Решение 2 — складывать ли ответ «кто делал стадию»: Сложить внутри, рядом с фактами

Без ответа: Решение 3, Решение 4
```

That text is self-explanatory in a fresh chat, and partially-answered pages export cleanly — the
unanswered forks are listed rather than dropped.

## The idea that makes it different from "generate a nice HTML report"

> **«Развилка с одним вариантом — мнимая. Это не выбор, а уже принятое решение, которому пририсовали
> кнопку.»**

A generic report prompt optimises appearance. This skill makes deceptive interaction **fail
mechanically**. Before anything is drawn, every candidate fork is tested: are both branches alive? A
branch that is worse on every axis, or costs more with no gain, is not a choice — it is a decision
already made, and showing it spends the reader's attention on nothing. Fake forks are removed and the
removal is reported, so the reader knows what they were not asked.

The same discipline runs through the rest: every option states its price in days or rework (the word
"recommended" is not a price); exactly one option per group is marked as recommended; each finding
answers exactly three questions — what is wrong, what it costs, how we fix it; a term never appears
before the everyday analogy that introduces it.

## The gate

`references/check_page.py` — zero dependencies, Python 3 stdlib only. Publication is forbidden while
it is red.

```bash
python3 <skill>/references/check_page.py page.html
# 0 — publishable · 1 — blocking failure · 2 — called wrong
```

It enforces ~45 gates (G0–G14), nearly all blocking: unbalanced `div`s, a colour written outside the
theme tokens (including inside `style="…"`), a token declared only in the light theme, a dark block
that copied the light values, any external resource (CDN, font, image — all blocked by the artifact
CSP anyway), a duplicate fork id, **a fork with only one option**, a counter typed by hand instead of
derived from the DOM, a leftover template placeholder, and a stray document shell.

It is honest about its own limits: a handful of checks are advisory, and the price-of-an-option check
proves structural placement, not that the stated price is true. The manual checklist in `SKILL.md`
covers exactly what a regex cannot.

**Built-in negative control:** the shipped template deliberately FAILS the gate (it still contains its
placeholders). An unfilled skeleton must never count as publishable — and it means you can verify the
gate discriminates by running it once, before trusting it.

## What ships

| Path | What |
|---|---|
| `decision-mockups/SKILL.md` | the 8-step process, 14 hard invariants, the antipattern table |
| `decision-mockups/templates/page-skeleton.html` | the page: header, 60-second summary, finding cards, mockups, question cards, sticky picker — and the full theme palette declared in all three states |
| `decision-mockups/templates/picker.js` | the same picker as a configurable module, when you need your own storage key |
| `decision-mockups/references/check_page.py` | the gate |
| `decision-mockups/references/quality-checklist.md` | every gate explained: what blocks and why |
| `decision-mockups/references/language-guide.md` | writing for a non-engineer, with bad → good pairs |
| `decision-mockups/references/mockup-kit.md` | the browser-frame before/after CSS kit |
| `decision-mockups/examples/README.md` | a finished page taken apart block by block |
| `decision-mockups/evals/eval-cases.md` | five eval cases, incl. one that tests principled non-compliance with a request for a fake fork |
| `decision-mockups/BTO_REPORT.md` | how it was built and scored, with the author's own open issues |

## Honest scope

- **The skill writes Russian.** The gate hard-requires the Russian export literals (`Решения по`,
  `Без ответа`, `Скопировано`), and the price-check vocabulary is Russian. An English page would need
  the gate generalised first.
- **Publication assumes a host that supplies the document shell and blocks external hosts** — the
  page is an HTML fragment, deliberately without `<!doctype>`/`<html>`/`<body>`.
- **Interaction is button-shaped, not radio-shaped.** Behaviour is radio-like (one active option per
  group) but the markup is buttons with `aria-pressed`; full `radiogroup` semantics with arrow-key
  navigation are an open item in `BTO_REPORT.md`, and the skill says so rather than implying them.
- **Forks are flat, not nested.** Nested groups would make option counting and event ownership
  ambiguous.

## Status

`0.1.3` — **the calque hunt is now a gate, not a checklist bullet (G15/G15b).** The owner caught three
transliterations on a live page that a checklist item had already been asked to catch; a checklist
bullet is judgment, a regex is deterministic, so `references/check_page.py` now BLOCKS on a measured
word list and publication fails on a red. A line may be waived with `<!-- calque: <reason> -->`
(the `no-stubs` convention): the token counts only inside an HTML comment, the reason must carry real
words, and a waiver without one is refused loudly and exempts nothing. Three words are deliberately
EXCLUDED after measuring them against the real page — «коммит» and «фича» fire falsely (they are the
owner's own vocabulary) and «воркер» is endorsed by this skill's own `language-guide.md` exemplar.

Hardened the same day against a cross-family review (three findings, all reproduced): declension
coverage extended, the waiver token bound to a comment container instead of the whole line, and the
line/column computation switched to a single separator on both sides — `str.splitlines()` also breaks
on U+2028/U+2029, so one such character inside `<style>` made the two views disagree and a finding
point at the WRONG line.

Also: `decision-mockups` now ships inside `@dzhechkov/skills-meta` and the `meta` preset. Triggers
widened to plain-language asks (the skill once failed to route because its triggers demanded "5+
decisions" — the failure was routing, not absence), and every recommendation must name why it wins
AND when the alternative is right.

`0.1.1` — first release. Tier 2 (BTO layer-2 score 7.53).
Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub).
