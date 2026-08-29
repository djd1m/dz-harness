---
name: "bankr"
description: "AI trading agent platform — wallet API, token swaps, bridges, DCA, stop-loss, leverage, token deployment."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Bankr — AI Trading Agent Platform

Bankr is a full-stack AI trading agent platform providing wallet management, token swaps, cross-chain bridges, DCA strategies, stop-loss orders, leveraged trading, token deployment, and more. It offers two integration options: a CLI tool and a REST API.

---

## When to Use

- Reach for Bankr when you need an **agent-managed trading wallet** that executes async strategies (swaps, bridges, limit/stop-loss, DCA, TWAP, leverage) on its behalf — not just to read on-chain data.
- Use it for **multi-chain EVM + Solana** trading from one API key across Base, Ethereum, Polygon, Arbitrum, BNB, Unichain, World Chain, and Solana — pick another skill if your target chain isn't in this list.
- Choose Bankr when you want **custodial agent wallets with built-in MEV-protected routing**, rather than signing your own transactions through a raw RPC or DEX SDK.
- It's the right tool for **automated strategy bots** (cron/cron-like DCA, stop-loss, TWAP) and for the bundled **multi-provider LLM gateway** used for agent reasoning — skip it if you only need a one-off price quote or a stateless read.
- Use the Wallet API layer for **synchronous reads** (balances, portfolio, token lookups) and the Agent API layer for **async task-based execution** that you poll to completion.

---

## Integration Options

### 1. CLI (`@bankr/cli`)

Install globally:

```bash
npm install -g @bankr/cli
```

The CLI is ideal for scripting, cron jobs, and local agent workflows.

### 2. REST API

Base URL:

```
https://api.bankr.bot/api/v1
```

The REST API is suitable for server-side integrations, hosted agents, and programmatic access from any language.

---

## API Layers

Bankr exposes two distinct API layers:

| Layer | Type | Description |
|-------|------|-------------|
| **Wallet API** | Synchronous | Wallet creation, balance queries, token lookups, portfolio data. Responses are immediate. |
| **Agent API** | Asynchronous | Swaps, bridges, limit orders, DCA, stop-loss. Operations are submitted as tasks and tracked to completion. |

The Wallet API returns data inline. The Agent API returns a `taskId` which you poll via `GET /api/v1/agent/task/{taskId}` until the status is `completed` or `failed`.

---

## Getting API Keys

### Step 1: Email OTP Login

```bash
bankr login --email you@example.com
```

An OTP code is sent to your email. Enter it to authenticate.

### Step 2: Terminal Web UI

