---
name: "zerion"
description: "Interpreted crypto wallet data across 41+ chains — portfolio, positions, PnL, transactions, swaps."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Zerion — Crypto Wallet Data & DeFi Analytics

Interpreted crypto wallet data across 41+ chains. Portfolio breakdowns, token positions, PnL analysis, transaction history, NFTs, swaps, and real-time webhooks.

## Overview

Zerion API provides **interpreted** blockchain data — not raw hex, but human-readable portfolio analytics. It normalizes data across 41+ chains into a unified format.

| Feature | Endpoint Prefix | Auth |
|---------|----------------|------|
| Wallet data | `/v1/wallets/` | API Key |
| Fungible tokens | `/v1/fungibles/` | API Key |
| NFTs | `/v1/nft/` | API Key |
| DApps | `/v1/dapps/` | API Key |
| Chains | `/v1/chains/` | API Key |
| Gas prices | `/v1/gas/` | API Key |
| Swaps | `/v1/swap/` | API Key |

**Base URL:** `https://api.zerion.io`

**Auth:** HTTP Basic with API key as username, empty password:

```bash
# Header format
Authorization: Basic $(echo -n "$ZERION_API_KEY:" | base64)
```

## When to Use

- **You need *interpreted*, read-mostly wallet analytics** — portfolio totals, token positions, PnL, transaction history, NFTs, or charts — normalized across 41+ chains into one format. Reach for a node-RPC or block-explorer skill instead if you need raw on-chain reads (`eth_call`, logs, raw receipts).
- **You're building multi-chain portfolio or PnL views** keyed by a wallet address. Zerion already aggregates EVM chains plus Solana, so you avoid querying each chain separately.
- **You want a swap *quote* and an unsigned swap transaction** to research or build a trade (`/v1/swap/`). Note Zerion returns the unsigned tx but does not sign or broadcast — pair it with Bankr (see Research-to-Execute) or your own signer for execution.
- **You need real-time wallet event notifications** via webhooks (`transactions`/`positions`) with RSA-signed payloads, rather than polling.
- **Use a different skill when:** you need raw byte-level chain access, mempool/pending-tx streams, contract deployment, or signing/broadcasting — Zerion is a data + quote layer, not a transaction-execution or low-level RPC layer.

## CLI Quick Start

```bash
# Set API key
export ZERION_API_KEY="zk_dev_xxxxx"

# Get wallet portfolio
curl -s "https://api.zerion.io/v1/wallets/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045/portfolio" \
  -u "$ZERION_API_KEY:" \
  | jq '.data.attributes'

# Get wallet positions
curl -s "https://api.zerion.io/v1/wallets/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045/positions/?filter[positions]=only_simple&currency=usd" \
  -u "$ZERION_API_KEY:" \
  | jq '.data[] | {name: .attributes.name, value: .attributes.value}'
```

## Wallet Endpoints

### Portfolio Overview

```typescript
import axios from "axios";

const zerion = axios.create({
  baseURL: "https://api.zerion.io",
  auth: { username: process.env.ZERION_API_KEY!, password: "" },
  headers: { accept: "application/json" },
});

interface PortfolioData {
  total_value: number;
  changes: {
    absolute_1d: number;
    percent_1d: number;
  };
  positions_distribution_by_type: Record<string, number>;
  positions_distribution_by_chain: Record<string, number>;
}

async function getPortfolio(address: string): Promise<PortfolioData> {
  const { data } = await zerion.get(
    `/v1/wallets/${address}/portfolio?currency=usd`
  );
  return data.data.attributes;
}
```

### Token Positions

