---
name: "trails"
description: "Cross-chain swap, bridge, and DeFi orchestration via Sequence — yield vaults, token prices, earn pools."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Trails — Cross-Chain Swap, Bridge & DeFi Orchestration

Trails is the Sequence cross-chain intent engine. It orchestrates swaps, bridges, yield vaults, token prices, and earn pools through a unified intent lifecycle. Agents submit intents which are resolved, committed, executed, and tracked through to receipt.

## When to Use

- **Cross-chain swaps and bridges** — reach for Trails when an operation needs to move value *between* chains (or swap within one) as a single resolved intent, rather than hand-building per-chain transactions.
- **DeFi yield discovery and deposits** — use it to list/query earn pools and yield vaults (APY, TVL, strategy) and to deposit into them through the same `QuoteIntent → ... → WaitIntentReceipt` flow.
- **When you want intent-level execution, not raw RPC** — Trails resolves a route, returns transactions to sign, and tracks them to a receipt; pick it over a plain JSON-RPC node skill when you need the full commit/execute/receipt lifecycle.
- **When submission goes through Bankr** — choose Trails specifically when you have a `BANKR_API_KEY` and want Bankr to handle nonce, gas, and MEV protection on submission; the two are designed to be used together.
- **Not for** simple on-chain reads, contract calls, or wallet/account management — use a dedicated RPC or wallet skill for those; Trails is for swap/bridge/DeFi *intents* and their discovery data (prices, pools, vaults).

---

## Configuration

### API Base URL

```
https://api.sequence.build/rpc/API/trails
```

### Authentication

All requests require the `Authorization` header:

```
Authorization: Bearer <BANKR_API_KEY>
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TRAILS_API` | Trails API base URL (default: `https://api.sequence.build/rpc/API/trails`) |
| `BANKR_API_KEY` | Authentication token for Trails and Bankr services |

---

## Intent Lifecycle

The Trails intent system follows a strict lifecycle. Each step must complete before the next begins.

```
QuoteIntent → CommitIntent → Submit via Bankr → ExecuteIntent → WaitIntentReceipt
```

### Step 1: QuoteIntent

Request a quote for the desired operation (swap, bridge, yield deposit, etc.):

```bash
POST /rpc/API/trails/QuoteIntent
{
  "intent": {
    "type": "swap",
    "fromChain": "base",
    "toChain": "base",
    "fromToken": "0x...",
    "toToken": "0x...",
    "amount": "1000000",
    "slippageBps": 50
  }
}
```

The response contains a `quoteId`, estimated output amount, route details, and an expiration timestamp. Quotes are valid for 30 seconds.

### Step 2: CommitIntent

Lock in the quoted route:

```bash
POST /rpc/API/trails/CommitIntent
{
  "quoteId": "quote_abc123",
  "walletAddress": "0x..."
}
```

Returns a `commitId` and the transaction(s) to sign. The commit is valid for 60 seconds.

### Step 3: Submit via Bankr

Submit the signed transaction through the Bankr CLI or API:

```bash
bankr agent submit --commit-id commit_abc123 --signed-tx 0x...
```

Or via the Bankr REST API:

```bash
POST /api/v1/agent/submit
{
  "commitId": "commit_abc123",
  "signedTransaction": "0x..."
}
```

### Step 4: ExecuteIntent

Trigger intent execution after submission:

```bash
POST /rpc/API/trails/ExecuteIntent
{
  "commitId": "commit_abc123"
}
```

Returns an `intentId` for tracking.

### Step 5: WaitIntentReceipt

Poll or wait for the intent to complete:

```bash
POST /rpc/API/trails/WaitIntentReceipt
{
  "intentId": "intent_xyz789",
  "timeoutMs": 120000
}
```

Returns the final receipt with transaction hashes, actual output amounts, and status.

---

## API Methods

### Intent Lifecycle

| Method | Description |
|--------|-------------|
| `QuoteIntent` | Get a quote for a swap, bridge, or DeFi operation |
| `CommitIntent` | Commit to a quoted route and receive transactions to sign |
| `ExecuteIntent` | Execute a committed intent after transaction submission |
| `WaitIntentReceipt` | Wait for intent completion and get the final receipt |

### Intent Management

| Method | Description |
|--------|-------------|
| `GetIntent` | Retrieve details of an existing intent by ID |
| `ListIntents` | List intents for a wallet, optionally filtered by status |
| `CancelIntent` | Cancel a committed but unexecuted intent |

### Discovery

| Method | Description |
|--------|-------------|
| `GetTokenPrices` | Get current prices for tokens across chains |
| `ListEarnPools` | List available yield/earn pools with APY data |
| `GetEarnPool` | Get details for a specific earn pool |
| `ListYieldVaults` | List yield vaults with strategy info and TVL |
| `GetYieldVault` | Get vault details including historical performance |

### Reference

| Method | Description |
|--------|-------------|
| `ListSupportedChains` | List all chains supported by Trails |
| `ListSupportedTokens` | List tokens available for a given chain |
| `GetRoute` | Preview a route without creating an intent |

### Utility

| Method | Description |
|--------|-------------|
| `EstimateGas` | Estimate gas cost for an intent |
| `GetTransactionStatus` | Check on-chain transaction status |

---

## Key Notes

### Base Units

All token amounts are in **base units** (wei for ETH, smallest denomination for ERC-20s). For example:
- 1 USDC = `"1000000"` (6 decimals)
- 1 ETH = `"1000000000000000000"` (18 decimals)

Always convert human-readable amounts to base units before submitting.

### Native Token Address

Use the canonical native token address for ETH, MATIC, etc.:

```
0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
```

This address represents the chain's native token in all Trails API calls.

### Transaction Submission

Transactions returned by `CommitIntent` must be submitted through the **Bankr CLI or API** (not directly to the RPC). Bankr handles nonce management, gas estimation, and MEV protection.

```bash
# Via CLI
bankr agent submit --commit-id <id> --signed-tx <hex>

# Via REST
POST /api/v1/agent/submit
```

### Slippage

- Default slippage: 50 basis points (0.5%)
- Maximum allowed: 500 basis points (5%)
- Set via `slippageBps` in the QuoteIntent request

### Cross-Chain Timing

- Same-chain swaps: ~15 seconds
- Cross-chain bridges: 2-20 minutes depending on chains
- Use `WaitIntentReceipt` with appropriate `timeoutMs` for cross-chain operations

---

## Gotchas

- **Tight expiry windows.** A `quoteId` is valid for only 30 seconds and a `commitId` for only 60 seconds. Don't stage these for later — call `CommitIntent` immediately after `QuoteIntent`, and submit + `ExecuteIntent` promptly after committing, or the route expires and you must re-quote.
- **`BANKR_API_KEY` is a shared secret.** The same key authenticates both Trails and Bankr and rides in the `Authorization: Bearer` header on every request. Never hard-code it or echo it into logs/receipts — source it from the `BANKR_API_KEY` env var.
- **Slippage is capped at 500 bps (5%).** A `slippageBps` above the max is rejected, not clamped. On thin liquidity or volatile cross-chain routes, an order can fail to fill within tolerance — handle the rejected/failed receipt rather than assuming success.
- **Don't bypass Bankr on submission.** Transactions from `CommitIntent` must go through the Bankr CLI/API, not straight to an RPC node — Bankr owns nonce management, gas, and MEV protection. Submitting directly will desync the intent's lifecycle state.
- **Cross-chain finality is not the receipt.** `WaitIntentReceipt` returning success means Trails observed completion; a bridge leg can still take 2-20 minutes, so set `timeoutMs` generously and treat a timeout as "still pending," not "failed."
