# Visual contract

The default renderer is a restrained light-to-dark control-room narrative:

- system-ui only; no remote fonts;
- one blue action signal and one amber attention signal;
- rounded 16–20 px cards, hairline borders, low-opacity shadows;
- the real input/output artifact is the hero visual;
- flow, comparison, timeline, or artifact frames before decorative imagery;
- headings use responsive `clamp()`, while body text remains readable at 320–1440 px;
- no `word-break: break-all`, automatic Russian hyphenation, hover-only meaning, or motion required to
  understand state;
- native `<details>/<summary>` disclosures provide local interaction without page JavaScript.

Do not hide page overflow with `overflow-x: hidden` or `clip`. Before release, run the bundled Firefox
gate at 320, 390, 768, and 1440 px; it measures the rendered browsing context rather than inferring
layout from CSS text.

If the user supplies `DESIGN.md`, preserve its design tokens and product-independent visual rules. Do
not copy the referenced product's content, brand claims, or imagery.
