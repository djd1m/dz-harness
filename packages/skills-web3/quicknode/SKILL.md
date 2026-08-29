---
name: "quicknode"
description: "Blockchain RPC and data access across 77+ networks with x402 pay-per-request."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# QuickNode — Blockchain RPC & Data Access

Blockchain RPC and data access across 77+ networks with x402 pay-per-request. No signup required for x402 endpoints — just pay per request with Base USDC.

## When to Use

- **You need raw JSON-RPC reads across many chains** — balances, gas estimates, transaction receipts, or `eth_call`/`getBalance` against Base, Ethereum, Polygon, Solana, Arbitrum, and 70+ others through one provider.
- **You want zero-setup, pay-as-you-go access** — reach for the x402 mode when an agent or script needs ad-hoc queries without provisioning an account or API key; payment is auto-negotiated per request via Base USDC.
- **You're enriching on-chain data with marketplace add-ons** — token metadata, wallet token balances, NFT ownership/collections, or priority-fee recommendations via the `qn_*` methods.
- **Not for signing or broadcasting trades** — this skill is read-and-pay RPC access; it does not build, sign, or submit swaps. Use a dedicated swap/wallet skill for transaction execution and slippage handling.
- **Choose API-key mode over x402** for production apps with sustained high throughput, where a monthly plan and stable rate limits beat per-request billing.

## Overview

QuickNode provides two access modes:

| Mode | Auth | Billing | Best For |
|------|------|---------|----------|
| **x402 (pay-per-request)** | None — auto-negotiated | Per-request via Base USDC | Agents, scripts, quick queries |
| **API Key** | `x-qn-api-version` header | Monthly plan | Production apps, high volume |

## x402 Client Setup (No Signup)

The x402 protocol enables pay-per-request RPC access. No API key, no account needed.

### Install the x402 Client

```bash
npm install x402-axios
```

### Configure the Client

```typescript
import { wrapAxiosClient } from "x402-axios";
import axios from "axios";

// Create an x402-enabled client
const client = wrapAxiosClient(axios, {
  // Wallet with Base USDC for payments
  paymentWallet: {
    privateKey: process.env.WALLET_PRIVATE_KEY,
    chain: "base",
  },
});

// Use any QuickNode x402 endpoint — no API key needed
const response = await client.post(
  "https://api.quicknode.com/x402/v1/base/mainnet",
  {
    jsonrpc: "2.0",
    method: "eth_blockNumber",
    params: [],
    id: 1,
  }
);

console.log("Block number:", parseInt(response.data.result, 16));
```

### Pricing (x402)

| Network | Cost per Request |
|---------|-----------------|
| Ethereum Mainnet | ~$0.0001 USDC |
| Base Mainnet | ~$0.00005 USDC |
| Polygon Mainnet | ~$0.00005 USDC |
| Solana Mainnet | ~$0.0001 USDC |

## API Key Access

For production apps with higher throughput, use a QuickNode API key:

```bash
# Set your QuickNode endpoint
export QN_ENDPOINT="https://your-endpoint.quiknode.pro/your-api-key/"
```

```typescript
import axios from "axios";

const endpoint = process.env.QN_ENDPOINT;

const response = await axios.post(endpoint, {
  jsonrpc: "2.0",
  method: "eth_blockNumber",
  params: [],
  id: 1,
});
```

## EVM Operations

### Get Native Balance

```typescript
async function getBalance(address: string): Promise<string> {
  const response = await client.post(RPC_URL, {
    jsonrpc: "2.0",
    method: "eth_getBalance",
    params: [address, "latest"],
    id: 1,
  });
  const weiBalance = BigInt(response.data.result);
  return (Number(weiBalance) / 1e18).toFixed(6);
}

// Usage
const balance = await getBalance("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
console.log(`Balance: ${balance} ETH`);
```

### Get ERC-20 Token Balance

```typescript
import { ethers } from "ethers";

const ERC20_BALANCE_OF = "0x70a08231";

async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string
): Promise<string> {
  const paddedAddress = walletAddress.slice(2).padStart(64, "0");
  const data = ERC20_BALANCE_OF + paddedAddress;

  const response = await client.post(RPC_URL, {
    jsonrpc: "2.0",
    method: "eth_call",
    params: [{ to: tokenAddress, data }, "latest"],
    id: 1,
  });

  return BigInt(response.data.result).toString();
}

// USDC on Base (6 decimals)
const usdcBalance = await getTokenBalance(
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "0xYourWallet"
);
console.log(`USDC: ${Number(usdcBalance) / 1e6}`);
```

### Estimate Gas

```typescript
async function estimateGas(tx: {
  from: string;
  to: string;
  value?: string;
  data?: string;
}): Promise<string> {
  const response = await client.post(RPC_URL, {
    jsonrpc: "2.0",
    method: "eth_estimateGas",
    params: [tx],
    id: 1,
  });
  return response.data.result; // hex gas units
}

const gasEstimate = await estimateGas({
  from: "0xSender",
  to: "0xRecipient",
  value: "0x" + (0.01 * 1e18).toString(16), // 0.01 ETH
});
console.log(`Gas estimate: ${parseInt(gasEstimate, 16)} units`);
```

### Get Transaction Receipt

