# Output formats

## Markdown (always)

Write `news-digest-<topic>-<period>.md`:
- Title + period header → executive summary → headline section (+ comparison table) → adaptive sections
  → conclusions → **Source Index**.
- Inline citations: `fact ([Source Title](URL))`. ≥ 1 per sub-section; ≥ 5 across the executive summary.
- Source Index at the end: every URL grouped by the profile's categories. Deduplicate.
- Verify Markdown tables render before delivering.

## DOCX (optional)

Produce a `.docx` only if the user asks for it. Two clean paths — pick whichever the environment supports;
**do not block on DOCX** — if it fails after a couple of attempts, deliver the `.md` and say so.

### Path A — host `docx` skill (preferred when available)

If the runtime exposes a `docx` document skill, follow it. Build the document with **inline clickable
hyperlinks in the body** (not just in the appendix), a styled comparison table, headings, and the source
index. Validate the file with whatever validator the docx skill provides; fix and re-run on error.

### Path B — Markdown → DOCX via pandoc (portable fallback)

```bash
pandoc news-digest-<topic>-<period>.md -o news-digest-<topic>-<period>.docx
```

Pandoc preserves Markdown inline links as clickable hyperlinks and renders tables. Apply a reference
docx (`--reference-doc=`) if a house style is needed.

### Notes

- Keep the body's inline citations — readers should not have to scroll to the appendix to reach a source.
- A 400–600 line document is normal for a STANDARD digest; build it iteratively, validate, then deliver.
- This skill ships **no proprietary DOCX template**; use the host's docx tooling or pandoc above.
