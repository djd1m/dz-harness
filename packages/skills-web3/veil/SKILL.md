---
name: "veil"
description: "Privacy-preserving ZK transactions on Base — deposit, withdraw, transfer with zero-knowledge proofs."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Veil — Privacy-Preserving ZK Transactions on Base

Privacy-preserving transactions on Base using zero-knowledge proofs. Deposit, withdraw, and transfer ETH and USDC without revealing sender, receiver, or amount on-chain.

> **Canonical tool.** This skill targets **Veil Cash** ([veil.cash](https://veil.cash), docs at [docs.veil.cash](https://docs.veil.cash)) — a UTXO/Groth16 shielded pool for ETH and USDC on Base. The official integration is the npm package **`@veil-cash/sdk`** (published by `veildotcash`), which ships a CLI binary named **`veil`** and functional SDK exports. The default relay host is `https://veil-relay.up.railway.app` (override with `RELAY_URL`). The `VeilClient` class shown in the examples below is **illustrative pseudocode** for the deposit/withdraw/transfer lifecycle, not the literal SDK surface — for the real CLI commands (`veil init/register/deposit/withdraw/transfer/merge`) and function signatures (`withdraw()`, `transfer()`, `getAddresses()`, `payX402Resource()`, …) see the SDK's bundled `skills/veil/SKILL.md`, `SDK.md`, and [npmjs.com/package/@veil-cash/sdk](https://www.npmjs.com/package/@veil-cash/sdk).

## Overview

Veil provides a shielded transaction pool on Base. Funds enter the pool via deposits and exit via withdrawals. Within the pool, transfers are completely private — only the sender and receiver know the details.

## When to Use

- Reach for **Veil** when the goal is **privacy** — breaking the on-chain link between sender, receiver, and amount for ETH or USDC on **Base**. This is the only skill here that does ZK-shielded deposit/withdraw/transfer.
- Use it for **private transfers between shielded addresses** (`veil:base:0x…`), not for ordinary public wallet sends — for plain transfers or balance checks, use a wallet/RPC skill instead.
- Choose Veil when you need to **deposit public funds into an anonymity set** and later **withdraw to an unlinkable public address** (optionally gas-free via the Veil relay, default `https://veil-relay.up.railway.app`).
- Use it for **agent-driven private deposits** via an external signer (e.g. Bankr's signing endpoint), or **direct deposits** with your own signer when you don't want a third-party relayer. (Veil Cash also screens deposits for compliance before they enter the pool — see docs.veil.cash.)
- Do **not** use Veil for token swaps, bridging, or non-Base chains — it only supports ETH and USDC on Base, and only moves funds in/out of its own shielded pool.

### Supported Assets

| Asset | Address (Base) | Decimals | Min Deposit |
|-------|---------------|----------|-------------|
| **ETH** | Native (via WETH `0x4200000000000000000000000000000000000006`) | 18 | 0.001 ETH |
| **USDC** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 | 1 USDC |

### Protocol Contracts (Base, chain ID 8453)

> From the `@veil-cash/sdk` `ADDRESSES` export (v0.7.0). Reconfirm against the SDK before sending — deployments can be upgraded.

| Component | Address |
|-----------|---------|
| **Entry** | `0xc2535c547B64b997A4BD9202E1663deaF11c78a5` |
| **ETH Pool** | `0x293dCda114533FF8f477271c5cA517209FFDEEe7` |
| **ETH Queue** | `0xA4a926A2E7a22c38e8DFC6744A61a6aA8b06B230` |
| **USDC Pool** | `0x5c50d58E49C59d112680c187De2Bf989d2a91242` |
| **USDC Queue** | `0x5530241b24504bF05C9a22e95A1F5458888e6a9B` |
| **Subaccount Forwarder Factory** | `0x2848Fd62293A1ff3b4a897E9FcD0e5962dcc8101` |

### Key Concepts

- **Shielded address** — Your private Veil address (not linked to your public address)
- **UTXO** — Unspent Transaction Output; each deposit/transfer creates UTXOs
- **Keypair** — Ed25519 keypair for signing shielded transactions
- **Nullifier** — Proof that a UTXO has been spent (without revealing which one)

## File Locations

| File | Path | Description |
|------|------|-------------|
| Config | `~/.veil/config.json` | RPC URL, chain settings |
| Keypair | `~/.veil/keypair.json` | Shielded keypair (KEEP SECRET) |
| State | `~/.veil/state.db` | Local UTXO state |

## Quick Start (11 Steps)

### Step 1: Install Veil Cash SDK + CLI

```bash
npm install @veil-cash/sdk      # ships the `veil` CLI binary
# or for global CLI access:
npm install -g @veil-cash/sdk
```

> Do **not** install `@veil-protocol/sdk` — that is an unrelated **Solana** privacy SDK, not the Veil Cash Base shielded pool. The correct package is `@veil-cash/sdk`.

### Step 2: Configure RPC

```typescript
// Illustrative client wrapping the @veil-cash/sdk functional exports.
// The real SDK is function-based (withdraw, transfer, getAddresses, …) + the `veil` CLI;
// see the SDK's SDK.md for exact signatures.
import { VeilClient } from "@veil-cash/sdk"; // illustrative — see note above

const veil = new VeilClient({
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
  chain: "base", // Base mainnet, chain ID 8453
  // Optional: override the default relay (gas-free withdrawals).
  // Default relay host: https://veil-relay.up.railway.app
  relayerUrl: process.env.RELAY_URL || "https://veil-relay.up.railway.app",
});
```

### Step 3: Generate Keypair

```typescript
// Generate a new shielded keypair
const keypair = await veil.generateKeypair();

// Save securely — this is your shielded identity
console.log("Shielded address:", keypair.address);
console.log("Public key:", keypair.publicKey);
// NEVER share: keypair.privateKey

// Save to file
import fs from "fs";
fs.writeFileSync(
  `${process.env.HOME}/.veil/keypair.json`,
  JSON.stringify({
    address: keypair.address,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey, // encrypted at rest
  }),
  { mode: 0o600 }
);
```

### Step 4: Check Protocol Status

```typescript
const status = await veil.getProtocolStatus();
console.log(`Pool TVL: $${status.tvl}`);
console.log(`Total deposits: ${status.totalDeposits}`);
console.log(`Anonymity set size: ${status.anonymitySetSize}`);
console.log(`Relayer active: ${status.relayerActive}`);
```

### Step 5: Find Your Shielded Address

```typescript
// Load existing keypair
const keypairData = JSON.parse(
  fs.readFileSync(`${process.env.HOME}/.veil/keypair.json`, "utf-8")
);

const keypair = await veil.loadKeypair(keypairData);
console.log("Your shielded address:", keypair.address);

// Share this address to receive private transfers
// Format: veil:base:0x<64-char-hex>
```

### Step 6: Check Shielded Balances

```typescript
const balances = await veil.getBalances(keypair);

console.log("Shielded balances:");
console.log(`  ETH:  ${balances.ETH.available} (${balances.ETH.pending} pending)`);
console.log(`  USDC: ${balances.USDC.available} (${balances.USDC.pending} pending)`);

// List individual UTXOs
const utxos = await veil.getUTXOs(keypair);
for (const utxo of utxos) {
  console.log(
    `  UTXO ${utxo.id}: ${utxo.amount} ${utxo.asset} (${utxo.status})`
  );
}
```

### Step 7: Deposit via Bankr

For agent-based deposits, use the Bankr Submit API:

```typescript
async function depositViaBankr(params: {
  asset: "ETH" | "USDC";
  amount: string;
  shieldedAddress: string;
}) {
  const response = await fetch("https://bankr.bot/api/v1/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BANKR_API_KEY}`,
    },
    body: JSON.stringify({
      type: "veil-deposit",
      params: {
        asset: params.asset,
        amount: params.amount,
        shielded_address: params.shieldedAddress,
        chain: "base",
      },
    }),
  });
  return response.json();
}

