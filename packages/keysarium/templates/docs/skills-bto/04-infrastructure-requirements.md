# Infrastructure Requirements — @dzhechkov/skills-bto

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


## Contents

1. [Overview](#1-overview)
2. [Hardware Requirements](#2-hardware-requirements)
3. [Software Dependencies](#3-software-dependencies)
4. [API Token Consumption](#4-api-token-consumption)
5. [Model Cost Breakdown](#5-model-cost-breakdown)
6. [Network Requirements](#6-network-requirements)
7. [Storage Requirements](#7-storage-requirements)
8. [Scaling Considerations](#8-scaling-considerations)
9. [Cost Optimization Strategies](#9-cost-optimization-strategies)
10. [Readiness Checklist](#10-readiness-checklist)

---

## 1. Overview

@dzhechkov/skills-bto is a lightweight Claude Code skill pack. It has no server component, no database, no persistent process, and no binary dependencies beyond Node.js and the Claude Code CLI. All computation is delegated to the Anthropic API via HTTPS.

### Architecture

```
┌──────────────────────────────────────────────────┐
│              Developer Machine                   │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Claude Code CLI                         │    │
│  │  ├── .claude/skills/bto/                 │    │
│  │  │   ├── SKILL.md                        │    │
│  │  │   ├── modules/                        │    │
│  │  │   └── references/                     │    │
│  │  └── .claude/commands/                   │    │
│  │      ├── bto.md                          │    │
│  │      ├── bto-build.md                    │    │
│  │      ├── bto-test.md                     │    │
│  │      └── bto-optimize.md                 │    │
│  └─────────────────┬────────────────────────┘    │
│                    │ HTTPS (port 443)             │
└────────────────────┼─────────────────────────────┘
                     │
             ┌───────▼────────┐
             │ Anthropic API  │
             │ claude-haiku   │
             │ claude-sonnet  │
             │ claude-opus    │
             └────────────────┘
```

There are no additional services to operate. No Redis, no queues, no vector databases. The only external dependency is the Anthropic API.

---

## 2. Hardware Requirements

BTO is a CLI-driven tool. It does not perform local computation beyond running Node.js and reading/writing markdown files. Hardware requirements are minimal.

### 2.1. Minimum requirements

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| CPU | 1 core | 2+ cores | BTO itself is not CPU-intensive; multi-core helps when running Claude Code alongside a browser and IDE |
| RAM | 2 GB | 4+ GB | Node.js + Claude Code process; parallel agent runs do not consume additional local RAM |
| Disk | 50 MB free | SSD, 200+ MB free | BTO skill files are tiny; evaluation reports are markdown |
| Terminal | 80 × 24 | 120+ columns | Wider terminals display evaluation tables without wrapping |

### 2.2. Why hardware barely matters

BTO's workload profile is:
- Read a handful of markdown files (< 200 KB total)
- Send HTTPS requests to the Anthropic API
- Write markdown evaluation reports (< 50 KB each)

The compute-intensive work — language model inference — runs entirely on Anthropic's infrastructure. Your machine is an orchestrator. A five-year-old laptop with 4 GB of RAM and a stable internet connection is sufficient for any BTO operation.

### 2.3. Local parallelism

When BTO runs the Layer 2 judge panel, it spawns three parallel agent calls using Claude Code's Agent tool. These three calls run concurrently as API requests — not as local processes. Your machine is waiting for three HTTP responses at the same time. The relevant resource is network bandwidth, not CPU or RAM.

The same applies to the five parallel mutation agents in OPTIMIZE Round 1. Five API calls in flight simultaneously. Local resource impact is negligible.

---

## 3. Software Dependencies

### 3.1. Required software

| Component | Version | Check | Purpose |
|-----------|---------|-------|---------|
| Node.js | 18+ (20+ recommended) | `node --version` | Claude Code runtime |
| npm | 9+ | `npm --version` | Package manager |
| Claude Code CLI | Latest | `claude --version` | Core execution environment |
| git | 2.20+ | `git --version` | Version control for artifacts |

### 3.2. Installing Node.js

```bash
# Via nvm (recommended — allows version switching)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node --version   # should print v20.x.x
```

```bash
# macOS via Homebrew
brew install node@20

# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3.3. Installing Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

### 3.4. Installing @dzhechkov/skills-bto

```bash
# In your project directory
npx dz-skills-bto init

# Verify installation
npx dz-skills-bto doctor
```

The `init` command installs the skill files into `.claude/skills/bto/` and the four command files into `.claude/commands/`. No global installation is required.

`doctor` runs a self-check that verifies:
- All skill files present and non-empty
- All command files present and reference correct skill paths
- Node.js and Claude Code versions are compatible
- Anthropic API key is configured (environment variable present — it does not test the key itself)

### 3.5. API key configuration

BTO does not manage API keys. Claude Code uses the key configured in the environment or Claude Code's credential store.

```bash
# Option 1: Environment variable (recommended for CI)
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: Claude Code credential store (recommended for interactive use)
claude auth login
```

### 3.6. No optional dependencies

BTO has no optional dependencies. There is no database integration, no telemetry, no webhook configuration. All state is in markdown files on disk.

---

## 4. API Token Consumption

This section provides token estimates for each BTO operation. Estimates assume a medium-complexity Claude Code artifact (skill, approximately 8 KB of content). Actual consumption scales with artifact size and content length.

### 4.1. /bto-test estimates

#### Layer 0 only

Layer 0 makes no API calls. Token cost: zero.

#### Layer 1 (haiku, 1 call)

| Component | Tokens (approx.) |
|-----------|-----------------|
| System prompt + rubric | 1,200 |
| Artifact content | 2,000 |
| Output (scores + improvements) | 600 |
| **Total per Layer 1 run** | **~3,800** |

#### Layer 2 (sonnet, 3 parallel calls)

| Component | Per judge | × 3 judges |
|-----------|----------:|----------:|
| System prompt (judge-specific) | 1,500 | 4,500 |
| Artifact content | 2,000 | 6,000 |
| Output (scores + justifications) | 1,500 | 4,500 |
| **Total Layer 2** | **5,000** | **~15,000** |

#### Meta-judge (opus, 1 call — triggered only on disagreement)

| Component | Tokens (approx.) |
|-----------|-----------------|
| Three judge evaluations (input) | 4,500 |
| System prompt | 800 |
| Reconciliation output | 600 |
| **Total meta-judge call** | **~5,900** |

#### /bto-test full run summary

| Level | API calls | Model(s) | Est. tokens | Triggered |
|-------|----------:|---------|------------:|---------|
| Layer 0 | 0 | — | 0 | Always |
| Layer 1 | 1 | haiku | ~3,800 | If L0 passes |
| Layer 2 | 3 | sonnet | ~15,000 | If L1 passes |
| Meta-judge | 0–1 | opus | ~5,900 | If disagreement >3 |
| **Full /bto-test** | **4–5** | mixed | **~18,800–24,700** | |

### 4.2. /bto-build estimates

#### QUICK mode

| Component | Model | Tokens (approx.) |
|-----------|-------|-----------------|
| Type detection + requirements parsing | default | 1,500 |
| Artifact generation (SKILL.md) | default | 8,000 |
| Module generation (per module) | default | 4,000 |
| Reference generation (per reference) | default | 2,500 |
| Example generation (per example) | default | 2,000 |
| Self-review (Layer 0 equivalent) | — | 0 |
| **Typical QUICK run (1 skill, 2 modules, 1 ref, 1 example)** | | **~22,000** |

#### DEEP mode (adds explore skill)

DEEP mode adds approximately 8,000 to 12,000 tokens for the requirements clarification dialogue before generation begins. Add this to the QUICK mode estimate.

| Component | Additional tokens |
|-----------|-----------------|
| Explore skill system prompt | 2,000 |
| Clarification dialogue (3-5 exchanges) | 6,000–10,000 |
| **Additional cost for DEEP mode** | **~8,000–12,000** |

### 4.3. /bto-optimize estimates

This is the most token-intensive operation in BTO.

#### Full 3-round optimization

| Operation | Count | Model | Tokens each | Total |
|-----------|------:|-------|------------:|------:|
| Baseline evaluation (Layer 2) | 1 | sonnet ×3 | 15,000 | 15,000 |
| Round 1 variant generation | 5 | opus | 5,000 | 25,000 |
| Round 1 evaluation (Layer 1) | 5 | haiku | 3,800 | 19,000 |
| Crossover generation (R1→R2) | 3 | opus | 5,000 | 15,000 |
| Round 2 evaluation (Layer 1) | 3 | haiku | 3,800 | 11,400 |
| Crossover generation (R2→R3) | 3 | opus | 5,000 | 15,000 |
| Round 3 evaluation (Layer 2) | 3 | sonnet ×3 | 15,000 | 45,000 |
| **Total (3 rounds, 15 evaluations)** | | | | **~131,000** |

Note: if convergence is detected after Round 2, Round 3 evaluation is skipped. The minimum cost scenario (convergence after Round 1) uses approximately 74,000 tokens.

### 4.4. /bto full pipeline estimates

| Stage | Est. tokens |
|-------|------------:|
| BUILD (QUICK mode, typical skill) | ~22,000 |
| BENCHMARK (B0-B3, incl. 3× haiku consistency probe) | ~3,500 |
| TEST (full, no meta-judge) | ~18,800 |
| OPTIMIZE (3 rounds) | ~131,000 |
| **Full /bto pipeline** | **~175,500** |

For a description-triggered build where DEEP mode is invoked: add approximately 10,000 tokens to the BUILD phase.

---

## 5. Model Cost Breakdown

BTO uses three models with deliberate cost tiering. The model selection is not a preference — it is a quality gate architecture.

### 5.1. Model selection rationale

| Layer / Task | Model | Why this model |
|-------------|-------|---------------|
| Layer 0 | None | Deterministic checks need no LLM |
| Layer 1 evaluation | haiku | Fast coherence scan; no deep reasoning needed |
| Layer 2 Judge 1 (Expert) | sonnet | Domain knowledge + nuanced scoring |
| Layer 2 Judge 2 (Critic) | sonnet | Adversarial analysis requires reasoning |
| Layer 2 Judge 3 (Auditor) | sonnet | Structured coverage check |
| Meta-judge | opus | Disagreement resolution requires synthesis across three evaluations |
| Variant generation | opus | Creative mutation requires understanding quality dimensions |
| Crossover generation | opus | Novel synthesis of best candidates |
| Fast-eval in optimization | haiku | Volume scoring before full panel |

The key constraint: **the generator and the judges must use different models.** BTO enforces this as a hard rule. If the same model generates and evaluates the artifact, the evaluation becomes circular — the model knows its own output patterns and cannot assess them objectively.

### 5.2. Approximate cost per operation (March 2026 pricing)

Prices are estimates. Check Anthropic's pricing page for current rates. Token counts are based on medium-complexity artifacts (~8 KB skill).

| Operation | Primary model | Est. tokens | Approx. cost |
|-----------|-------------|------------:|-------------:|
| /bto-test Layer 1 only | haiku | ~3,800 | < $0.01 |
| /bto-test full (no meta-judge) | sonnet + haiku | ~18,800 | ~$0.05 |
| /bto-test full (with meta-judge) | sonnet + haiku + opus | ~24,700 | ~$0.10 |
| /bto-build QUICK | opus | ~22,000 | ~$0.25 |
| /bto-build DEEP | opus | ~32,000 | ~$0.35 |
| /bto-optimize (3 rounds) | opus + sonnet + haiku | ~131,000 | ~$1.50 |
| /bto full pipeline | opus + sonnet + haiku | ~172,000 | ~$2.00 |

These are estimates for a single medium-complexity artifact. A simple command (under 3 KB) will cost significantly less. A large multi-module skill (over 20 KB) will cost more.

### 5.3. Layer 0 as a cost gate

Layer 0 is the most important cost optimization built into BTO. By running deterministic checks before any LLM call, BTO filters out structurally broken artifacts before spending API budget on them.

In practice, Layer 0 catches approximately 60% of quality issues without any token spend. Only artifacts that pass Layer 0 proceed to Layer 1, and only those that pass Layer 1 proceed to the full Layer 2 panel.

The total cost of running Layer 0 on any artifact, any number of times: zero.

---

## 6. Network Requirements

BTO communicates only with the Anthropic API. All communication is HTTPS over port 443.

### 6.1. Bandwidth

BTO payloads are small. Requests contain the system prompt, artifact content, and evaluation instructions. Responses contain scores and text. Total payload per API call is typically 10 KB to 50 KB.

| Operation type | Approx. payload per call | Calls | Total transfer |
|---------------|------------------------:|------:|---------------:|
| Layer 1 evaluation | ~20 KB | 1 | ~20 KB |
| Layer 2 judge | ~30 KB | 3 | ~90 KB |
| Variant generation | ~40 KB | 5 | ~200 KB |
| Full /bto pipeline | — | ~20 | ~500 KB |

A full BTO pipeline transfers under 1 MB. Bandwidth is not a limiting factor on any connection above 1 Mbps.

### 6.2. Latency sensitivity

BTO is not real-time or interactive during agent execution. Each API call may take 5 to 30 seconds depending on model, payload size, and Anthropic API load. The operations that benefit most from low latency are:

- Layer 2 judge panel: 3 parallel calls, each ~10-20 seconds → wall time ~20 seconds on low latency, ~45 seconds on high latency
- Optimization Round 1: 5 parallel calls, each ~10 seconds → wall time ~15-25 seconds

A stable broadband connection (20 Mbps+, < 100ms RTT to api.anthropic.com) is sufficient. Wi-Fi is fine. Mobile hotspot is usable but may introduce variability in parallel call timings.

### 6.3. Offline capability

BTO cannot operate offline. Every Layer 1, Layer 2, BUILD, and OPTIMIZE operation requires API access. Layer 0 runs entirely locally and works offline.

If you anticipate working without internet access, run Layer 0 on all artifacts before going offline to identify structural issues you can fix locally.

### 6.4. Proxy and firewall requirements

If your network routes traffic through a proxy or firewall, ensure outbound HTTPS connections to `api.anthropic.com` (port 443) are permitted. No other domain or port is required.

```
Required: api.anthropic.com:443 (HTTPS/TLS)
Optional: none
```

---

## 7. Storage Requirements

BTO artifacts are markdown files. Storage requirements are minimal.

### 7.1. BTO skill files

The installed BTO skill occupies:

| Directory | Size (approx.) |
|-----------|---------------:|
| `.claude/skills/bto/SKILL.md` | ~8 KB |
| `.claude/skills/bto/modules/` (3 files) | ~25 KB |
| `.claude/skills/bto/references/` (4 files) | ~30 KB |
| `.claude/skills/bto/examples/` (1 file) | ~5 KB |
| `.claude/commands/bto*.md` (4 files) | ~15 KB |
| **Total installation footprint** | **~83 KB** |

### 7.2. Evaluation reports

Each BTO test run generates an evaluation report. Reports are written as markdown files in the same directory as the evaluated artifact.

| Report type | Typical size |
|-------------|-------------:|
| Layer 0 report | ~1 KB |
| Layer 1 report | ~2 KB |
| Layer 2 report (3 judges) | ~8 KB |
| Meta-judge addendum | ~2 KB |
| Optimization report | ~5 KB |
| **Full /bto run report** | **~18 KB** |

### 7.3. Storage for optimization variants

During optimization, BTO generates intermediate variant files. These are written to a temporary directory and deleted after the optimization completes (or you decline to apply the result).

Temporary storage during a 3-round optimization:
- 5 Round 1 variants × artifact size
- 3 Round 2 variants × artifact size
- 3 Round 3 variants × artifact size
- Total: ~11 × artifact size

For a typical 8 KB skill: approximately 88 KB of temporary storage. For a 30 KB skill: approximately 330 KB. These files are removed after the checkpoint confirmation.

### 7.4. Long-term storage growth

If you evaluate artifacts regularly, the evaluation reports accumulate over time. A team running daily evaluations over a year generates roughly:

```
20 evaluations/week × 18 KB/evaluation × 52 weeks = ~19 MB/year
```

This is not a meaningful storage concern. Reports can be committed to git alongside the artifacts they evaluate, providing a historical quality audit trail.

### 7.5. Recommendation for report storage

Commit evaluation reports to git alongside your artifacts. The naming convention is:

```
<artifact-name>.eval-layer0.md
<artifact-name>.eval-layer1.md
<artifact-name>.eval-layer2.md
<artifact-name>.opt-report.md
```

Reports should live in the same directory as the artifact they describe.

---

## 8. Scaling Considerations

BTO is designed for individual or small-team use. It can be adapted for larger-scale batch evaluation with some considerations.

### 8.1. Single-user usage

One developer running BTO interactively. No special configuration needed. API rate limits for Anthropic's standard tier are sufficient for all BTO operations without throttling.

Typical daily usage: 2 to 5 full BTO pipeline runs = approximately 500K to 1M tokens.

### 8.2. Team usage (2-10 developers)

Multiple developers on the same Anthropic account or workspace. No conflicts with BTO itself — each run is independent. The only consideration is shared API rate limits.

If your team is hitting rate limits:
1. Stagger optimization runs (they consume the most tokens)
2. Use `--level layer1` for rapid iteration; run full evaluations less frequently
3. Consider separate API keys per developer for rate limit isolation

### 8.3. Batch evaluation

You may want to run BTO evaluation across all skills in a project as part of a quality gate. There is no native batch mode, but you can script sequential runs:

```bash
for skill_dir in .claude/skills/*/; do
  claude /bto-test "$skill_dir" --level layer2
done
```

For parallel batch runs, be aware that running 5+ Layer 2 evaluations simultaneously means 15+ concurrent sonnet calls. Check your account's concurrent request limits.

Recommended batch approach:
1. Run Layer 0 on all artifacts simultaneously (no API calls)
2. Run Layer 1 on all passing artifacts sequentially (cheap, fast)
3. Run Layer 2 only on artifacts that score below 7.5 on Layer 1 (cost control)

### 8.4. CI/CD integration

BTO can be integrated into CI/CD pipelines to enforce quality gates on skill and command changes. The practical integration point is Layer 0, which runs for free and catches the most common issues.

Example GitHub Actions step:

```yaml
- name: BTO Layer 0 quality check
  run: |
    npx dz-skills-bto doctor
    claude /bto-test .claude/skills/ --level layer0
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Layer 1 in CI is viable (cheap, fast) but adds API dependency. Layer 2 in CI is expensive and should be reserved for pre-release gates, not every commit.

Recommended CI quality gate strategy:

| Gate | Layer | Trigger | Cost |
|------|-------|---------|------|
| Pre-commit | Layer 0 | Every commit | Free |
| Pull request | Layer 1 | Every PR | ~$0.01 per artifact |
| Pre-release | Layer 2 | Release branch merge | ~$0.05 per artifact |

### 8.5. Anthropic API rate limits

At time of writing (March 2026), Anthropic's standard API tier provides:

- Input tokens per minute: varies by tier and model
- Concurrent requests: varies by tier

BTO's parallel operations (3 judges in Layer 2, 5 mutation agents in Round 1) may approach or exceed rate limits on entry-level API tiers when run repeatedly in quick succession. If you see rate limit errors:

1. The failing command will surface the HTTP 429 error
2. Wait 60 seconds and retry
3. For sustained high volume, contact Anthropic about increased rate limits or an enterprise tier

---

## 9. Cost Optimization Strategies

### 9.1. Use the right layer for the task

The biggest cost optimization is choosing the evaluation depth that matches your need.

| Scenario | Recommended level | Why |
|----------|------------------|-----|
| Checking if a just-written artifact compiles structurally | Layer 0 | Free |
| Rapid iteration during active development | Layer 1 | $0.01; results in 10 seconds |
| Final quality check before committing | Layer 2 | $0.05; comprehensive |
| Before releasing a skill publicly | Full pipeline | Worth the cost |
| CI check on every commit | Layer 0 only | Free; catches regressions |

### 9.2. Do not optimize artifacts that do not need it

The threshold is clear: if Layer 2 score >= 8.0, skip optimization. The BUILD module produces artifacts that typically score 7.0 to 7.5 on first evaluation. Optimization is designed to close the gap from 7.x to 8+. Running optimization on an 8.5-scoring artifact wastes approximately 131K tokens for negligible gain.

### 9.3. Use convergence as a budget signal

If the optimizer converges after Round 1 (delta < 0.5), Round 2 and Round 3 are skipped automatically. This can reduce the full optimization cost from ~131K tokens to ~74K tokens. It also signals that the artifact is already near its improvement ceiling given the current mutation strategies.

### 9.4. Batch Layer 1 before Layer 2

When evaluating multiple artifacts, run all of them through Layer 1 first. Only promote the ones scoring below 7.5 to Layer 2. This is the hierarchical evaluation pattern built into BTO's architecture.

Example for a project with 10 skills to evaluate:
- Layer 1 on all 10: 10 haiku calls = ~38,000 tokens ≈ $0.10
- Suppose 4 score below 7.5 → Layer 2 on 4: 12 sonnet calls = ~60,000 tokens ≈ $0.30
- Total: ~$0.40 instead of $0.50 for all-Layer-2

The savings are modest at small scale but matter when evaluating 50+ artifacts.

### 9.5. Scope optimization correctly

The optimization token cost scales with artifact size because each variant generation and evaluation includes the full artifact content. Keep artifacts within their intended size bounds:

| Artifact type | Target size | Cost impact of 2× oversize |
|--------------|-------------|---------------------------|
| SKILL.md | 5–15 KB | ~$1 additional per full optimize |
| Command | 2–8 KB | ~$0.30 additional |
| Rule | 1–5 KB | ~$0.10 additional |

If SKILL.md is approaching 30 KB, split it into modules before running optimization. The individual modules will optimize faster and cheaper than the monolith.

### 9.6. Layer 0 is always free — use it liberally

Run Layer 0 checks as often as you want. After any edit to an artifact, before committing, after a rename, after reorganizing directories — Layer 0 costs nothing and catches structural regressions immediately. There is no reason to ever skip Layer 0.

### 9.7. Monitor costs with git commit boundaries

Commit your artifacts to git before running optimization. The git diff gives you a free before/after comparison, and if the optimization result is disappointing, you can restore with `git checkout`. This avoids re-running BUILD (another ~22K tokens) if you need to revert.

---

## 10. Readiness Checklist

Use this checklist before your first BTO run to confirm the environment is properly configured.

### Software

- [ ] Node.js 18+ installed (`node --version` returns v18.x.x or higher)
- [ ] npm 9+ installed (`npm --version` returns 9.x.x or higher)
- [ ] Claude Code CLI installed (`claude --version` succeeds)
- [ ] git installed (`git --version` succeeds)
- [ ] @dzhechkov/skills-bto initialized (`npx dz-skills-bto init` completed)

### Files

- [ ] `.claude/skills/bto/SKILL.md` exists and is non-empty
- [ ] `.claude/skills/bto/modules/` contains build.md, test.md, optimize.md
- [ ] `.claude/skills/bto/references/` contains the four reference files
- [ ] `.claude/commands/bto.md` exists
- [ ] `.claude/commands/bto-build.md` exists
- [ ] `.claude/commands/bto-test.md` exists
- [ ] `.claude/commands/bto-optimize.md` exists

### API access

- [ ] `ANTHROPIC_API_KEY` environment variable set, or `claude auth login` completed
- [ ] Outbound HTTPS to `api.anthropic.com:443` is permitted by firewall/proxy
- [ ] API key has access to claude-haiku, claude-sonnet, and claude-opus

### Verification

Run the doctor command to confirm everything:

```bash
npx dz-skills-bto doctor
```

Expected output when everything is in order:

```
BTO Doctor — Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Node.js:        v20.11.0  OK
npm:            10.2.4    OK
Claude Code:    1.x.x     OK
SKILL.md:       8.2 KB    OK
modules/:       3 files   OK
references/:    4 files   OK
commands/:      4 files   OK
API key:        present   OK (not validated)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: READY
Run /bto-test .claude/skills/bto/ to verify end-to-end.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

To do a live end-to-end verification (makes real API calls):

```
/bto-test .claude/skills/bto/
```

This runs the BTO evaluation system on itself — using BTO to evaluate the BTO skill. If the evaluation completes with a Layer 2 score >= 7.0, your installation is working correctly.
