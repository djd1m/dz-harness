# Synthetic decision-mockups: unreleased review candidate

No npm publication, deprecation, deletion or history rewrite was performed. Version fields identify the source baseline, not a newly published release. Public main remains a mirror of registry contents; this review branch is an explicit exception.

## Product result and replacements

The skill retains its decision-page teaching value while replacing work-derived material with explicitly synthetic examples.

| Risk removed | Synthetic replacement / retained lesson |
| --- | --- |
| Working-product names, URLs, interface labels | Lesson booking on reserved example domains; date in a row versus a day selector |
| Recognizable operational report narrative, roles and numeric combinations | Reminder delivery timing and public workshop confirmation, with different roles, data and mechanics |
| Real-page and owner-approval provenance | Explicit synthetic provenance; no inherited live-owner validation claim |
| Work-specific export topic/date | Synthetic partial and complete answers; unanswered questions remain listed |
| Historical quality scores attached to changed examples | Only newly observed structural/test evidence; no new model-quality score claimed |

Viable versus fake forks, costs and consequences, visible before/after differences, absence of invented mockups for invisible effects, and audience adaptation are retained. Authorship, scope, MIT license and repository identity are preserved. Repository directory now points at the actual public package path.

## Verification

- `node --test test/gate.test.mjs`: seven passed, zero failed/skipped, independently repeated. Three documented HTML fragments assembled individually plus one combined page pass shipped `check_page.py`.
- The unfilled shipped skeleton still fails (exit 1 / G13); missing arguments/path still return exit 2.
- Both actual picker implementations execute against example markup in a focused Node VM adapter, validating documented partial/full export, click/keyboard selection, restoration and reset.
- Python gate AST, picker executable body, inline script and CSS are unchanged against the source baseline. Test data/comments/prose changed; gate rules and export format did not.
- All three source skill projections match. Standard `dz sign` regenerated manifests/SBOM for standalone and skills-meta; both standard prepublish gates passed.
- Final actual npm archives: 15 standalone files and 143 skills-meta files; inventories equal their baseline package inventories. Trusted signatures pass. Every extracted file equals the normally signed pnpm payload, including package.json, manifest and SBOM. No tests, scratch files or private keys entered the archives.
- Targeted identifier scan found no supplied working identifiers in the standalone archive/related vendored skill. Independent semantic review checks combinations beyond literal search.

### Packaging limitation

Direct `npm pack` of source was tested and its signature check FAILED: pnpm removes prepublishOnly and rearranges package.json while the normal signer signs that packed form. The passing candidates were produced by normal `pnpm pack`, safe extraction, then actual `npm pack` of that unchanged signed payload. Full payload equality and trusted verification passed. No signing logic or gate was bypassed/changed. This task does not fix direct-source cross-packer compatibility. Normal future publication must use the project's release pipeline and newly signed version.

### Scope limits

The VM adapter is not a real browser: visual rendering, accessibility, real clipboard/fallback and timed label reset were not accepted by these tests. The existing gate rejects zero-fork pages (G6a); that behavior is unchanged and now documented. The generic skill-creator validator rejects existing custom `tier` frontmatter; compatibility is not claimed. Other skills inside skills-meta are outside this anonymization scope. No absolute non-linkability guarantee is made.

## Existing registry version and next step

The existing npm 0.1.8 archive remains available and unchanged by this candidate. Git history, mirrors and caches also retain prior material. Review these changes, then separately authorize a new version through the normal release process. Optional old-version actions require a separate decision: deprecation adds a warning but retains the archive; unpublishing is subject to npm policy and cannot erase independent copies. No such external action was taken.

- https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions/
- https://docs.npmjs.com/policies/unpublish/

## Candidate archive SHA-256

- `@dzhechkov/skills-decision-mockups@0.1.8`: `5babe664ec44221b7b736fff34e075aafc2d578fb6d85b2b21ba1d24969af904`
- `@dzhechkov/skills-meta@0.9.63`: `8dc9578c9ddc4dece751d381647323f26dafb5a2346bb3125a66bf7dc6247b18`

Public review-only extra: `packages/skills-decision-mockups/test/gate.test.mjs` is a development test, excluded from candidate archives. Run with Node and Python 3 from that package directory. The other 54 package trees are unchanged.