// Deposit 0.1 ETH
await depositViaBankr({
  asset: "ETH",
  amount: "0.1",
  shieldedAddress: keypair.address,
});
```

### Direct Deposit (without Bankr)

```typescript
import { ethers } from "ethers";

// Deposit ETH
async function depositETH(amount: string, keypair: any) {
  const tx = await veil.deposit({
    asset: "ETH",
    amount: ethers.parseEther(amount),
    shieldedAddress: keypair.address,
    // Signer for the public transaction
    signer: new ethers.Wallet(
      process.env.WALLET_PRIVATE_KEY!,
      new ethers.JsonRpcProvider(process.env.BASE_RPC_URL)
    ),
  });

  console.log(`Deposit TX: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`Note: funds visible in ~2 minutes after ZK proof generation`);
  return tx.hash;
}

// Deposit USDC (requires approval first)
async function depositUSDC(amount: string, keypair: any) {
  const signer = new ethers.Wallet(
    process.env.WALLET_PRIVATE_KEY!,
    new ethers.JsonRpcProvider(process.env.BASE_RPC_URL)
  );

  // Approve USDC spending
  await veil.approveToken({
    asset: "USDC",
    amount: ethers.parseUnits(amount, 6),
    signer,
  });

  // Deposit
  const tx = await veil.deposit({
    asset: "USDC",
    amount: ethers.parseUnits(amount, 6),
    shieldedAddress: keypair.address,
    signer,
  });

  return tx.hash;
}
```

### Step 8: Withdraw

```typescript
async function withdraw(params: {
  asset: "ETH" | "USDC";
  amount: string;
  recipientAddress: string; // Public address to receive funds
  keypair: any;
}) {
  // Generate ZK proof (this takes 5-30 seconds)
  console.log("Generating ZK proof...");

  const tx = await veil.withdraw({
    asset: params.asset,
    amount:
      params.asset === "ETH"
        ? ethers.parseEther(params.amount)
        : ethers.parseUnits(params.amount, 6),
    recipient: params.recipientAddress,
    keypair: params.keypair,
    // Use relayer for gas-free withdrawal (recipient pays no gas)
    useRelayer: true,
  });

  console.log(`Withdrawal TX: ${tx.hash}`);
  console.log(`Funds will arrive at ${params.recipientAddress}`);
  return tx.hash;
}

// Withdraw 0.05 ETH to a public address
await withdraw({
  asset: "ETH",
  amount: "0.05",
  recipientAddress: "0xRecipientPublicAddress",
  keypair,
});
```

### Step 9: Private Transfer

```typescript
async function transfer(params: {
  asset: "ETH" | "USDC";
  amount: string;
  toShieldedAddress: string; // Recipient's veil address
  keypair: any;
}) {
  console.log("Generating ZK proof for transfer...");

  const tx = await veil.transfer({
    asset: params.asset,
    amount:
      params.asset === "ETH"
        ? ethers.parseEther(params.amount)
        : ethers.parseUnits(params.amount, 6),
    to: params.toShieldedAddress,
    keypair: params.keypair,
  });

  console.log(`Transfer complete: ${tx.id}`);
  console.log(`Neither sender, receiver, nor amount is visible on-chain`);
  return tx.id;
}

// Send 10 USDC privately
await transfer({
  asset: "USDC",
  amount: "10",
  toShieldedAddress: "veil:base:0xRecipientShieldedAddress",
  keypair,
});
```

### Step 10: Merge UTXOs

Over time, many small UTXOs accumulate. Merge them for efficiency:

```typescript
async function mergeUTXOs(asset: "ETH" | "USDC", keypair: any) {
  const utxos = await veil.getUTXOs(keypair, { asset, status: "available" });

  if (utxos.length <= 1) {
    console.log("No merge needed — 0 or 1 UTXOs");
    return;
  }

  console.log(`Merging ${utxos.length} ${asset} UTXOs...`);

  const tx = await veil.merge({
    asset,
    keypair,
    // Merge all available UTXOs into one
    maxUtxos: 16, // Max UTXOs per merge (protocol limit)
  });

  console.log(`Merged into 1 UTXO: ${tx.id}`);
}
```

### Step 11: Full Lifecycle Example

```typescript
import { VeilClient } from "@veil-cash/sdk"; // illustrative wrapper — see note at top of skill
import { ethers } from "ethers";
import fs from "fs";

async function main() {
  // Initialize
  const veil = new VeilClient({
    rpcUrl: "https://mainnet.base.org",
    chain: "base",
  });

  // Load or create keypair
  const keypairPath = `${process.env.HOME}/.veil/keypair.json`;
  let keypair;
  if (fs.existsSync(keypairPath)) {
    keypair = await veil.loadKeypair(
      JSON.parse(fs.readFileSync(keypairPath, "utf-8"))
    );
  } else {
    keypair = await veil.generateKeypair();
    fs.mkdirSync(`${process.env.HOME}/.veil`, { recursive: true });
    fs.writeFileSync(keypairPath, JSON.stringify(keypair), { mode: 0o600 });
  }

  console.log("Shielded address:", keypair.address);

  // Check balances
  const balances = await veil.getBalances(keypair);
  console.log("Balances:", balances);

  // Deposit 0.01 ETH
  const signer = new ethers.Wallet(
    process.env.WALLET_PRIVATE_KEY!,
    new ethers.JsonRpcProvider("https://mainnet.base.org")
  );
  const depositTx = await veil.deposit({
    asset: "ETH",
    amount: ethers.parseEther("0.01"),
    shieldedAddress: keypair.address,
    signer,
  });
  console.log("Deposited:", depositTx.hash);

  // Wait for confirmation
  await depositTx.wait();
  await new Promise((r) => setTimeout(r, 120000)); // Wait for ZK proof

  // Transfer privately
  const transferTx = await veil.transfer({
    asset: "ETH",
    amount: ethers.parseEther("0.005"),
    to: "veil:base:0xRecipientShieldedAddress",
    keypair,
  });
  console.log("Transferred:", transferTx.id);

  // Withdraw remainder
  const withdrawTx = await veil.withdraw({
    asset: "ETH",
    amount: ethers.parseEther("0.004"),
    recipient: "0xPublicRecipient",
    keypair,
    useRelayer: true,
  });
  console.log("Withdrawn:", withdrawTx.hash);
}

main().catch(console.error);
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Insufficient shielded balance" | UTXOs not yet confirmed | Wait 2-5 min after deposit |
| "Proof generation failed" | Corrupted state | Delete `~/.veil/state.db` and resync |
| "Relayer unavailable" | Relayer down | Set `useRelayer: false` and pay gas directly |
| "UTXO already spent" | State out of sync | Run `veil.resync(keypair)` |
| "Amount too small" | Below minimum | ETH min: 0.001, USDC min: 1 |

## References

- Veil Cash: https://veil.cash
- Docs: https://docs.veil.cash
- SDK + CLI (npm): https://www.npmjs.com/package/@veil-cash/sdk
- SDK source: https://github.com/veildotcash/veildotcash-sdk
- Default relay host: https://veil-relay.up.railway.app
- Base Network: https://base.org/
