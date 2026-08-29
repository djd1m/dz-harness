---
name: "symbiosis"
description: "Cross-chain token swaps across 54+ blockchains with automatic routing."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Symbiosis — Cross-Chain Token Swaps

Cross-chain token swaps across 54+ blockchains with automatic routing. Get quotes and execute swaps with optimal paths found automatically.

## Overview

Symbiosis aggregates liquidity across 54+ chains and finds the best route for any token pair. The workflow is always:

1. **Quote** — get estimated output and route
2. **Approve** — approve token spending (if ERC-20)
3. **Swap** — sign and send the transaction
4. **Track** — monitor cross-chain completion

## When to Use

- Use this skill when you need to **move a token from one chain to another** (e.g. ETH on Base → USDC on Ethereum) — its core job is cross-chain swaps with automatic routing across 54+ blockchains. For a same-chain DEX swap on a single network, a single-chain aggregator skill is a better fit.
- Use it when you want Symbiosis to **find the optimal route automatically** rather than hand-picking a bridge plus a DEX; it aggregates liquidity and returns the best path for the pair.
- Use it when the supported set covers your chains — Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche and 47+ others (see Supported Chains link). If a chain isn't on Symbiosis, reach for a different bridge/swap skill.
- Use the **Bankr Submit integration** (below) for agent-driven execution via Bankr's custodial agent wallet (no local private-key handling); use the raw Python scripts when you sign transactions yourself with a local private key and RPC.
- Not for price-only lookups or portfolio reads — this skill quotes and *executes* swaps. For balances/prices without a transaction, use a read-only wallet/market-data skill.

## Quote Script (Python)

```python
#!/usr/bin/env python3
"""symbiosis_quote.py — Get a cross-chain swap quote from Symbiosis."""

import requests
import json
import sys

SYMBIOSIS_API = "https://api-v2.symbiosis.finance/crosschain/v1"

def get_quote(
    token_in: dict,
    token_out: dict,
    amount: str,
    from_address: str,
    slippage: int = 300,  # 3% = 300 basis points
) -> dict:
    """
    Get a swap quote.

    token_in / token_out format:
      { "chainId": 8453, "address": "0x...", "decimals": 18, "symbol": "ETH" }
      Use "0x0000000000000000000000000000000000000000" for native tokens.
    """
    payload = {
        "tokenAmountIn": {
            "address": token_in["address"],
            "chainId": token_in["chainId"],
            "decimals": token_in["decimals"],
            "amount": amount,
        },
        "tokenOut": {
            "address": token_out["address"],
            "chainId": token_out["chainId"],
            "decimals": token_out["decimals"],
        },
        "from": from_address,
        "to": from_address,
        "slippage": slippage,
    }

    response = requests.post(f"{SYMBIOSIS_API}/swap", json=payload)
    response.raise_for_status()
    return response.json()


def format_quote(result: dict) -> str:
    """Format quote for display."""
    token_out = result.get("tokenAmountOut", {})
    amount_out = int(token_out.get("amount", "0"))
    decimals = token_out.get("decimals", 18)
    human_amount = amount_out / (10 ** decimals)

    route = result.get("route", [])
    route_str = " -> ".join(
        [f"{r.get('symbol', '?')} ({r.get('chainId', '?')})" for r in route]
    )

    fee = result.get("fee", {})
    fee_usd = fee.get("amountInUsd", "0")

    return (
        f"Output: {human_amount:.6f} {token_out.get('symbol', '?')}\n"
        f"Route: {route_str}\n"
        f"Fee: ${fee_usd}\n"
        f"Price impact: {result.get('priceImpact', 'N/A')}%"
    )


if __name__ == "__main__":
    # Example: 0.1 ETH on Base -> USDC on Ethereum
    ETH_BASE = {
        "chainId": 8453,
        "address": "0x0000000000000000000000000000000000000000",
        "decimals": 18,
        "symbol": "ETH",
    }
    USDC_ETH = {
        "chainId": 1,
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "decimals": 6,
        "symbol": "USDC",
    }

    wallet = sys.argv[1] if len(sys.argv) > 1 else "0xYourWalletAddress"
    amount = str(int(0.1 * 1e18))  # 0.1 ETH in wei

    result = get_quote(ETH_BASE, USDC_ETH, amount, wallet)
    print(format_quote(result))
```

## Swap Script (Python)

