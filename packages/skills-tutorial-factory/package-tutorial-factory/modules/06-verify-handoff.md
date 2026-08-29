# Module 06 — Verify & hand off (read-only)

A read-only gate before "done." No writes except the optional provenance record.

## Checks (all must hold)
1. **Head First gate PASS** — re-run
   `node "$SKILL_ROOT/scripts/headfirst-gate.mjs" --course <course.json>` (exit 0).
2. **IP clean (ADR-004)** —
   `node "$SKILL_ROOT/scripts/shingling-check.mjs" --source <corpus> --output <course-or-KB>`
   → zero verbatim runs ≥8 words. (In CI the raw corpus is absent — run locally where the gitignored
   corpus lives; record the verdict + date.)
3. **KB resolved** — the authored course cites only pattern ids present in
   `references/head-first-method.md` (grounding was live, not decorative).
4. **Site runs** — `node "$SKILL_ROOT/scripts/verify-site.mjs" --site <dir>/site/index.html` exits 0 against the
   site ALREADY rendered by Step 5 (the site is EXECUTED and driven; this step stays read-only —
   render exit-0 evidence belongs to Step 5). For the opt-in edu-site medium, additionally
   `npm run build` succeeded; for the markdown medium, the chapters rendered.

## Optional — record provenance
```bash
dz teach "package-tutorial-factory produced a Head First course for <pkg> on <date>; gate PASS, IP clean, review grade <G>" --type success-pattern --project <brain>
```

## Definition of done
Gate PASS + IP clean + KB resolves + site renders AND runs (verify-site exit 0), with the dogfood
evidence (verdicts + date) captured.
If any fails, return to the step that owns it — never relax the gate to reach done (INV-5).
