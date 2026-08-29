---
name: "erc-8004"
description: "On-chain AI agent identity registry — ERC-721 based agent IDs (ERC-8004), with separate reputation and validation registries."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# ERC-8004 — On-Chain AI Agent Identity Registry

ERC-721-based on-chain identity registry for AI agents (ERC-8004). Register your agent on the Identity Registry, and post/fetch feedback through the separate Reputation and Validation registries. (ERC-8004 has no cross-chain bridge — registries are per-chain.)

## Overview

ERC-8004 defines a standardized identity layer for AI agents on-chain. Per the spec ([eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)) it has **three registries**:

- **Identity Registry** — a minimal ERC-721 handle per agent: a unique token ID + an agent URI pointing to the agent profile (IPFS, HTTP, or data URI).
- **Reputation Registry** — a separate interface for posting and fetching feedback signals about agents (not a `reputation()` method on the Identity Registry).
- **Validation Registry** — hooks for requesting and recording independent validator checks.

> **The spec defines NO `bridge()` and NO cross-chain identity transfer.** Identities are per-chain singletons; "moving" an agent between chains is out of scope of ERC-8004. Earlier versions of this skill documented a `bridge()` flow — that was not part of the standard and has been removed.

## When to Use

- Use this skill when you need to **register, query, or update an AI agent's on-chain identity** via the ERC-8004 Identity Registry (an ERC-721 NFT per agent) — not for generic token transfers, swaps, or wallet balance lookups.
- Reach for it when an agent needs a **verifiable on-chain identity with reputation/validation signals** on Base, Ethereum, Optimism, or Arbitrum (e.g. publishing an agent profile or proving authorship). Identity is per-chain — register separately on each chain you need, since ERC-8004 has no cross-chain transfer.
- Pick it over plain ERC-721/wallet skills when you specifically want the **agent metadata schema** (capabilities, model, supported protocols, autonomy level) carried on the Identity Registry NFT.
- Best for **Base-first deployments** — gas is low (~$0.01). Note: ERC-8004 does not mandate a canonical address and there is **no official cross-chain deployment**; resolve the registry address per chain from the spec's reference deployment for that chain (see Contract Addresses).
- Not the right tool for off-chain agent directories, A2A messaging, or DeFi position management — use a dedicated swap/DeFi skill for those.

## Contract Addresses

> **TODO: unverified — no canonical deployment found.** ERC-8004 does not specify a fixed registry address, and the address previously listed here (`0x8004e7A4CfC39b8D02C4C53B0bC42C2A13df56CB`) has **no contract bytecode on Base mainnet** (`eth_getCode` returns `0x`). Do not send transactions to it. Before using this skill, look up the Identity/Reputation/Validation Registry deployment for your target chain from the ERC-8004 reference deployment or the deployer you trust, and confirm with `cast code <addr> --rpc-url <rpc>` that bytecode exists. The registries are per-chain singletons and the address is **not** guaranteed to match across chains.

| Network | Identity Registry Address | Status |
|---------|---------------------------|--------|
| **Base Mainnet** | TODO: verify per ERC-8004 reference deployment | unverified |
| **Base Sepolia** | TODO: verify per ERC-8004 reference deployment | unverified |
| **Ethereum Mainnet** | TODO: verify per ERC-8004 reference deployment | unverified |
| **Optimism** | TODO: verify per ERC-8004 reference deployment | unverified |

## Quick Start

### Register an Agent

```bash
#!/usr/bin/env bash
# register-agent.sh — Register a new AI agent identity on-chain
#
# Usage: ./register-agent.sh <chain> <metadata-uri>

set -euo pipefail

CHAIN="${1:?Usage: register-agent.sh <chain> <metadata-uri>}"
METADATA_URI="${2:?Usage: register-agent.sh <chain> <metadata-uri>}"

declare -A CONTRACT_ADDR=(
  # TODO: set the verified Identity Registry address for each chain (see Contract Addresses).
  # No canonical ERC-8004 deployment is published; supply via REGISTRY_<CHAIN> env vars.
  ["base"]="${REGISTRY_BASE:?Set REGISTRY_BASE to the verified ERC-8004 registry on Base}"
  ["base-sepolia"]="${REGISTRY_BASE_SEPOLIA:?Set REGISTRY_BASE_SEPOLIA}"
  ["ethereum"]="${REGISTRY_ETHEREUM:?Set REGISTRY_ETHEREUM}"
  ["optimism"]="${REGISTRY_OPTIMISM:?Set REGISTRY_OPTIMISM}"
)

declare -A RPC_URL=(
  ["base"]="https://mainnet.base.org"
  ["base-sepolia"]="https://sepolia.base.org"
  ["ethereum"]="https://eth.llamarpc.com"
  ["optimism"]="https://mainnet.optimism.io"
)

CONTRACT="${CONTRACT_ADDR[$CHAIN]:?Unsupported chain: $CHAIN}"
RPC="${RPC_URL[$CHAIN]}"

echo "Registering agent on ${CHAIN}..."
echo "Contract: ${CONTRACT}"
echo "Metadata: ${METADATA_URI}"

# register(string metadataURI) — mints a new agent NFT
TX_HASH=$(cast send "$CONTRACT" \
  "register(string)" "$METADATA_URI" \
  --rpc-url "$RPC" \
  --private-key "${PRIVATE_KEY:?Set PRIVATE_KEY env var}" \
  --json | jq -r '.transactionHash')

echo "Registration TX: ${TX_HASH}"

# Get the minted token ID from the Transfer event
RECEIPT=$(cast receipt "$TX_HASH" --rpc-url "$RPC" --json)
TOKEN_ID=$(echo "$RECEIPT" | jq -r '.logs[0].topics[3]' | cast to-dec)

echo "Agent Token ID: ${TOKEN_ID}"
echo "View: https://basescan.org/token/${CONTRACT}?a=${TOKEN_ID}"
```

