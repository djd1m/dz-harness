---
name: "github-actions"
description: "Designs and reviews GitHub Actions workflows — CI/CD pipelines, matrix builds, caching, secrets, reusable workflows, and security hardening."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# github-actions

Design, review, and harden GitHub Actions workflows for any project. Covers the full spectrum from simple CI checks through complex multi-environment deployments with matrix builds, caching strategies, reusable workflows, OIDC cloud authentication, and security hardening. Produces production-grade workflows that follow GitHub's official best practices and community standards.

## When to use

- User wants to create a new CI/CD pipeline with GitHub Actions
- User asks to review an existing workflow for performance, security, or correctness
- User needs matrix builds for cross-platform or multi-version testing
- User wants to set up caching for faster builds (npm, pnpm, pip, Gradle, etc.)
- User needs to configure secrets, environments, or OIDC-based cloud authentication
- User wants to share logic between workflows using reusable workflows or composite actions
- User asks about security hardening (pinning actions, least-privilege permissions, supply chain)
- User needs a release workflow (tag, build, publish to npm/PyPI/Docker Hub/GitHub Releases)
- User wants scheduled maintenance jobs (stale issues, dependency updates, health checks)
- User asks about optimizing workflow run time or reducing GitHub Actions costs

## When NOT to use

- User wants to set up Jenkins, CircleCI, GitLab CI, or another CI platform (not GitHub Actions)
- User wants to write the application code itself (that is general development)
- User wants to debug Terraform configuration (use `terraform`)
- User wants to review Docker Compose setups unrelated to CI (use `docker-compose`)
- User wants a security audit of application code (use `security-audit`)
- User wants to fix a CI failure caused by test logic, not workflow config (use `ci-fix`)

## Procedure

### Step 1. Workflow structure

Determine the workflow triggers, job layout, and runner selection.

**Triggers** -- choose the narrowest trigger that covers the use case:

```yaml
on:
  push:
    branches: [main]
    paths-ignore: ["docs/**", "*.md"]
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
  schedule:
    - cron: "0 6 * * 1"          # every Monday 06:00 UTC
  workflow_dispatch:
    inputs:
      environment:
        description: "Deploy target"
        required: true
        type: choice
        options: [dev, staging, prod]
```

**Runner selection:**

| Workload | Runner | Why |
|----------|--------|-----|
| Lint, unit tests, small builds | `ubuntu-latest` | Fast startup, free tier |
| macOS/iOS builds | `macos-latest` | Required for Xcode toolchain |
| Windows-specific tests | `windows-latest` | Required for .NET Framework, MSVC |
| Large builds, Docker-in-Docker | `ubuntu-latest-4-core` (larger runner) | More CPU/RAM, faster |
| Security-sensitive or custom tooling | Self-hosted | Full control, persistent caches |

**Job and step basics:**

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
```

Always set `timeout-minutes` on jobs to prevent runaway builds. Default is 360 minutes (6 hours) which is almost never appropriate.

### Step 2. Job dependencies

Use `needs` to express dependencies between jobs. Pass data between jobs via outputs.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    outputs:
      coverage: ${{ steps.cov.outputs.percentage }}
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: npm ci
      - run: npm test -- --coverage
      - id: cov
        run: echo "percentage=$(jq '.total.lines.pct' coverage/coverage-summary.json)" >> "$GITHUB_OUTPUT"

  deploy:
    needs: [lint, test]
    if: github.ref == 'refs/heads/main' && needs.test.outputs.coverage >= 80
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying with ${{ needs.test.outputs.coverage }}% coverage"
```

**Concurrency groups** prevent duplicate runs:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Place at the workflow level for PR workflows (cancel superseded runs). Place at the job level for deploy jobs where you want queuing instead of cancellation:

```yaml
jobs:
  deploy:
    concurrency:
      group: deploy-${{ github.event.inputs.environment }}
      cancel-in-progress: false   # queue, do not cancel
```

### Step 3. Matrix builds

Use `strategy.matrix` for testing across multiple versions, platforms, or configurations.