```typescript
interface Position {
  name: string;
  symbol: string;
  quantity: number;
  value: number;
  price: number;
  chain: string;
  changes: { absolute_1d: number; percent_1d: number };
}

async function getPositions(
  address: string,
  options?: {
    filter?: "only_simple" | "only_staked" | "only_locked";
    sort?: "value" | "-value";
    chain?: string;
  }
): Promise<Position[]> {
  const params = new URLSearchParams({ currency: "usd" });
  if (options?.filter) params.set("filter[positions]", options.filter);
  if (options?.sort) params.set("sort", options.sort);
  if (options?.chain) params.set("filter[chain_ids]", options.chain);

  const { data } = await zerion.get(
    `/v1/wallets/${address}/positions/?${params}`
  );

  return data.data.map((pos: any) => ({
    name: pos.attributes.name,
    symbol: pos.attributes.fungible_info?.symbol,
    quantity: pos.attributes.quantity?.float,
    value: pos.attributes.value,
    price: pos.attributes.price,
    chain: pos.relationships?.chain?.data?.id,
    changes: pos.attributes.changes,
  }));
}
```

### Transactions

```typescript
interface Transaction {
  hash: string;
  type: string;
  status: string;
  mined_at: string;
  fee: { value: number };
  transfers: Array<{
    direction: "in" | "out";
    fungible_info: { name: string; symbol: string };
    quantity: number;
    value: number;
  }>;
}

async function getTransactions(
  address: string,
  options?: {
    chain?: string;
    type?: "trade" | "send" | "receive" | "approve" | "mint";
    after?: string; // cursor for pagination
  }
): Promise<{ transactions: Transaction[]; nextCursor?: string }> {
  const params = new URLSearchParams({ currency: "usd" });
  if (options?.chain) params.set("filter[chain_ids]", options.chain);
  if (options?.type) params.set("filter[operation_types]", options.type);
  if (options?.after) params.set("page[after]", options.after);

  const { data } = await zerion.get(
    `/v1/wallets/${address}/transactions/?${params}`
  );

  return {
    transactions: data.data.map((tx: any) => ({
      hash: tx.attributes.hash,
      type: tx.attributes.operation_type,
      status: tx.attributes.status,
      mined_at: tx.attributes.mined_at,
      fee: tx.attributes.fee,
      transfers: tx.attributes.transfers,
    })),
    nextCursor: data.links?.next,
  };
}
```

### Profit & Loss (PnL)

```typescript
interface PnLData {
  total: { absolute: number; relative: number };
  realized: { absolute: number; relative: number };
  unrealized: { absolute: number; relative: number };
}

async function getPnL(
  address: string,
  options?: { chain?: string }
): Promise<PnLData> {
  const params = new URLSearchParams({ currency: "usd" });
  if (options?.chain) params.set("filter[chain_ids]", options.chain);

  const { data } = await zerion.get(
    `/v1/wallets/${address}/pnl/?${params}`
  );
  return data.data.attributes;
}
```

### Portfolio Chart

```typescript
async function getChart(
  address: string,
  period: "1d" | "1w" | "1m" | "3m" | "1y" | "max"
): Promise<Array<{ timestamp: number; value: number }>> {
  const { data } = await zerion.get(
    `/v1/wallets/${address}/charts/?currency=usd&charts_period=${period}`
  );
  return data.data.map((point: any) => ({
    timestamp: point.attributes.timestamp,
    value: point.attributes.value,
  }));
}
```

### NFTs

```typescript
async function getNFTs(
  address: string,
  options?: { chain?: string; collection?: string }
): Promise<any[]> {
  const params = new URLSearchParams();
  if (options?.chain) params.set("filter[chain_ids]", options.chain);
  if (options?.collection)
    params.set("filter[collection_address]", options.collection);

  const { data } = await zerion.get(
    `/v1/wallets/${address}/nft-positions/?${params}`
  );
  return data.data.map((nft: any) => ({
    name: nft.attributes.nft_info?.name,
    collection: nft.attributes.nft_info?.collection?.name,
    chain: nft.relationships?.chain?.data?.id,
    floor_price: nft.attributes.nft_info?.floor_price,
    image: nft.attributes.nft_info?.content?.preview?.url,
  }));
}
```

## Fungible Token Endpoints

