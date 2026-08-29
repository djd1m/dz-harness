---
name: "hydrex"
description: "Liquidity governance on Base — lock HYDX for veHYDX, vote on pool strategies, earn yield."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Hydrex — Liquidity Governance on Base

Hydrex is a liquidity governance protocol on Base. Lock HYDX tokens for veHYDX voting power, vote on pool strategies, provide single-sided liquidity through ICHI vaults, and earn yield through oHYDX options.

## When to Use

- Use this skill for **ve(3,3) liquidity governance on Base** specifically — locking HYDX into veHYDX, allocating epoch votes in basis points, and optimizing emissions/incentive (bribe) capture. Not for generic ERC-20 transfers or cross-chain bridging.
- Reach for it when the task is **vote allocation or reward optimization** — computing a 10,000 bp split across pools, scoring pools by APY/TVL/fees/incentives, or claiming and exercising oHYDX options at a discount.
- Use it for **single-sided LP via ICHI vaults** on Hydrex (no impermanent-loss management), distinct from manual concentrated-liquidity range setting on a raw DEX skill.
- Prefer a **generic swap/wallet skill** instead when you only need a token swap, balance read, or price quote — Hydrex's value is the governance, epoch, and emissions layer, not routing trades.
- Pick a **different chain's protocol skill** if the target is not Base — Hydrex deploys only on Base. The canonical programmatic interface is the official TypeScript SDK [`@hydrexfi/hydrex-sdk`](https://www.npmjs.com/package/@hydrexfi/hydrex-sdk); resolve live contract addresses through it rather than hardcoding.

---

## Core Capabilities

### Lock HYDX for veHYDX

Lock HYDX tokens to receive vote-escrowed veHYDX. Longer lock periods yield more voting power.

```
Lock Amount × Lock Duration (weeks) / Max Duration (208 weeks) = veHYDX Balance
```

Lock parameters:
- **Minimum lock**: 1 week
- **Maximum lock**: 208 weeks (4 years)
- **Lock extensions**: Can extend an existing lock's duration
- **Increase amount**: Can add more HYDX to an existing lock

### Vote on Pool Strategies

veHYDX holders vote on how liquidity incentives are distributed across pools. Votes are cast in **basis points** (1 bp = 0.01%).

```
Total votes per epoch: 10,000 basis points (100%)
```

Vote allocation determines the share of HYDX emissions each pool receives for the next epoch.

### Single-Sided Liquidity via ICHI Vaults

Deposit a single token into ICHI-managed vaults. The vault automatically manages the LP position, rebalances, and concentrates liquidity.

Benefits:
- No impermanent loss management required
- Automated rebalancing
- Concentrated liquidity for higher capital efficiency

### Claim and Exercise oHYDX

Voters earn oHYDX (option HYDX) as rewards. oHYDX can be exercised at a discount to acquire HYDX:

```
Exercise Price = Market Price × (1 - Discount)
Discount is determined by protocol governance (typically 50-90%)
```

---

## Contract Addresses (Base, chain ID 8453)

> Addresses below are taken from the official `@hydrexfi/hydrex-sdk` (v1.2.8) and BaseScan. Always reconfirm against the SDK's exported address maps or BaseScan before broadcasting — protocol deployments can be upgraded. Entries marked **TODO** are not exposed by the SDK and were NOT verified against a canonical source; resolve them from the SDK / docs.hydrex.fi before use.

| Contract | Address | Source |
|----------|---------|--------|
| **HYDX Token** | `0x00000e7efa313F4E11Bfff432471eD9423AC6B30` | BaseScan (name "Hydrex", symbol "HYDX") |
| **veHYDX (VE_TOKEN)** | `0x25B2ED7149fb8A05f6eF9407d9c8F878f59cd1e1` | hydrex-sdk `VE_TOKEN_ADDRESSES` |
| **veHYDX Lens** | `0xF4d3fCA00640F5bEb7480AA113ED7B0C2c366866` | hydrex-sdk `VE_TOKEN_LENS_ADDRESSES` |
| **Voter** | `0xc69E3eF39E3fFBcE2A1c570f8d3ADF76909ef17b` | hydrex-sdk `VOTER_ADDRESSES` |
| **Swap Router** | `0x6f4bE24d7dC93b6ffcBAb3Fd0747c5817Cea3F9e` | hydrex-sdk `SWAP_ROUTER_ADDRESSES` |
| **ICHI Vault Deposit Guard** | `0x9A0EBEc47c85fD30F1fdc90F57d2b178e84DC8d8` | hydrex-sdk `ICHI_VAULT_DEPOSIT_GUARD_ADDRESSES` |
| **ICHI Vault Deployer** | `0x7d11De61c219b70428Bb3199F0DD88bA9E76bfEE` | hydrex-sdk `ICHI_VAULT_DEPLOYER_ADDRESSES` |
| **Minter** | TODO: unverified — not exposed by the SDK; resolve via docs.hydrex.fi before use | — |
| **oHYDX** | TODO: unverified — not exposed by the SDK; resolve via docs.hydrex.fi before use | — |
| **Rewards Distributor** | TODO: unverified — not exposed by the SDK; resolve via docs.hydrex.fi before use | — |