```python
#!/usr/bin/env python3
"""symbiosis_swap.py — Execute a cross-chain swap via Symbiosis."""

import requests
import json
from web3 import Web3

SYMBIOSIS_API = "https://api-v2.symbiosis.finance/crosschain/v1"


def execute_swap(
    token_in: dict,
    token_out: dict,
    amount: str,
    wallet_address: str,
    private_key: str,
    rpc_url: str,
    slippage: int = 300,
) -> str:
    """Execute a cross-chain swap. Returns transaction hash."""

    # Step 1: Get swap transaction data
    payload = {
        "tokenAmountIn": {
            "address": token_in["address"],
            "chainId": token_in["chainId"],
            "decimals": token_in["decimals"],
            "amount": amount,
        },
        "tokenOut": {
            "address": token_out["address"],
            "chainId": token_out["chainId"],
            "decimals": token_out["decimals"],
        },
        "from": wallet_address,
        "to": wallet_address,
        "slippage": slippage,
    }

    response = requests.post(f"{SYMBIOSIS_API}/swap", json=payload)
    response.raise_for_status()
    result = response.json()

    tx_data = result["tx"]

    # Step 2: Approve if needed (ERC-20 tokens)
    approve_data = result.get("approveTo")
    if approve_data and token_in["address"] != "0x0000000000000000000000000000000000000000":
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        erc20_abi = [
            {
                "name": "approve",
                "type": "function",
                "inputs": [
                    {"name": "spender", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                ],
                "outputs": [{"name": "", "type": "bool"}],
            }
        ]
        token_contract = w3.eth.contract(
            address=Web3.to_checksum_address(token_in["address"]),
            abi=erc20_abi,
        )
        approve_tx = token_contract.functions.approve(
            Web3.to_checksum_address(approve_data),
            int(amount),
        ).build_transaction({
            "from": wallet_address,
            "nonce": w3.eth.get_transaction_count(wallet_address),
            "gas": 100000,
        })
        signed_approve = w3.eth.account.sign_transaction(approve_tx, private_key)
        approve_hash = w3.eth.send_raw_transaction(signed_approve.raw_transaction)
        w3.eth.wait_for_transaction_receipt(approve_hash)
        print(f"Approved: {approve_hash.hex()}")

    # Step 3: Execute swap transaction
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    tx = {
        "from": wallet_address,
        "to": Web3.to_checksum_address(tx_data["to"]),
        "data": tx_data["data"],
        "value": int(tx_data.get("value", "0"), 16)
        if isinstance(tx_data.get("value"), str)
        else int(tx_data.get("value", 0)),
        "nonce": w3.eth.get_transaction_count(wallet_address),
        "gas": int(tx_data.get("gas", 300000)),
        "chainId": token_in["chainId"],
    }

    signed_tx = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    print(f"Swap submitted: {tx_hash.hex()}")

    # Step 4: Wait for source chain confirmation
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"Source chain confirmed: block {receipt.blockNumber}")

    return tx_hash.hex()


def track_cross_chain(tx_hash: str) -> dict:
    """Track cross-chain swap completion."""
    response = requests.get(
        f"{SYMBIOSIS_API}/tx/{tx_hash}"
    )
    if response.status_code == 200:
        return response.json()
    return {"status": "pending"}
```

## Common Chains and Tokens

| Chain | Chain ID | Native Token | USDC Address |
|-------|----------|-------------|--------------|
| **Base** | 8453 | ETH (`0x000...000`) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| **Ethereum** | 1 | ETH (`0x000...000`) | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| **Polygon** | 137 | MATIC (`0x000...000`) | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| **Arbitrum** | 42161 | ETH (`0x000...000`) | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| **Optimism** | 10 | ETH (`0x000...000`) | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| **BNB Chain** | 56 | BNB (`0x000...000`) | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| **Avalanche** | 43114 | AVAX (`0x000...000`) | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` |

Native token address: `0x0000000000000000000000000000000000000000`

## Workflow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Quote   │────>│ Approve  │────>│   Swap   │────>│  Track   │
│          │     │(ERC-20)  │     │          │     │          │
│ GET /swap│     │on-chain  │     │ sign+send│     │GET /tx/  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Step-by-Step

1. **Quote**: POST to `/crosschain/v1/swap` with token details and amount
2. **Approve**: If input is ERC-20, approve the `approveTo` address for the input amount
3. **Swap**: Sign and send the `tx` object returned by the quote
4. **Track**: Poll `/crosschain/v1/tx/{hash}` until status is `"completed"`

## Bankr Submit API Integration

For agent-based execution, submit swaps via Bankr:

```typescript
async function submitSwapViaBankr(params: {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  slippage?: number;
}) {
  const response = await fetch("https://bankr.bot/api/v1/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BANKR_API_KEY}`,
    },
    body: JSON.stringify({
      type: "cross-chain-swap",
      protocol: "symbiosis",
      params: {
        source_chain: params.fromChain,
        destination_chain: params.toChain,
        input_token: params.fromToken,
        output_token: params.toToken,
        amount: params.amount,
        slippage: params.slippage ?? 300,
      },
    }),
  });
  return response.json();
}

// Example: Swap 100 USDC from Base to Polygon
await submitSwapViaBankr({
  fromChain: "base",
  toChain: "polygon",
  fromToken: "USDC",
  toToken: "USDC",
  amount: "100",
  slippage: 100, // 1%
});
```

## Slippage Configuration

| Setting | Value | Use Case |
|---------|-------|----------|
| Tight | 50 (0.5%) | Stablecoin-to-stablecoin |
| Normal | 300 (3%) | Standard swaps |
| Loose | 500 (5%) | Volatile tokens, low liquidity |
| Max | 1000 (10%) | Emergency, very low liquidity |

Slippage is in basis points: `300` = 3%.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `INSUFFICIENT_LIQUIDITY` | Not enough liquidity on route | Try smaller amount or different route |
| `SLIPPAGE_TOO_LOW` | Price moved beyond slippage | Increase slippage tolerance |
| `AMOUNT_TOO_LOW` | Below minimum swap amount | Increase input amount |
| `UNSUPPORTED_PAIR` | No route exists | Check supported chains/tokens |
| `APPROVAL_FAILED` | Token approval rejected | Check allowance and gas |

## References

- Symbiosis Docs: https://docs.symbiosis.finance/
- API Reference: https://api-v2.symbiosis.finance/crosschain/v1/docs
- Supported Chains: https://docs.symbiosis.finance/supported-chains