```typescript
// Get token details
async function getFungible(id: string) {
  const { data } = await zerion.get(`/v1/fungibles/${id}?currency=usd`);
  return data.data.attributes;
}

// Search tokens
async function searchFungibles(query: string) {
  const { data } = await zerion.get(
    `/v1/fungibles/?filter[search_query]=${encodeURIComponent(query)}&currency=usd`
  );
  return data.data;
}

// Get token charts
async function getFungibleChart(id: string, period: string) {
  const { data } = await zerion.get(
    `/v1/fungibles/${id}/charts/?currency=usd&charts_period=${period}`
  );
  return data.data;
}
```

## DApp & Chain Endpoints

```typescript
// List DApps
async function getDApps(chain?: string) {
  const params = chain ? `?filter[chain_ids]=${chain}` : "";
  const { data } = await zerion.get(`/v1/dapps/${params}`);
  return data.data;
}

// Get supported chains
async function getChains() {
  const { data } = await zerion.get("/v1/chains/");
  return data.data.map((c: any) => ({
    id: c.id,
    name: c.attributes.name,
    icon: c.attributes.icon?.url,
    explorer: c.attributes.explorer?.home_url,
  }));
}
```

## Gas Prices

```typescript
async function getGasPrices(chain: string) {
  const { data } = await zerion.get(`/v1/gas/${chain}`);
  return {
    fast: data.data.attributes.fast,
    standard: data.data.attributes.standard,
    slow: data.data.attributes.slow,
  };
}
```

## Swap Endpoints

```typescript
// Get swap quote
async function getSwapQuote(params: {
  input_token: string;
  output_token: string;
  input_amount: string;
  slippage: number;
  from_address: string;
  chain_id: string;
}) {
  const { data } = await zerion.get("/v1/swap/quote/", { params });
  return data.data;
}

// Execute swap (returns unsigned transaction)
async function getSwapTransaction(params: {
  input_token: string;
  output_token: string;
  input_amount: string;
  slippage: number;
  from_address: string;
  chain_id: string;
}) {
  const { data } = await zerion.get("/v1/swap/transaction/", { params });
  return data.data; // { to, data, value, gas } — sign and send
}
```

## Webhooks

Zerion supports real-time webhook notifications for wallet events.

### Create Subscription

```typescript
import crypto from "crypto";

// Generate RSA key pair for webhook signature verification
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

async function createWebhook(params: {
  address: string;
  event_type: "transactions" | "positions";
  url: string;
}) {
  const { data } = await zerion.post("/v1/webhooks/", {
    data: {
      type: "webhooks",
      attributes: {
        delivery_url: params.url,
        event_type: params.event_type,
        payload_type: "full",
        public_key: publicKey,
      },
      relationships: {
        wallet: {
          data: { type: "wallets", id: params.address },
        },
      },
    },
  });
  return data.data;
}
```

### Verify Webhook Signature

```typescript
function verifyWebhookSignature(
  payload: string,
  signature: string,
  publicKey: string
): boolean {
  const verifier = crypto.createVerify("SHA256");
  verifier.update(payload);
  return verifier.verify(publicKey, signature, "base64");
}

// Express middleware
app.post("/webhook", (req, res) => {
  const signature = req.headers["x-zerion-signature"] as string;
  const isValid = verifyWebhookSignature(
    JSON.stringify(req.body),
    signature,
    publicKey
  );
  if (!isValid) return res.status(401).send("Invalid signature");

  const event = req.body;
  console.log(`Event: ${event.type}`, event.data);
  res.status(200).send("OK");
});
```

## Rate Limits

| Plan | Requests/min | Webhooks | Chains |
|------|-------------|----------|--------|
| **Free** | 60 | 5 | All 41+ |
| **Growth** | 600 | 50 | All 41+ |
| **Pro** | 6,000 | 500 | All 41+ |
| **Enterprise** | Custom | Custom | All 41+ |

Rate limit headers:
- `X-RateLimit-Limit` — max requests per window
- `X-RateLimit-Remaining` — remaining requests
- `X-RateLimit-Reset` — window reset timestamp

