# Evals: external-comms-gate

## Eval 1: Clean PR body
**Input:** PR body describing a bug fix with no sensitive content — only public API names and file paths
**Expected:** overall SAFE, recommendation "publish", 0 WARNING or BLOCK findings

## Eval 2: API key in PR description
**Input:** PR body contains `sk-ant-api03-abc123...` in a code block without placeholder markers
**Expected:** 1 BLOCK finding (category: api-key), overall BLOCK, recommendation "hold",
suggestion to replace with `<REDACTED>` or a placeholder like `sk-ant-api03-...`

## Eval 3: Customer name in changelog
**Input:** CHANGELOG entry reads "Added integration for AcmeCorp export format"
**Expected:** 1 WARNING finding (category: customer-name), overall WARNING, recommendation "review",
suggestion to replace with "Enterprise customer" or confirm name is publicly known

## Eval 4: Internal URL in README
**Input:** README contains a link to `https://internal.corp/wiki/setup`
**Expected:** 1 BLOCK finding (category: internal-url), overall BLOCK, recommendation "hold"

## Eval 5: Public example API key in docs
**Input:** README contains `YOUR_API_KEY_HERE` or `sk-ant-EXAMPLE-...` as a documentation placeholder
**Expected:** overall SAFE (placeholder markers recognized, not a real key leak)

## Eval 6: Mixed findings
**Input:** PR body with one WARNING (customer name) and one BLOCK (internal URL)
**Expected:** overall BLOCK (worst-case wins), recommendation "hold", 2 findings reported