```yaml
jobs:
  test:
    strategy:
      fail-fast: false
      max-parallel: 4
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
        exclude:
          - os: macos-latest
            node: 18
        include:
          - os: ubuntu-latest
            node: 22
            coverage: true
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test
      - if: matrix.coverage
        run: npm test -- --coverage
```

**Guidelines:**
- Set `fail-fast: false` when you want results from all combinations (most CI scenarios).
- Set `fail-fast: true` (default) for expensive matrices where one failure means all would fail.
- Use `max-parallel` to limit concurrent jobs and stay within runner limits.
- `exclude` removes specific combinations. `include` adds extra entries or adds properties to existing combos.

### Step 4. Caching

Caching dramatically reduces build times. Use `actions/cache` or built-in caching in setup actions.

**Node.js (pnpm) -- setup-node built-in cache:**

```yaml
- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
  with:
    node-version: 22
    cache: pnpm
- run: pnpm install --frozen-lockfile
```

**Node.js (npm) -- setup-node built-in cache:**

```yaml
- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
  with:
    node-version: 22
    cache: npm
- run: npm ci
```

**Python (pip) -- manual cache:**

```yaml
- uses: actions/cache@5a3ec84eff668545956fd18022155c47e93e2684 # v4.2.3
  with:
    path: ~/.cache/pip
    key: pip-${{ runner.os }}-${{ hashFiles('**/requirements*.txt') }}
    restore-keys: |
      pip-${{ runner.os }}-
- run: pip install -r requirements.txt
```

**Docker layer caching:**

```yaml
- uses: docker/build-push-action@263435318d21b8e681c14492fe198d362a7d2c83 # v6.18.0
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Cache key strategy:**
- Primary key should include the lockfile hash: `${{ runner.os }}-node-${{ hashFiles('**/pnpm-lock.yaml') }}`
- `restore-keys` provide fallback to partial matches (stale but faster than cold start)
- Cache size limit is 10 GB per repository. Eviction is LRU.

### Step 5. Secrets and variables

**Repository and environment secrets:**

```yaml
steps:
  - run: npm publish
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Environment-scoped secrets with required reviewers:**

```yaml
jobs:
  deploy:
    environment:
      name: production
      url: https://myapp.example.com
    steps:
      - run: ./deploy.sh
        env:
          AWS_ACCOUNT_ID: ${{ vars.AWS_ACCOUNT_ID }}     # variable (not secret)
          DATABASE_URL: ${{ secrets.DATABASE_URL }}        # secret
```

**OIDC for cloud authentication (no long-lived credentials):**

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@ececac1a45f3b08a01d2dd070d28d111c5fe6722 # v4.1.0
    with:
      role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy
      aws-region: us-east-1
  - run: aws s3 sync ./dist s3://my-bucket
```

OIDC eliminates the need to store AWS access keys as secrets. Configure trust in the IAM role to allow the specific repository and branch.

**Rules:**
- Never echo or log secrets. GitHub redacts known secrets, but derived values are not protected.
- Use environment protection rules for production deployments (required reviewers, wait timers).
- Prefer OIDC over static credentials for AWS, GCP, and Azure.
- Use `vars` context for non-sensitive configuration (region, account ID, feature flags).

### Step 6. Artifacts

Share files between jobs or preserve build outputs for inspection.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: dist
          path: dist/
          retention-days: 7

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: dist
          path: dist/
      - run: ./deploy.sh dist/
```

**Guidelines:**
- Set `retention-days` explicitly. Default is 90 days, which wastes storage.
- Artifact names must be unique within a workflow run. Use matrix values for matrix builds: `name: dist-${{ matrix.os }}`.
- Use `if-no-files-found: error` to fail early when expected artifacts are missing.
- For large artifacts (>500 MB), consider uploading to S3/GCS instead.

### Step 7. Reusable workflows

Factor shared logic into reusable workflows (called with `workflow_call`) or composite actions.

**Reusable workflow (`.github/workflows/ci-shared.yml`):**