### Update Agent Metadata

```bash
#!/usr/bin/env bash
# update-agent.sh — Update agent metadata URI
#
# Usage: ./update-agent.sh <chain> <token-id> <new-metadata-uri>

set -euo pipefail

CHAIN="${1:?Usage: update-agent.sh <chain> <token-id> <new-metadata-uri>}"
TOKEN_ID="${2:?Usage: update-agent.sh <chain> <token-id> <new-metadata-uri>}"
NEW_URI="${3:?Usage: update-agent.sh <chain> <token-id> <new-metadata-uri>}"

# TODO: no canonical ERC-8004 deployment — supply the verified registry address (see Contract Addresses).
CONTRACT="${REGISTRY_ADDRESS:?Set REGISTRY_ADDRESS to the verified ERC-8004 registry for this chain}"

declare -A RPC_URL=(
  ["base"]="https://mainnet.base.org"
  ["ethereum"]="https://eth.llamarpc.com"
  ["optimism"]="https://mainnet.optimism.io"
)

RPC="${RPC_URL[$CHAIN]}"

echo "Updating agent #${TOKEN_ID} metadata on ${CHAIN}..."

# updateMetadata(uint256 tokenId, string metadataURI)
cast send "$CONTRACT" \
  "updateMetadata(uint256,string)" "$TOKEN_ID" "$NEW_URI" \
  --rpc-url "$RPC" \
  --private-key "${PRIVATE_KEY:?Set PRIVATE_KEY env var}"

echo "Metadata updated for agent #${TOKEN_ID}."
```

## Registration JSON Format

Agent metadata follows this schema:

```json
{
  "name": "MyAgent",
  "description": "An AI agent that monitors DeFi positions and executes rebalancing strategies.",
  "version": "1.0.0",
  "image": "ipfs://QmAgentAvatarHash",
  "external_url": "https://myagent.example.com",
  "attributes": [
    {
      "trait_type": "agent_type",
      "value": "defi-monitor"
    },
    {
      "trait_type": "model",
      "value": "claude-opus-4-20250514"
    },
    {
      "trait_type": "capabilities",
      "value": ["portfolio-tracking", "rebalancing", "alerts"]
    },
    {
      "trait_type": "chains",
      "value": ["base", "ethereum", "arbitrum"]
    },
    {
      "trait_type": "creator",
      "value": "0xYourAddress"
    },
    {
      "trait_type": "contact",
      "value": "agent@example.com"
    }
  ],
  "properties": {
    "api_endpoint": "https://myagent.example.com/api",
    "supported_protocols": ["aave", "uniswap", "compound"],
    "risk_level": "medium",
    "autonomy_level": "supervised"
  }
}
```

## Registration Workflow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ Bridge ETH  │────>│ Create JSON  │────>│ Upload to   │────>│  Register    │
│ to Base     │     │ Profile      │     │ IPFS        │     │  On-Chain    │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
```

### Step-by-Step

1. **Bridge ETH to Base** — Ensure you have ETH on Base for gas (~$0.01)
2. **Create agent profile** — JSON metadata describing your agent
3. **Upload to IPFS** — Pin the JSON to IPFS (Pinata, web3.storage, etc.)
4. **Register on-chain** — Call `register(string metadataURI)` with the IPFS URI

```typescript
import { ethers } from "ethers";

// ERC-8004 Identity Registry (per the spec, the URI setter is setAgentURI; some
// deployments expose an updateMetadata alias). There is no bridge()/reputation()
// on the Identity Registry — reputation/validation are separate registry contracts.
const ERC8004_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "function ownerOf(uint256 agentId) external view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

