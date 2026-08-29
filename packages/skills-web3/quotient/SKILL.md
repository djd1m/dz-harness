---
name: "quotient"
description: "Market intelligence API with x402 micropayments — mispriced markets, analyst signals."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Quotient — Market Intelligence API with x402 Micropayments

Quotient provides AI-curated market intelligence through a REST API gated by x402 micropayments. Discover mispriced markets, track analyst signals, and access structured intelligence data with per-request payment.

---

## When to Use

- Use this skill when you need **read-only market intelligence** — mispriced markets, fair-value deviations, structured intelligence reports, or curated analyst buy/sell/hold signals — not for executing trades or moving funds.
- Reach for it when the answer requires Quotient's **model-derived `fairValue` / `confidence` / `signal` data**, which is unique to this API (e.g. `GET /api/v1/markets/mispriced`, `/api/v1/signals`, `/api/v1/intelligence` — paths illustrative; confirm against the live API, see Base URL note).
- Choose it when the consumer wants **pay-per-request access via x402 micropayments** on Base (USDC) and has no Quotient subscription — there is no upfront commitment.
- Pair it with a **wallet/signing skill** (e.g. `bankr`) for the x402 payment step; Quotient itself only verifies payment proofs and returns data, it does not custody or sign.
- Do **not** use it for raw on-chain price feeds, swaps, or wallet operations — those belong to the swap/wallet web3 skills. Quotient sits above them as the *intelligence/curation* layer.

---

## Base URL