```yaml
name: Shared CI
on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: number
        default: 22
    secrets:
      NPM_TOKEN:
        required: false
    outputs:
      coverage:
        description: "Test coverage percentage"
        value: ${{ jobs.test.outputs.coverage }}

jobs:
  test:
    runs-on: ubuntu-latest
    outputs:
      coverage: ${{ steps.cov.outputs.pct }}
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
      - run: npm test -- --coverage
      - id: cov
        run: echo "pct=$(jq '.total.lines.pct' coverage/coverage-summary.json)" >> "$GITHUB_OUTPUT"
```

**Caller workflow:**

```yaml
jobs:
  ci:
    uses: ./.github/workflows/ci-shared.yml
    with:
      node-version: 22
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Composite action (`.github/actions/setup-project/action.yml`):**

```yaml
name: "Setup Project"
description: "Checkout, setup Node, install dependencies"
inputs:
  node-version:
    required: false
    default: "22"
runs:
  using: composite
  steps:
    - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
    - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
      with:
        node-version: ${{ inputs.node-version }}
        cache: npm
    - run: npm ci
      shell: bash
```

**When to use which:**

| Feature | Reusable workflow | Composite action |
|---------|-------------------|------------------|
| Contains jobs | Yes | No (steps only) |
| Can use secrets | Yes (declared in `secrets:`) | No (pass via inputs) |
| Runner selection | Each job picks its own | Inherits from caller |
| Nesting depth | Up to 4 levels | Unlimited |
| Best for | Full CI/CD pipelines | Shared step sequences |

### Step 8. Security hardening

**Pin actions to full commit SHA:**

```yaml
# BAD - mutable tag
- uses: actions/checkout@v4

# GOOD - immutable SHA
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

The comment after the SHA records the version for human readability. Use Dependabot or Renovate to keep SHAs current.

**Least-privilege permissions:**

```yaml
permissions:
  contents: read       # checkout
  pull-requests: write # comment on PR
  # everything else is implicitly 'none'
```

Always declare `permissions` at the workflow level. Only add specific permissions that are actually needed. Never use `permissions: write-all`.

**GITHUB_TOKEN scope:**

The default `GITHUB_TOKEN` is scoped to the current repository. For cross-repo operations, use a GitHub App installation token or a fine-grained PAT stored as a secret.

**Dependabot for actions:**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions:
        patterns: ["*"]
```

**Additional hardening:**
- Add a `CODEOWNERS` entry for `.github/workflows/` to require review of workflow changes.
- Use `environment` protection rules for deployments to production.
- Never use `pull_request_target` with `actions/checkout` of the PR head (code injection risk).
- Avoid `${{ github.event.pull_request.title }}` in `run:` blocks (shell injection). Use environment variables instead.
- Enable branch protection rules requiring CI to pass before merge.

### Step 9. Common patterns

**Pattern A -- Build + Test + Deploy (main branch):**

```yaml
name: CI/CD
on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: dist
          path: dist/
          retention-days: 3

  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test

  deploy:
    needs: [build, test]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: production
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: dist
          path: dist/
      - uses: aws-actions/configure-aws-credentials@ececac1a45f3b08a01d2dd070d28d111c5fe6722 # v4.1.0
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
      - run: aws s3 sync dist/ s3://${{ vars.S3_BUCKET }} --delete
```

**Pattern B -- PR checks (lint + test + preview):**

```yaml
name: PR Checks
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: coverage-report
          path: coverage/
          retention-days: 5

  typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
```

**Pattern C -- Release (tag, build, publish):**

```yaml
name: Release
on:
  push:
    tags: ["v*"]