async function registerAgent(
  metadataUri: string,
  signer: ethers.Signer
): Promise<{ tokenId: string; txHash: string }> {
  // TODO: supply the verified Identity Registry address (see Contract Addresses).
  const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS!;
  const contract = new ethers.Contract(
    REGISTRY_ADDRESS,
    ERC8004_ABI,
    signer
  );

  const tx = await contract.register(metadataUri);
  const receipt = await tx.wait();

  // Extract token ID from Transfer event
  const transferEvent = receipt.logs.find(
    (log: any) => log.topics[0] === ethers.id("Transfer(address,address,uint256)")
  );
  const tokenId = BigInt(transferEvent.topics[3]).toString();

  return { tokenId, txHash: receipt.hash };
}
```

## Registration Options

| Method | URI Format | Pros | Cons |
|--------|-----------|------|------|
| **8004.org** | `https://8004.org/agent/{id}` | Managed hosting, easy | Centralized |
| **HTTP** | `https://mysite.com/agent.json` | Full control | Mutable, needs uptime |
| **IPFS** | `ipfs://QmHash` | Immutable, decentralized | Needs pinning |
| **Data URI** | `data:application/json;base64,...` | Fully on-chain | Size limits, expensive |

### IPFS Upload Example

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
});

async function uploadMetadata(metadata: object): Promise<string> {
  const blob = new Blob([JSON.stringify(metadata)], {
    type: "application/json",
  });
  const file = new File([blob], "agent-metadata.json");
  const result = await pinata.upload.file(file);
  return `ipfs://${result.IpfsHash}`;
}
```

## SDK Usage

> **TODO: unverified — no canonical SDK found.** The `@8004/sdk` package previously referenced here does not exist on npm (returns 404). There is no published official ERC-8004 client at this time. Interact with the registry directly via `ethers`/`viem` using the spec's ABI (below). If an official SDK is published later, verify the package name on npmjs.com before depending on it.

The Identity Registry exposes (per the spec) `register(string agentURI)` overloads, `setAgentURI`, `getMetadata`/`setMetadata`, and `setAgentWallet`/`getAgentWallet`. Reputation and validation are **separate** registry contracts. Call them directly:

```typescript
import { ethers } from "ethers";

// Minimal Identity Registry ABI (per ERC-8004 spec — adjust to the deployment you target)
const IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature) external",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "function ownerOf(uint256 agentId) external view returns (address)",
];

const registry = new ethers.Contract(REGISTRY_ADDRESS, IDENTITY_REGISTRY_ABI, wallet);
const tx = await registry.register("ipfs://QmHash");
const receipt = await tx.wait();
// reputation/validation live in their own registries — query those contracts separately.
```

## Costs

| Operation | Gas (Base) | Estimated Cost |
|-----------|-----------|----------------|
| Register | ~150,000 | ~$0.01 |
| Update Metadata | ~50,000 | ~$0.003 |
| Transfer | ~65,000 | ~$0.005 |

Gas figures are rough estimates and depend on the actual deployment. (There is no "bridge" operation — see Overview.)

IPFS pinning costs are separate (~$0.01/GB/month via Pinata free tier).

## Gotchas

- **Private key handling** — every write script (`register`, `update`) reads `PRIVATE_KEY` from the env and signs locally with `cast send`. Never hardcode it or pass it on the command line; export it for the session and unset it after. The same key controls the agent NFT, so a leak means loss of identity ownership.
- **There is no cross-chain bridge in ERC-8004** — the standard defines per-chain singleton registries and no `bridge()` function. Do not attempt to "move" an agent identity between chains via the registry; if you need presence on multiple chains, register separately on each. (Earlier drafts of this skill described a `bridge()` flow with a `0.001 ether` fee — that was fabricated and is not part of the spec.)
- **Metadata mutability depends on the URI you chose** — HTTP and `data:` URIs are mutable/centralized (HTTP needs uptime), while `ipfs://` is immutable but requires active pinning. If your pinning lapses, `tokenURI()` still returns the IPFS hash but the content becomes unresolvable. Re-pin or use a managed pinning service.
- **Token ID extraction relies on log ordering** — the register scripts read the `Transfer` event from `logs[0].topics[3]`. If the registry emits additional logs before `Transfer` in a future version, prefer the TypeScript path that filters by the `Transfer(address,address,uint256)` topic signature rather than a fixed index.
- **Public RPC endpoints are rate-limited** — the bundled `llamarpc.com` / `*.base.org` / `optimism.io` URLs are shared public nodes and can throttle or drop requests under load. For repeated registrations or queries, point `--rpc-url` at your own provider key (Alchemy, Infura, etc.).

## References

- ERC-8004 Spec (canonical): https://eips.ethereum.org/EIPS/eip-8004
- Registry Contract: TODO — verify the deployed registry address for your target chain (see Contract Addresses); the previously listed Base address had no bytecode.
- SDK: TODO — no official `@8004/sdk` exists on npm; interact via `ethers`/`viem` and the spec ABI until one is published.