---

## Voting System

### Casting Votes

Votes are cast per epoch in basis points:

```json
{
  "votes": [
    { "pool": "0xPoolA...", "weight": 4000 },
    { "pool": "0xPoolB...", "weight": 3500 },
    { "pool": "0xPoolC...", "weight": 2500 }
  ]
}
```

Total weight must equal exactly **10,000** (100%).

### Optimization Strategies

| Strategy | Description |
|----------|-------------|
| **Yield Maximizer** | Allocate votes to pools with highest base APY + boost |
| **TVL Growth** | Vote for pools that attract the most new liquidity |
| **Fee Revenue** | Prioritize pools generating the highest swap fee revenue |
| **Diversified** | Spread votes across pools to minimize concentration risk |
| **Mercenary** | Vote for pools offering the highest vote incentives (bribes) |

### Vote Incentives

Third-party protocols can place incentives (bribes) on specific pools to attract veHYDX votes. Voters who allocate to incentivized pools receive a proportional share of the incentive.

---

## Epoch System

| Property | Value |
|----------|-------|
| **Duration** | 1 week (7 days) |
| **Flip time** | Thursday 00:00 UTC |
| **Vote deadline** | Wednesday 23:59 UTC (before epoch flip) |
| **Emission distribution** | Applied at epoch start based on prior epoch votes |
| **Reward claiming** | Available after each epoch flip |

### Epoch Timeline

```
Mon  Tue  Wed  Thu  Fri  Sat  Sun
│    │    │    │    │    │    │
│◄── Vote window ──►│◄── New epoch ──────►│
                    ▲
                Epoch flip
              (Thu 00:00 UTC)
```

---

## Earning Power

veHYDX provides a **1.3x earning power multiplier** on liquidity provision:

```
Effective APY = Base APY × 1.3 (for veHYDX holders)
```

This applies to all pools where the veHYDX holder also provides liquidity. Non-holders earn the base APY only.

---

## Pool Data

> **No public REST endpoint is documented for Hydrex.** The `api.hydrex.finance` host previously listed here does not resolve (NXDOMAIN). Read pool/epoch/vote data through the official [`@hydrexfi/hydrex-sdk`](https://www.npmjs.com/package/@hydrexfi/hydrex-sdk) (on-chain reads + lens helpers) or directly from the Voter / veHYDX-Lens contracts above. If Hydrex later publishes a REST API, verify the host before documenting it. The JSON shape below illustrates the *fields* a pool record exposes; it is not a live endpoint contract.

```json
{
  "pools": [
    {
      "address": "0xPoolA...",
      "token0": { "symbol": "WETH", "address": "0x..." },
      "token1": { "symbol": "USDC", "address": "0x..." },
      "tvl": "12500000.00",
      "baseApy": 8.5,
      "boostedApy": 11.05,
      "volume24h": "3200000.00",
      "fees24h": "9600.00",
      "voteWeight": 2500,
      "incentives": [
        { "token": "ARB", "amountPerEpoch": "10000", "valueUsd": 12000 }
      ]
    }
  ]
}
```

---

## Optimization Formula

For automated vote allocation, use the reward-maximizing formula:

```
Score(pool) = (baseApy × tvlWeight) + (incentiveValueUsd / totalVeHydxVoting × myVeHydx) + (feeRevenue24h × feeWeight)
```

Where:
- `tvlWeight`: User-defined weight for base yield (default: 0.4)
- `feeWeight`: User-defined weight for fee revenue (default: 0.3)
- Remaining weight (0.3) goes to incentive value
- Normalize scores across all pools to get basis point allocation summing to 10,000

---

## Gotchas

- **Votes must sum to exactly 10,000 bp.** After normalizing scores into basis points, rounding can leave you at 9,999 or 10,001 — the Voter contract rejects anything not equal to 10,000. Assign the rounding remainder to the highest-weighted pool before submitting.
- **The epoch deadline is hard.** Votes for the next epoch must land before the flip at **Thursday 00:00 UTC** (deadline Wed 23:59 UTC). A vote submitted after the flip applies to the *following* epoch, not the current one, so late automation silently misses an emissions cycle.
- **veHYDX voting power is time-decaying and lock-bound.** Power is `lock amount × remaining duration / 208 weeks`; it shrinks as the lock nears expiry. Re-read the live veHYDX balance from the contract before each epoch rather than reusing a cached value, or your bp allocation will be scaled against stale power.
- **oHYDX is an option, not free HYDX.** Exercising requires paying `Market Price × (1 − discount)`; if HYDX's market price drops below the strike, exercising is unprofitable. The discount is governance-set (typically 50–90%) and can change between epochs — quote it fresh before exercising.
- **Off-chain indexed pool data can lag the chain.** `tvl`, `*Apy`, `volume24h`, and `incentives` surfaced by any indexer or the SDK's read helpers can lag the chain near an epoch flip. For settlement-critical decisions confirm `voteWeight` and incentive amounts against the on-chain Voter contract rather than trusting an indexed snapshot.