## Gotchas

- **Auth is HTTP Basic with an empty password** — the API key goes in the *username* slot and the password is blank (`-u "$ZERION_API_KEY:"`, note the trailing colon). Forgetting the colon or putting the key in the password field returns 401. Use `zk_dev_*` keys only server-side; never ship them to a browser/client bundle.
- **Free tier is 60 req/min and webhook subscriptions are capped per plan** (Free: 5, Growth: 50, Pro: 500). Watch `X-RateLimit-Remaining` and back off on 429 — fan-out calls (positions + PnL + charts per wallet) burn the budget fast.
- **Swap quotes are time-sensitive and Zerion only returns an *unsigned* transaction.** It does not sign or broadcast. Re-fetch the quote right before signing, set `slippage` deliberately (it's a percent, e.g. `0.5`), and use the native-token sentinel `0xEeee…EEeE` for ETH/native input rather than a wrapped address unless you mean wrapped.
- **Data is interpreted and indexer-backed, not chain-final.** Recently mined transactions and positions can lag head, and balances reflect Zerion's indexing — for settlement-critical logic confirm against the chain. Chains use Zerion string IDs (`ethereum`, `base`, `binance-smart-chain`) in `filter[chain_ids]`, which differ from numeric EVM chain IDs.
- **Webhook payloads are RSA-signed** with the public key *you* supply at subscription time; always verify `x-zerion-signature` against the exact raw body before trusting an event, and paginate list endpoints via the cursor in `links.next` (`page[after]`) rather than assuming a single page.

## Supported Chains (41+)

| Chain | Chain ID | Zerion ID |
|-------|----------|-----------|
| Ethereum | 1 | `ethereum` |
| Base | 8453 | `base` |
| Polygon | 137 | `polygon` |
| Arbitrum | 42161 | `arbitrum` |
| Optimism | 10 | `optimism` |
| BNB Chain | 56 | `binance-smart-chain` |
| Avalanche | 43114 | `avalanche` |
| Solana | — | `solana` |
| Blast | 81457 | `blast` |
| Scroll | 534352 | `scroll` |
| zkSync Era | 324 | `zksync-era` |
| Linea | 59144 | `linea` |
| Fantom | 250 | `fantom` |
| Gnosis | 100 | `gnosis` |
| Zora | 7777777 | `zora` |
| Celo | 42220 | `celo` |
| Moonbeam | 1284 | `moonbeam` |
| Aurora | 1313161554 | `aurora` |

Plus 23+ additional chains. Full list at `/v1/chains/`.

## MCP Server Configuration

For Claude Desktop or Claude Code integration:

```json
{
  "mcpServers": {
    "zerion": {
      "command": "npx",
      "args": ["-y", "@anthropic/zerion-mcp-server"],
      "env": {
        "ZERION_API_KEY": "zk_dev_xxxxx"
      }
    }
  }
}
```

## Research-to-Execute Pattern with Bankr

Use Zerion for research, then execute via Bankr:

```typescript
// 1. Research: Get current positions
const positions = await getPositions(walletAddress, {
  filter: "only_simple",
  sort: "-value",
});

// 2. Research: Check token PnL
const pnl = await getPnL(walletAddress);

// 3. Research: Get swap quote
const quote = await getSwapQuote({
  input_token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // ETH
  output_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  input_amount: "100000000000000000", // 0.1 ETH
  slippage: 0.5,
  from_address: walletAddress,
  chain_id: "8453", // Base
});

// 4. Execute: Submit swap via Bankr
const bankrResponse = await bankr.post("/api/v1/submit", {
  chain: "base",
  type: "swap",
  params: {
    input_token: "ETH",
    output_token: "USDC",
    amount: "0.1",
    slippage: 0.5,
  },
});
```

## References

- Zerion API Docs: https://developers.zerion.io/
- Zerion App: https://app.zerion.io/
- API Key Dashboard: https://developers.zerion.io/dashboard
