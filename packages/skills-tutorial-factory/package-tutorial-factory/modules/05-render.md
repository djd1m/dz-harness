# Module 05 — Render (the factory's executable seam)

The gated course.json is rendered by the factory's OWN deterministic renderer — no model writes the
site, no agent judgment decides whether it "built".

## Primary medium — scripts/render-site.mjs (self-contained single-file SPA)

```bash
node "$SKILL_ROOT/scripts/render-site.mjs" --course <dir>/course.json          # → <dir>/site/index.html
node "$SKILL_ROOT/scripts/verify-site.mjs" --site <dir>/site/index.html        # DRIVE it: exit 0 = it works
```

Before reading the course object, the renderer calls the shared `course-source-stamp.mjs` writer.
It derives the package from the tutorial README's npm link (or an explicit `--package`) and obtains
the version with `npm view`; a local `package.json` is never a version authority. On success it writes:

```json
"source": {
  "package": "@scope/published-package",
  "version": "1.2.3",
  "authoredTs": "2026-09-02T12:00:00.000Z"
}
```

No hand edit is required. If npm is unavailable, render remains usable but leaves `source.version`
absent and reports the condition; downstream classification therefore cannot call the course shipped.
`mirrorReceipt` is optional and stays absent unless a real mirror-manifest receipt is supplied.

One dependency-free HTML file (opens over file://, zero network) with the full edu-site primitive
set: sections in order, the 6 exercise types, per-section quiz, achievements, final test with pass
threshold, FAQ, persisted progress. Deterministic: same course, same bytes — render is CI-able.

The verifier does not parse the page, it EXECUTES it against a DOM shim and walks it like a learner
(opens every section, completes every exercise by clicks, takes the final test) and asserts recorded
STATE (scores, progress, unlocked achievements). A green verify means the course runs, not that the
HTML is well-formed.

Optional authored fields the renderer honours (all omit-safe, nothing is fabricated):
- `introNote` — an honesty/context paragraph on the intro card
- `introHeading` — the section-list heading (default "What you will learn")
- `outro.pass` / `outro.next` — final-test flavour after the structural "Passed —" prefix
- `exercise.successFeedback` — builder-exercise success line
- per-section `notebook {when, note}` — the persona's margin-note device; if ANY section has one,
  EVERY section must (verify-site enforces device consistency)

## Secondary medium — edu-site-generator SPA (agent skill, opt-in heavyweight)
When the caller explicitly wants the React/Vite gamified site, delegate to the `edu-site-generator`
skill (its Steps 1–7) mapping the course object per `edu-site-generator/references/data-schemas.md`
— and still assert `npm run build` succeeds. This path involves a model hand-writing a project; the
deterministic renderer above remains the reference implementation the result is compared against.

## Tertiary medium — ordered markdown (caller opt-in, `--medium markdown`)
PocketFlow-style ordered chapters: one file per section, theory + exercise as text. Cheaper; loses
interactivity (recorded as a medium limitation, not faked).

## Checkpoint `review-course`
Show the rendered site path + the verify-site verdict + the gate verdict + the Plane-2 grade.
`"ok"` → verify & hand off.
