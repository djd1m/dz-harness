---
name: package-story-page
description: Turn one existing software or skill package into a short, evidence-backed, examples-first story page with a self-contained HTML artifact. Use when the user wants a clear package landing, visual explanation, or demo page rather than a full tutorial course.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# package-story-page

Build a page that lets a non-specialist see the package work before reading how it works.

## Portable root

Resolve `SKILL_ROOT` as the absolute directory containing this installed `SKILL.md`. Run bundled tools
only as `node "$SKILL_ROOT/scripts/<entrypoint>.mjs" ...`. Never search a monorepo parent for sidecars.

## Default pipeline

1. Read [the evidence contract]($SKILL_ROOT/references/evidence-contract.md). Extract local package
   evidence:

   ```bash
   node "$SKILL_ROOT/scripts/extract-package-evidence.mjs" --pkg <package-root> --json <evidence.json>
   ```

2. Read [the story contract]($SKILL_ROOT/references/story-contract.md) and
   [visual contract]($SKILL_ROOT/references/visual-contract.md). Author one `package-story-brief/1`
   object. Copy each local source's id, relative path, and SHA-256 from step 1; narrow its line range
   to at most 40 lines actually supporting the claim. An external record must already be present in the
   supplied evidence artifact and its SHA-bound local receipt; the receipt must name the exact URL and
   check date, without claiming that the pipeline fetched it. Numeric claims require exact token plus
   field/unit context on the same line. Put factual numbers in claims, not other marketing prose. Use
   `unknown` when proof is absent.
   Add the six typed `visuals` entries required by the story contract; each must name both the visual
   kind and the concrete direction for that section.
3. Render the default offline page:

   ```bash
   node "$SKILL_ROOT/scripts/render-story-page.mjs" --brief <brief.json> --out <site/index.html>
   ```

4. Verify the trusted factory output:

   ```bash
   node "$SKILL_ROOT/scripts/verify-story-page.mjs" --brief <brief.json> --site <site/index.html> --evidence <evidence.json> --pkg <package-root>
   ```

The verifier executes no page JavaScript, makes no network request, and is not a validator for hostile
third-party HTML. Stop on any red result.

5. When Firefox and geckodriver are available, measure the real responsive artifact:

   ```bash
   node "$SKILL_ROOT/scripts/verify-story-page-browser.mjs" --site <site/index.html>
   ```

   This gate checks 320, 390, 768, and 1440 px. It must run before a release claim; it is not replaced
   by `overflow-x: hidden` or a CSS-text assertion.

## Non-negotiable decisions

- The example appears before architecture, installation, cost, security, and FAQ.
- Claims resolve to SHA-matched local line ranges or dated HTTPS records with local receipts already supplied in evidence. Never invent popularity, reviews,
  benchmarks, prices, compatibility, or current medical/travel facts.
- Use `synthetic: true` for every example so its visible label is mandatory. Show the inspectable output, not “magic happened”.
- Visual directions explain state, flow, comparison, or artifact shape; decoration is optional.
- Optional installed skills may improve a stage (`brand-voice`, `presentation-storyteller`,
  `design-taste-frontend`), but the default pipeline cannot depend on them.
- Use `package-tutorial-factory` instead when the user wants a full course, exercises, achievements,
  or a final test.

## Handoff

Return the evidence path, brief path, HTML path, verifier result, unsupported/unknown claims, and the
exact commands needed to regenerate the page.
