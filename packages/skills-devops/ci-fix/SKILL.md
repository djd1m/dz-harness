---
name: "ci-fix"
description: "Diagnoses and fixes CI pipeline failures."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# ci-fix

Find the actual failure (not the noise), figure out if the bug is in code, test, or environment, and fix it at the right layer. CI logs are noisy -- your job is to cut through the noise to the root cause.

## When to use

- User pastes a CI failure log or error output
- User says "PR checks are red" or "build is broken"
- User has a flaky test that fails intermittently in CI
- User wants to fix a recurring CI issue
- User asks why CI passed locally but failed in the pipeline
- User asks to debug GitHub Actions, GitLab CI, or other CI system

## When NOT to use

- User wants to set up CI from scratch (that is general DevOps work)
- User wants a code review (use `pr-review`)
- User wants to fix a security alert (use `security-audit` or `codeql-fix`)
- CI is green and the user just wants to understand the workflow

## Procedure

1. **Read the actual failure line.** CI logs can be thousands of lines. Search for keywords: `Error`, `FAIL`, `FAILED`, `error:`, `exit code`, `fatal`, `panic`, `Exception`, `AssertionError`. Ignore warnings, deprecation notices, and download progress bars. Find the first real failure -- everything after it may be cascade damage.

2. **Classify the failure type:**
   - **Build failure:** Compilation error, missing dependency, type error, syntax error. The code does not compile or bundle.
   - **Test failure:** An assertion failed, a test timed out, a snapshot does not match. The code compiles but behaves incorrectly.
   - **Lint/Format failure:** ESLint, Prettier, Clippy, etc. found violations. The code works but does not meet style rules.
   - **Deploy failure:** Image build failed, Terraform plan errored, Kubernetes rollout stuck. Infrastructure issue.
   - **Infra/Environment failure:** Runner out of disk, OOM killed, network timeout, rate limit hit, Docker pull failed. The CI system itself had a problem, not the code.

3. **Reproduce locally.** Before changing anything, try to reproduce the failure on the local machine with the same toolchain versions. Check `node --version`, `python --version`, lockfile hashes. If the failure only happens in CI, that is a clue (see step 4).

4. **Check environment differences.** Common CI-vs-local mismatches:
   - **OS:** Linux CI vs macOS local. Case-sensitive filesystem, different path separators, different line endings.
   - **Toolchain version:** CI uses Node 18, local uses Node 20. Check `.nvmrc`, `.tool-versions`, CI config.
   - **Environment variables:** CI has different `NODE_ENV`, missing secrets, different `TZ`.
   - **Case sensitivity:** `Import './Utils'` works on macOS, fails on Linux.
   - **Locale:** Sorting, date formatting, string comparison differ by locale.
   - **Parallelism:** Tests run in parallel in CI but serial locally. Race conditions surface.
   - **Timezone:** `TZ=UTC` in CI vs local timezone. Date-dependent tests break.

5. **Fix the root cause, not the symptom.** If a test fails because of a timezone, do not skip the test -- make it timezone-independent. If a build fails because of a missing dependency, add it to `package.json`, do not install it in a CI script. If a type error appears, fix the type, do not add `@ts-ignore`.

6. **Verify in a fresh CI run.** After making the fix, push and watch the CI run. Do not mark the issue as fixed until CI is green. If CI takes too long, at least verify locally with the same environment constraints.

7. **For flaky tests, leave breadcrumbs.** If the test is intermittently failing:
   - Add logging or debug output to capture the state when it fails
   - Check for shared mutable state between tests, missing cleanup in `afterEach`, test ordering dependencies
   - Check for time-dependent assertions (`Date.now()`, `setTimeout`, animation frames)
   - Check for port conflicts, file handle leaks, database state pollution
   - If the root cause is unclear, add a retry annotation with a TODO comment explaining the flakiness

8. **Edit the workflow in the same PR.** If the fix requires changes to `.github/workflows/`, `Jenkinsfile`, `.gitlab-ci.yml`, or similar, include those changes in the same PR as the code fix. Do not leave CI config changes for a separate PR unless they are purely cosmetic.

9. **Watch out for caches.** CI systems cache aggressively. Stale caches cause phantom failures:
   - npm/yarn/pnpm caches with stale lockfiles
   - Docker layer caches with outdated base images
   - Gradle/Maven caches with conflicting artifact versions
   - GitHub Actions caches that exceed size limits silently
   - If you suspect a cache issue, try busting the cache (change cache key) before other fixes.

10. **Distinguish new failures from pre-existing red main.** Before debugging, check if `main` branch CI is also red. If it is, the failure may predate the current PR. Use `git bisect` or check recent CI history to find when it broke. Do not waste time fixing issues in the PR that belong to `main`.

## Key Rules

- Always read the full error message, not just the first line. Stack traces, "caused by" chains, and context messages contain the root cause.
- Do not add `|| true`, `continue-on-error: true`, or `--no-verify` to make CI green. That hides problems.
- If the fix is "update the snapshot," verify the new snapshot is actually correct before committing.
- For permission errors in CI, check file permissions in git (`git ls-files -s`) and Docker user context.

## Output Format

Return a structured diagnosis with: failure classification, root cause analysis, fix applied, and verification status.