permissions:
  contents: write
  packages: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 22
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - uses: softprops/action-gh-release@da05d552573ad5aba039eaac05058a918a7bf631 # v2.2.2
        with:
          generate_release_notes: true
          files: dist/**
```

**Pattern D -- Scheduled maintenance:**

```yaml
name: Weekly Maintenance
on:
  schedule:
    - cron: "0 9 * * 1"   # Monday 09:00 UTC
  workflow_dispatch: {}

permissions:
  contents: read
  issues: write

jobs:
  stale-issues:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/stale@5bef64f19d7facfb25b37b414482c7164d639639 # v9.1.0
        with:
          stale-issue-message: "This issue has been inactive for 60 days and will be closed in 7 days unless there is new activity."
          days-before-stale: 60
          days-before-close: 7
          stale-issue-label: stale

  dependency-review:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: npm audit --audit-level=high
```

### Step 10. Performance optimization

**Path filters** -- skip workflows when only docs change:

```yaml
on:
  push:
    paths-ignore:
      - "docs/**"
      - "*.md"
      - ".github/ISSUE_TEMPLATE/**"
      - "LICENSE"
```

**Conditional steps** -- skip expensive steps when not needed:

```yaml
- name: Build Docker image
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: docker build -t myapp .
```

**Parallel jobs** -- split tests across jobs:

```yaml
jobs:
  test-unit:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: npm ci
      - run: npm run test:unit

  test-integration:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: npm ci
      - run: npm run test:integration

  test-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

**Self-hosted runners** for persistent caches and custom hardware:

```yaml
runs-on: [self-hosted, linux, x64, gpu]
```

Self-hosted runners keep their filesystem between runs. Dependencies, Docker layers, and build caches persist without explicit cache actions. Trade-off: you must maintain the runner, patch the OS, and handle security isolation.

**Larger runners** (GitHub-hosted):

```yaml
runs-on: ubuntu-latest-4-core    # 4 CPU, 16 GB RAM
runs-on: ubuntu-latest-8-core    # 8 CPU, 32 GB RAM
runs-on: ubuntu-latest-16-core   # 16 CPU, 64 GB RAM
```

Use when build time justifies the cost. Larger runners are billed at higher per-minute rates.

## Anti-patterns

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| `uses: actions/checkout@v4` | Mutable tag can be hijacked via force-push | Pin to full SHA: `@11bd71901bbe5b1630ceea73d27597364c9af683` |
| `uses: some-action@latest` | `latest` is not even a valid ref for most actions; breaks reproducibility | Pin to SHA or at minimum a version tag |
| `permissions: write-all` | Grants every permission to GITHUB_TOKEN | Declare only needed permissions explicitly |
| No `concurrency` on PR workflows | Multiple pushes to same PR create duplicate runs wasting minutes | Add `concurrency` with `cancel-in-progress: true` |
| `echo "${{ secrets.TOKEN }}"` in `run:` | Secrets can leak to logs if redaction fails | Pass via `env:` block, never interpolate in shell |
| `${{ github.event.pull_request.title }}` in `run:` | Shell injection via crafted PR title | Assign to env var first: `env: TITLE: ${{ ... }}`, then use `$TITLE` |
| Redundant `actions/checkout` in every job | Wastes time when job does not need source code (e.g., deploy from artifact) | Only checkout when the job reads the repo |
| No `timeout-minutes` on jobs | Stuck jobs run for 6 hours consuming all runner capacity | Always set a reasonable timeout |
| Caching without lockfile hash | Cache key never changes, stale dependencies persist | Include `hashFiles('**/lockfile')` in cache key |
| `pull_request_target` + checkout PR head | Allows untrusted code to run with write permissions | Use `pull_request` trigger or isolate untrusted code |
| No `fail-fast: false` on diagnostic matrices | First failure cancels all other jobs, hiding additional failures | Set `fail-fast: false` for CI matrices |
| Hardcoded runner labels | Breaks when GitHub renames runners (e.g., `ubuntu-20.04` EOL) | Use `-latest` suffixes or document version requirements |

## Self-check

Before delivering a workflow, verify all 12 items:

1. Every action is pinned to a full 40-character commit SHA with a version comment
2. `permissions` block is present at the workflow level with least-privilege scopes
3. `timeout-minutes` is set on every job
4. `concurrency` group is defined for PR-triggered workflows
5. Secrets are passed via `env:` blocks, never interpolated in `run:` commands
6. Cache keys include `hashFiles()` of the relevant lockfile
7. Artifacts have explicit `retention-days`
8. Matrix builds use `fail-fast: false` unless there is a documented reason not to
9. No use of `pull_request_target` with checkout of PR head
10. OIDC is used for cloud authentication instead of static access keys when possible
11. `.github/dependabot.yml` includes `github-actions` ecosystem
12. Branch or environment protection rules are recommended for production deployments