> **TODO: unverified — the documented API contract is not reachable.** The Quotient product exists ([quotient.social](https://quotient.social), `dev.quotient.social`, and `docs.quotient.social` all resolve), and `api.quotient.social` resolves too — but every documented path on it returns **HTTP 404** (verified: `/`, `/openapi.json`, and `/api/public/pricing` all 404). So the base URL, endpoint paths, and payload shapes below could **not** be confirmed against a live API. **Before using this skill, obtain the current API base URL and endpoint paths from the official Quotient developer portal ([dev.quotient.social](https://dev.quotient.social)) / OpenAPI spec and replace them everywhere below.** Everything in this skill below this note is illustrative and unverified.

```
https://api.quotient.social   # TODO: unverified — host resolves but documented paths 404; confirm the real base URL + paths
```

---

## Access Model

Quotient supports two authentication methods:

### 1. x402 Micropayments

Pay per request using the HTTP 402 Payment Required protocol. No upfront subscription needed. Each endpoint has a published price in USDC.

### 2. API Key

Traditional API key authentication for higher-volume use. Obtain a key from [dev.quotient.social](https://dev.quotient.social).

```
Authorization: Bearer <QUOTIENT_API_KEY>
```

API key users are billed monthly based on usage.

---

## Getting an API Key

1. Visit [dev.quotient.social](https://dev.quotient.social)
2. Connect your wallet or sign up with email
3. Create a new application
4. Copy the generated API key
5. Set the environment variable:

```bash
export QUOTIENT_API_KEY="your-api-key-here"
```

---

## x402 Call Checklist

When using x402 micropayments, follow these 5 steps for every request:

### Step 1: Send Initial Request

```bash
GET https://api.quotient.social/api/v1/markets/mispriced
Authorization: x402
```

### Step 2: Parse 402 Response

The server responds with `402 Payment Required`:

```json
{
  "status": 402,
  "paymentRequired": {
    "network": "base",
    "token": "USDC",
    "amount": "0.01",
    "recipient": "0xQuotientPaymentAddress...",
    "memo": "quotient:markets:mispriced:req_abc123",
    "expiresAt": "2026-06-03T12:10:00.000Z"
  }
}
```

### Step 3: Sign Payment

Sign the payment transaction using your wallet:

```bash
bankr wallet sign-payment \
  --to 0xQuotientPaymentAddress... \
  --amount 0.01 \
  --token USDC \
  --chain base \
  --memo "quotient:markets:mispriced:req_abc123"
```

### Step 4: Retry with Payment Proof

```bash
GET https://api.quotient.social/api/v1/markets/mispriced
Authorization: x402
X-Payment-Proof: <signed-payment-hex>
X-Payment-TxHash: <tx-hash>
```

### Step 5: Parse Response

The server verifies payment on-chain and returns the data:

```json
{
  "status": 200,
  "data": { ... },
  "payment": {
    "amount": "0.01",
    "txHash": "0x...",
    "confirmed": true
  }
}
```

---

## Required Preflight Calls

Before making data requests, fetch pricing and schema information:

### OpenAPI Specification

```bash
GET https://api.quotient.social/openapi.json
```

Returns the full OpenAPI spec with endpoint definitions, request/response schemas, and x402 pricing annotations.

### Pricing Endpoint

```bash
GET https://api.quotient.social/api/public/pricing
```

Returns current per-endpoint pricing:

```json
{
  "endpoints": [
    { "path": "/api/v1/markets", "method": "GET", "price": "0.005", "token": "USDC" },
    { "path": "/api/v1/markets/mispriced", "method": "GET", "price": "0.01", "token": "USDC" },
    { "path": "/api/v1/markets/lookup", "method": "GET", "price": "0.005", "token": "USDC" },
    { "path": "/api/v1/intelligence", "method": "GET", "price": "0.02", "token": "USDC" },
    { "path": "/api/v1/signals", "method": "GET", "price": "0.015", "token": "USDC" }
  ],
  "network": "base",
  "token": "USDC"
}
```

Always check pricing before making paid requests. Prices may change between sessions.

---

## Core Endpoints

### List Markets

```bash
GET /api/v1/markets?category=crypto&status=active&limit=50
```

Returns a paginated list of tracked markets with metadata:

```json
{
  "markets": [
    {
      "id": "mkt_eth_usd",
      "name": "ETH/USD",
      "category": "crypto",
      "status": "active",
      "currentPrice": 3450.00,
      "volume24h": 12500000000,
      "marketCap": 415000000000,
      "sentiment": 0.72,
      "lastUpdated": "2026-06-03T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 1250,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### Mispriced Markets

```bash
GET /api/v1/markets/mispriced?threshold=0.05&category=crypto&limit=20
```

Returns markets where the current price deviates significantly from the model's fair value:

```json
{
  "mispriced": [
    {
      "market": "mkt_token_xyz",
      "name": "XYZ/USD",
      "currentPrice": 1.25,
      "fairValue": 1.85,
      "deviation": -0.324,
      "confidence": 0.87,
      "signal": "undervalued",
      "factors": [
        "TVL growth +45% (30d)",
        "Developer activity +120% (90d)",
        "Revenue run-rate underpriced vs peers"
      ],
      "updatedAt": "2026-06-03T11:55:00Z"
    }
  ]
}
```

### Market Lookup

```bash
GET /api/v1/markets/lookup?id=mkt_eth_usd
```

Retrieve detailed information for a specific market, including historical fair values, analyst coverage, and related signals.

### Intelligence

```bash
GET /api/v1/intelligence?topic=defi&timeframe=7d&limit=10
```

Returns structured intelligence reports:

```json
{
  "intelligence": [
    {
      "id": "intel_abc123",
      "topic": "defi",
      "title": "Base DEX volume surpasses Arbitrum for first time",
      "summary": "...",
      "relevance": 0.94,
      "sources": ["on-chain", "social", "news"],
      "markets_affected": ["mkt_base_dex_1", "mkt_arb_dex_1"],
      "publishedAt": "2026-06-02T18:30:00Z"
    }
  ]
}
```

### Analyst Signals

```bash
GET /api/v1/signals?type=buy&confidence_min=0.8&limit=20
```

Returns curated analyst signals (buy/sell/hold):

```json
{
  "signals": [
    {
      "id": "sig_xyz789",
      "market": "mkt_token_abc",
      "type": "buy",
      "confidence": 0.91,
      "analyst": "quant_model_v3",
      "priceTarget": 2.50,
      "currentPrice": 1.80,
      "timeframe": "30d",
      "rationale": "Breakout from accumulation pattern with rising on-chain activity",
      "createdAt": "2026-06-03T10:00:00Z"
    }
  ]
}
```

---

## Gotchas

- **The documented API contract is unverified.** `api.quotient.social` resolves but every documented path on it returns HTTP 404 (see Base URL note). Repoint every URL/path in this skill to the real, confirmed Quotient API before any request will succeed.
- **Prices drift between sessions.** Each endpoint's x402 price is published per-call (`/api/public/pricing`) and may change. Always fetch pricing before paying — do not hardcode `0.01`/`0.005` amounts.
- **Payment memos are request-scoped and expire.** The `memo` and `recipient` in a `402` response are tied to that specific `req_*` and carry an `expiresAt`. Sign and retry promptly; reusing an old memo or paying after expiry will fail verification.
- **Payment is verified on-chain on Base.** The retry only returns data once the USDC transfer is confirmed, so x402 requests inherit Base block finality latency — they are not instant. For latency-sensitive or high-volume use, prefer the API-key path (`Authorization: Bearer`) over per-request micropayments.
- **Keep `QUOTIENT_API_KEY` out of code and logs.** Read it from the environment variable; never inline it into URLs, commit it, or echo the `Bearer` header. API-key usage is billed monthly, so a leaked key is a financial exposure.

---

## References

- **API Docs**: [docs.quotient.social](https://docs.quotient.social) (resolves, but returned 404 at the time of writing — confirm the live docs path)
- **Developer Portal**: [dev.quotient.social](https://dev.quotient.social)
- **x402 Protocol**: [x402.org](https://x402.org)
- **OpenAPI Spec**: `https://api.quotient.social/openapi.json` — TODO: unverified (returned 404; confirm real path)
- **Status Page**: [status.quotient.social](https://status.quotient.social)
