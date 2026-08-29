---
name: health-advisor-critical-appraisal
description: Deterministic transparency checks on a published study or registered trial — retraction status, retracted citations, registration timing, registry record changes, enrollment actuality, results timeliness. Reports dated record facts with refutation paths; never a score, never an accusation of intent.
---

# Critical Appraisal — the deterministic transparency layer

Run the engine through the front-end script (invoke through the installed package, never through a
relative path inside this skill directory):

```bash
node scripts/appraise.js --nct NCT04368728 --json
node scripts/appraise.js --doi 10.1016/S0140-6736(97)11096-0 --format md
```

## Overview

Детерминированный слой прозрачности публичной записи исследования: статус отзыва статьи,
отозванные цитирования, тайминг регистрации, правки реестровой записи, актуальность набора,
своевременность результатов. Каждый вывод — датированный факт записи с путём опровержения;
никогда не оценка, не балл и не обвинение в умысле. Работает офлайн-детерминированно поверх
снапшотов реестров; `unknown` — ожидаемый ответ для большой части корпуса (см. границы ниже).

## The axis boundary — read this first

This layer answers one question only: **is the public record of this study transparent?**
It is **NOT** an assessment of risk of bias, and the two axes are empirically unrelated — a study
can have a pristine record and flawed methods, or a messy record and sound methods. Never present
these findings as a quality or bias judgement.

## What the model must never do with this output

- **Never summarize the findings into one verdict sentence, score, grade or star count.** The
  domain table is the output. `worst verdict recorded` is categorical context beside the table,
  not a headline.
- **Never draft or send an outbound post, review comment, or public flag from a finding.** Findings
  are local. The only letter this tool drafts is a private letter to the authors
  (`--letter`), and sending it is a human decision.
- **Never read `unknown` as failure.** `unknown` means the record could not be observed — it is
  reported in its own channel as `not assessed`, and it is the expected answer for much of the
  corpus. Expect MORE of it than you might guess: a field the registry carries but does not label
  `ACTUAL`, a date with ISO shape that names no day on the calendar (`2021-02-29`, `2020-13`), an
  index that checked fewer references than it was given, a change log that reports an edit our two
  snapshots cannot show — each is `unknown` with its own named reason, never a concern and never a
  clean bill. An undeterminable input is not a verdict in either direction.
- **Never turn a dated record fact into a claim about intent.** The registry says *when* a field
  changed; it does not say *why*.

## Anti-Patterns

- Сводить таблицу доменов в один вердикт/балл/звёзды — таблица И ЕСТЬ вывод (см. запреты выше).
- Читать `unknown` как «подозрительно» или как «чисто» — это «не наблюдалось», третий канал.
- Публиковать находку наружу (пост, комментарий, флаг) — находки локальны; единственное письмо
  инструмента — приватное письмо авторам, и отправляет его человек.
- Запускать движок относительным путём из каталога навыка — только через установленный пакет.

## Dependencies

- `node scripts/appraise.js` — движок пакета health-advisor (ставится вместе с ним; вне пакета
  навык не работает — это осознанная зависимость, не забытая).
- Снапшоты реестров (ClinicalTrials.gov и Retraction Watch через движок) — сеть нужна только на
  этапе получения снапшота; сама оценка детерминирована и офлайн.

## Exit codes

`0` — no concern recorded · `1` — at least one concern (read the table) · `2` — the majority of
findings are `unknown`; **2 dominates 1**, so treat it as "look at the output", never as "clean".

## References

- `references/transparency-vs-bias.md` — the dividing line, and what this layer does not claim
- `references/retraction-notices.md` — notice classes and the two live label spellings
- `references/registry-vs-publication.md` — the registry-vs-publication comparison (CA-2)