```typescript
async function getTxReceipt(txHash: string) {
  const response = await client.post(RPC_URL, {
    jsonrpc: "2.0",
    method: "eth_getTransactionReceipt",
    params: [txHash],
    id: 1,
  });
  const receipt = response.data.result;
  return {
    status: receipt.status === "0x1" ? "success" : "failed",
    blockNumber: parseInt(receipt.blockNumber, 16),
    gasUsed: parseInt(receipt.gasUsed, 16),
    effectiveGasPrice: parseInt(receipt.effectiveGasPrice, 16),
    logs: receipt.logs,
  };
}
```

## Solana Operations

### Get SOL Balance

```typescript
async function getSolBalance(pubkey: string): Promise<number> {
  const response = await client.post(SOLANA_RPC_URL, {
    jsonrpc: "2.0",
    method: "getBalance",
    params: [pubkey],
    id: 1,
  });
  return response.data.result.value / 1e9; // lamports to SOL
}
```

### Get Token Accounts

```typescript
async function getTokenAccounts(owner: string) {
  const response = await client.post(SOLANA_RPC_URL, {
    jsonrpc: "2.0",
    method: "getTokenAccountsByOwner",
    params: [
      owner,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ],
    id: 1,
  });
  return response.data.result.value.map((account: any) => ({
    mint: account.account.data.parsed.info.mint,
    balance: account.account.data.parsed.info.tokenAmount.uiAmount,
    decimals: account.account.data.parsed.info.tokenAmount.decimals,
  }));
}
```

## Marketplace Add-ons

QuickNode offers add-on APIs via the marketplace. Enable them on your endpoint dashboard.

### Token API

```typescript
// Get token metadata
const metadata = await client.post(RPC_URL, {
  jsonrpc: "2.0",
  method: "qn_getTokenMetadataByContractAddress",
  params: [{ contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }],
  id: 1,
});

// Get wallet token balances
const balances = await client.post(RPC_URL, {
  jsonrpc: "2.0",
  method: "qn_getWalletTokenBalance",
  params: [{ wallet: "0xYourWallet" }],
  id: 1,
});
```

### NFT API

```typescript
// Get NFTs owned by address
const nfts = await client.post(RPC_URL, {
  jsonrpc: "2.0",
  method: "qn_fetchNFTs",
  params: [{ wallet: "0xYourWallet", page: 1, perPage: 10 }],
  id: 1,
});

// Get NFT collection details
const collection = await client.post(RPC_URL, {
  jsonrpc: "2.0",
  method: "qn_fetchNFTCollectionDetails",
  params: [{ contracts: ["0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"] }],
  id: 1,
});
```

### Priority Fee API

```typescript
// Get recommended priority fees (for Base/Ethereum)
const fees = await client.post(RPC_URL, {
  jsonrpc: "2.0",
  method: "qn_estimatePriorityFees",
  params: [{ last_n_blocks: 100, account: "0xYourContract" }],
  id: 1,
});
// Returns: { per_gas: { extreme, fast, medium, low } }
```

## Supported Chains

| Chain | Chain ID | x402 Endpoint | Notes |
|-------|----------|---------------|-------|
| **Base** | 8453 | `/x402/v1/base/mainnet` | Primary for USDC payments |
| **Ethereum** | 1 | `/x402/v1/ethereum/mainnet` | Full archive data |
| **Polygon** | 137 | `/x402/v1/polygon/mainnet` | Low-cost operations |
| **Solana** | — | `/x402/v1/solana/mainnet` | SPL tokens + NFTs |
| **Unichain** | 130 | `/x402/v1/unichain/mainnet` | Uniswap L2 |
| **Arbitrum** | 42161 | `/x402/v1/arbitrum/mainnet` | Optimistic rollup |
| **Optimism** | 10 | `/x402/v1/optimism/mainnet` | OP Stack |
| **BNB Chain** | 56 | `/x402/v1/bsc/mainnet` | Binance ecosystem |
| **Avalanche** | 43114 | `/x402/v1/avalanche/mainnet` | Subnets |

Full list: 77+ networks including testnets.

## Error Handling

| HTTP Code | Meaning | Action |
|-----------|---------|--------|
| **200** | Success | Parse `result` field |
| **402** | Payment Required | x402 auto-negotiates; ensure wallet has USDC |
| **429** | Rate Limited | Back off exponentially; x402 has per-request limits |
| **500** | Internal Error | Retry with exponential backoff |
| **-32000** | Execution Error | Check params (e.g., invalid address format) |
| **-32601** | Method Not Found | Enable the add-on or check method name |

```typescript
async function safeRpcCall(method: string, params: any[]) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.post(RPC_URL, {
        jsonrpc: "2.0",
        method,
        params,
        id: 1,
      });
      if (response.data.error) {
        throw new Error(`RPC Error ${response.data.error.code}: ${response.data.error.message}`);
      }
      return response.data.result;
    } catch (err: any) {
      if (err.response?.status === 429 || err.response?.status === 500) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed after ${MAX_RETRIES} retries`);
}
```

## References

- QuickNode Docs: https://www.quicknode.com/docs
- x402 Protocol: https://www.x402.org/
- QuickNode Marketplace: https://marketplace.quicknode.com/
