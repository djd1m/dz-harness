# Evidence contract

The extractor emits `package-evidence/1` with:

- `package`: name, version, description;
- `sources[]`: local records with stable id, relative path, SHA-256, and line count; plus any explicitly
  supplied external records with id, dated HTTPS URL/check date, and a relative SHA-bound local receipt;
- `commands[]`: package scripts and bin entries;
- `readmeExamples[]`: fenced README blocks with source line ranges;
- `claims[]`: facts copied from package metadata with source ids;
- `unknowns[]`: information the extractor cannot prove.

Story claims must reference one or more `sources[].id`. A source pointer proves only that the package
states something; it does not prove a marketing claim true in the world, and a package author can
publish misleading documentation. Preserve uncertainty.

Every story-brief source is exactly one of:

- local: `{ id, path, sha256, lineRange: [start, end] }`;
- external: `{ id, url: "https://...", checkedAt: "YYYY-MM-DD", receiptPath, sha256, lineRange }`.

Do not cite a whole package merely because it contains a plausible statement. Read the file and narrow
the local line range to the evidence used by the claim; one range may span at most 40 lines. The verifier requires the id/path/SHA to match
`package-evidence/1`, re-reads the current file below `--pkg`, rejects symlinks/escapes, and checks that
every exact numeric token and its field/unit context occur on the same line inside one of its cited
local ranges. Numeric external
claims are not accepted by the deterministic gate; capture the supporting material as current local
evidence or mark the claim unknown.

The extractor reports source/example limits in `truncation` and appends every applied truncation to
`unknowns`; a bounded scan is never presented as complete.

For an external fact supplied by the user, save the relevant material below the package root and add its
dated HTTPS record, `receiptPath`, SHA-256, line count, and bounded line range to the original evidence
artifact before authoring the brief. The receipt itself must name the exact URL and `checkedAt` date;
the verifier re-reads it and requires an exact record match. This binds a reproducible local receipt to
the record, but does not prove that anyone fetched those remote bytes. Do not browse implicitly or turn search
snippets into evidence.

Sensitive/current scenarios use labelled synthetic inputs. Health pages cannot diagnose or prescribe;
travel pages cannot promise that a venue, review, price, timetable, or contact is current without a dated
source and visible recheck note.