After login, open the Terminal web UI at [terminal.bankr.bot](https://terminal.bankr.bot) to manage API keys, view wallets, and configure agent profiles.

### Login Options and Flags

```bash
bankr login --email <email>        # Email OTP authentication
bankr login --wallet <address>     # Wallet-based auth (sign message)
bankr login --api-key <key>        # Direct API key auth (non-interactive)

# Flags
--profile <name>                   # Select agent profile
--chain <chain>                    # Set default chain context
--json                             # Output as JSON (for scripting)
--quiet                            # Suppress interactive prompts
```

---

## CLI Namespaces

### `bankr wallet`

Wallet lifecycle and balance management:

```bash
bankr wallet create --chain base           # Create a new wallet on Base
bankr wallet list                           # List all wallets
bankr wallet balance --chain base           # Get balances for Base wallet
bankr wallet export --address 0x...         # Export wallet (encrypted)
bankr wallet fund --amount 0.01 --chain base  # Fund from faucet (testnet)
```

### `bankr agent`

Trading operations and strategy management:

```bash
bankr agent swap --from USDC --to ETH --amount 100 --chain base
bankr agent bridge --token USDC --amount 100 --from ethereum --to base
bankr agent limit --buy ETH --at 3000 --spend 1000 --chain base
bankr agent stop-loss --token ETH --trigger 2800 --chain base
bankr agent dca --buy ETH --spend 100 --frequency daily --chain base
bankr agent twap --buy ETH --spend 10000 --duration 24h --chain base
bankr agent submit --commit-id <id> --signed-tx <hex>
bankr agent task <taskId>                   # Check task status
```

### `bankr tokens`

Token discovery and metadata:

```bash
bankr tokens search <query>               # Search tokens by name/symbol
bankr tokens info <address> --chain base   # Token metadata and stats
bankr tokens trending --chain base         # Trending tokens
bankr tokens deploy --name "MyToken" --symbol MTK --supply 1000000 --chain base
```

### `bankr llm`

Multi-provider LLM gateway:

```bash
bankr llm chat --model gpt-4 --prompt "Analyze ETH price action"
bankr llm models                           # List available models
bankr llm credits                          # Check remaining credits
```

---

## Capabilities

### Trading & Execution

| Capability | Description |
|------------|-------------|
| **Swaps** | Instant token swaps with MEV protection and best-route aggregation |
| **Bridges** | Cross-chain token transfers between supported chains |
| **Limit Orders** | Buy/sell at specified price targets, GTC (good-til-canceled) |
| **Stop Loss** | Automatic sell when token drops to trigger price |
| **DCA** | Dollar-cost averaging with configurable frequency (hourly/daily/weekly) |
| **TWAP** | Time-weighted average price execution over a specified duration |

### Portfolio & Analytics

| Capability | Description |
|------------|-------------|
| **Portfolio PnL** | Real-time profit/loss tracking across all positions and chains |
| **NFTs** | View, transfer, and list NFT holdings |
| **Polymarket** | Trade prediction market positions on Polymarket |

### Advanced

| Capability | Description |
|------------|-------------|
| **Leverage Trading** | Up to 50x on perpetuals, 100x on select pairs |
| **Token Deployment** | Deploy ERC-20 tokens with configurable supply and metadata |

---

## Supported Chains

| Chain | Chain ID | Status |
|-------|----------|--------|
| **Base** | 8453 | Full support |
| **Polygon** | 137 | Full support |
| **Ethereum** | 1 | Full support |
| **Solana** | — | Full support |
| **Unichain** | 130 | Full support |
| **World Chain** | 480 | Full support |
| **Arbitrum** | 42161 | Full support |
| **BNB Chain** | 56 | Full support |

---

## LLM Gateway

Bankr includes a multi-provider LLM gateway for agent reasoning:

- **Providers**: OpenAI, Anthropic, Mistral, Llama, and more
- **Billing**: Credit-based (purchased via terminal.bankr.bot)
- **Usage**: Each request is metered by input/output tokens
- **Models**: Access all major models through a single API key

```bash
POST /api/v1/llm/chat
{
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "Analyze ETH support levels" }
  ]
}
```

---

## Safety Features

### Dedicated Wallets

Each agent profile has its own isolated wallet. Funds in one profile cannot be accessed by another.

### Read-Only API Keys

Generate read-only keys that can query balances and portfolio data but cannot execute trades or transfers:

```bash
bankr api-key create --scope read-only
```

### IP Whitelist

Restrict API key usage to specific IP addresses:

```bash
bankr api-key update --key <key> --whitelist "203.0.113.0/24,198.51.100.42"
```

---

## Agent Profiles

Profiles isolate agent configurations, wallets, and strategies:

```bash
bankr profile create --name "dca-bot" --chain base
bankr profile list
bankr profile switch --name "dca-bot"
bankr profile delete --name "old-bot"
```

Each profile maintains:
- Its own wallet(s)
- Default chain
- Active strategies (DCA, stop-loss, limit orders)
- Trade history
- PnL tracking

---

## Gotchas

- **Agent API is asynchronous** — swaps, bridges, limit/stop-loss, DCA, and TWAP return a `taskId`, not a result. You must poll `GET /api/v1/agent/task/{taskId}` (or `bankr agent task <taskId>`) until status is `completed` or `failed`; treating the submit response as final will lose track of the trade.
- **Leverage is high-risk** — up to 50x on perpetuals and 100x on select pairs means liquidation can happen on small adverse moves. Pair leveraged positions with `stop-loss` orders, and remember stop-loss/limit triggers fire off price feeds, not guaranteed fills, so slippage and gaps can execute worse than the trigger.
- **Key scoping and secrets** — execution keys can move funds; use `--scope read-only` keys for balance/portfolio queries and the IP whitelist (`bankr api-key update --whitelist ...`) for execution keys. Never commit API keys; prefer `bankr login --api-key` from env in non-interactive/scripted flows.
- **Cross-chain finality** — `bankr agent bridge` operations settle only after the destination chain confirms; a `completed` task on the source side does not mean funds are spendable on the destination yet. Solana uses no EVM chain ID, so chain-by-ID logic must special-case it.
- **LLM gateway is credit-metered** — `bankr llm chat` requests are billed per input/output token against credits bought at terminal.bankr.bot; requests fail once credits are exhausted. Check `bankr llm credits` before long agent-reasoning loops.
