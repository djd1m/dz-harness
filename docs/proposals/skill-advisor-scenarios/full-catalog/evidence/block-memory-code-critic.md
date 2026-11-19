# Focused code critic — streaming schema-1 snapshot digest

Read-only review of the five-line digest implementation change and compatibility fixture. No tests, container actions or provider calls executed.

Verdict: **no new material code defect identified; memory recovery remains unproven until the actual8,926-document smoke completes.** No release or technical-runtime pass is granted here.

## God-object growth (BLOCKING)
None.

## Security violations (BLOCKING / HIGH)
None. Full content integrity checking is retained, not skipped to save memory. Existing manifest identity, row count, lexical consistency and vector validation still run.

## Architectural concerns (HIGH / MEDIUM)
None. Both digest call sites receive dense, validated, sorted rows from rowsFor. For those plain JSON rows, writing `[`, each JSON.stringify(row) separated by commas, and `]` produces exactly the UTF-8 bytes of the prior JSON.stringify(rows). Field ordering, Float32-normalized numbers, escaping and Unicode representation remain the same. It does not introduce a new schema or invalidate existing snapshot content digests. No public API changes.

## Anti-pattern violations
None. The fix removes a single giant serialized string and its hashing conversion; it does not duplicate snapshot rows into another persistence layer or weaken verification.

## Type / contract issues
No issue in actual callers. Generic sparse-array/undefined/toJSON behaviors need not be supported by this private helper because rowsFor creates ordinary defined row objects with validated strings and finite numeric vectors. Hashing row strings separately cannot split a Unicode code point across updates: each complete row is independently JSON serialized.

## Edge-case sweep
Inspected empty/invalid document rejection upstream, sorting, field order, Unicode/escaped strings, Float32 conversion, old schema compatibility and reopening. The added fixture calculates the old whole-array hash independently from stored rows and compares it to the new manifest, then reopens through the real verifier. It therefore tests the compatibility property that matters.

## Test quality
New test is behavioral and uses actual stored Lance rows, not a mock of hashing. Reviewer did not run it or infer a passing result merely from its presence.

## Process / done-ness gaps
block-oom-observation.json records the actual failure:8,926 documents,536,870,912-byte search memory limit, OOMKilled=true, exit137 at initial whole-array digest startup, production untouched. At review time runtime-smoke-blocks-v2.log was empty. Preserve the original failure and require the running smoke's actual completion result before claiming recovery.

## Production safety
The fix plausibly removes a large peak allocation but does not make startup fully streaming: openSnapshot still materializes stored rows, intermediate vector copies, normalized rows and lexical lookup before integrity checking. This is an explicit limit, not a speculative request for another redesign. The decisive evidence is startup plus actual search under the unchanged advisor256MiB/search512MiB limits on the real8,926-document snapshot. A small compatibility fixture cannot establish that resource envelope. Previous semantic NO-GO gates are unaffected even if the smoke succeeds.

## Suggestions only (LOW)
None.

## Skipped checks (transparency)
No tests, benchmarks, memory measurement or smoke execution performed. No paid evaluation or outcome review. No source changes or native gate updates. Actual v2 smoke remains pending at inspection time.
