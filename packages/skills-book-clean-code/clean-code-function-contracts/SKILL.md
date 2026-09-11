---
name: clean-code-function-contracts
description: >
  Проектируйте одну операцию функции: узкую сигнатуру, command/query, видимый эффект и явный порядок вызовов. NOT для generic SOLID/refactoring guidance → solid; NOT для post-diff review → pr-review; NOT для владельца класса/данных — clean-code-object-data-ownership. NOT для exception/null boundary — clean-code-error-and-boundary-handling.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-ch03-p59-ku01,clean-code-ch03-p60-ku02,clean-code-ch03-p61-ku03,clean-code-ch03-p61-ku04,clean-code-ch03-p62-ku05,clean-code-ch03-p63-ku06,clean-code-ch03-p65-ku07,clean-code-ch03-p65-ku08,clean-code-ch03-p66-ku09,clean-code-ch03-p67-ku10,clean-code-ch03-p69-ku11,clean-code-ch03-p70-ku12,clean-code-ch03-p71-ku13,clean-code-ch03-p71-ku14,clean-code-ch03-p72-ku15,clean-code-ch03-p74-ku16,clean-code-ch03-p74-ku17,clean-code-ch03-p75-ku18,clean-code-ch03-p76-ku19,clean-code-ch03-p76-ku20,clean-code-ch15-p295-ku04,clean-code-ch15-p296-ku05,clean-code-ch15-p297-ku06,clean-code-ch15-p299-ku07,clean-code-ch15-p302-ku08,clean-code-ch16-p314-ku12,clean-code-ch16-p315-ku13,clean-code-ch16-p316-ku14,clean-code-ch16-p317-ku15,clean-code-ch16-p318-ku16,clean-code-ch17-p326-ku04,clean-code-ch17-p342-ku07,clean-code-ch17-p343-ku08,clean-code-ch17-p344-ku09]
---
# Function contracts

## Protocol

1. Identify one operation and one abstraction level. <!-- KU: clean-code-ch03-p61-ku03,clean-code-ch03-p59-ku01 -->
2. Reduce or group arguments. In object-oriented APIs, reject output arguments. Treat a boolean selector as a reason to separate concealed alternatives. <!-- KU: clean-code-ch03-p65-ku08,clean-code-ch03-p67-ku10,clean-code-ch03-p71-ku13,clean-code-ch17-p326-ku04 -->
3. Separate command from query and name the complete observable effect. <!-- KU: clean-code-ch03-p70-ku12,clean-code-ch03-p71-ku14,clean-code-ch15-p295-ku04 -->
4. Carry a prerequisite result into the next operation when call order is real. <!-- KU: clean-code-ch15-p297-ku06,clean-code-ch17-p343-ku08 -->

## Anti-patterns

- A function with sections, nesting deeper than one or two levels, a boolean selector signaling behavior to separate, and a hidden mutation. <!-- KU: clean-code-ch03-p61-ku04,clean-code-ch03-p60-ku02,clean-code-ch17-p326-ku04,clean-code-ch03-p70-ku12 -->
- Making callers remember preparation order that the API can encode. <!-- KU: clean-code-ch15-p297-ku06,clean-code-ch17-p343-ku08 -->

## Related decisions — generated from verified KU cross-link graph

- `clean-code-object-data-ownership`: move an operation when another type owns the data. <!-- XL: function-signature-and-call-contract -->
- `clean-code-test-suite-feedback`: preserve the existing behavioural contract while changing it. <!-- XL: safe-incremental-refactoring -->

## Source

Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 3: с. 59–76; глава 15: с. 295–302; глава 16: с. 314–318; глава 17: с. 326, с. 342–346.

## Anchor quotes

- «Первое правило: функции должны быть компактными. Второе правило: функции должны быть еще компактнее.» [с. 59] <!-- KU: clean-code-ch03-p59-ku01 -->

## Self-check — agent adaptation, not from the book

- Can the caller state one action and its full visible consequence?
- Can an invalid call order occur without a nonsensical argument?

Agent adaptation, not from the book: Example: Replace `pay(boolean overtime)` with named operations rather than making callers decode `true`.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.
