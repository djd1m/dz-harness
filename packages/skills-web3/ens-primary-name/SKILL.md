---
name: "ens-primary-name"
description: "ENS name management — set primary name on Base and L2s via Reverse Registrar."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# ENS Primary Name — L2 Name Management

ENS name management on Base and L2s. Set primary names, verify resolution, and configure avatars using the Reverse Registrar contract.

## Overview

ENS primary names create a **bidirectional link** between an Ethereum address and an ENS name:

- **Forward resolution**: `name.eth` -> `0xAddress` (set via the ENS name owner)
- **Reverse resolution**: `0xAddress` -> `name.eth` (set via the address owner = "primary name")

Setting a primary name means when someone looks up your address, they see your `.eth` name instead of a hex string.

## When to Use

- Use this skill when you need to **set or verify a primary (reverse) name** for an address — i.e. make `0xAddress` resolve back to `name.eth` via the Reverse Registrar.
- Reach for it specifically for **L2 primary names on Base, Optimism, Arbitrum, Linea, or Scroll** (cheaper than mainnet, native to L2 apps), as well as Ethereum mainnet reverse records.
- Use it to **attach an avatar** (HTTPS, IPFS, NFT, or data-URI) to an ENS name via the resolver's `text` record.
- NOT for **forward resolution** (registering a name or pointing `name.eth` -> address) — that is set by the name owner on the ENS Registry, not here. This skill only writes the reverse direction.
- NOT for **name registration, renewals, or purchasing** `.eth` names; this assumes the name already exists and points to your address.

### Why L2 Primary Names?

Since 2024, ENS supports setting primary names on L2s (Base, Optimism, Arbitrum, etc.) via chain-specific Reverse Registrar contracts. This is cheaper than Ethereum mainnet and works natively in L2 apps.

## Set Primary Name Script

```bash
#!/usr/bin/env bash
# set-primary.sh — Set ENS primary name on an L2 via Reverse Registrar
#
# Usage: ./set-primary.sh <chain> <ens-name>
# Example: ./set-primary.sh base vitalik.eth

set -euo pipefail

CHAIN="${1:?Usage: set-primary.sh <chain> <ens-name>}"
ENS_NAME="${2:?Usage: set-primary.sh <chain> <ens-name>}"

# Reverse Registrar addresses by chain
declare -A REVERSE_REGISTRAR=(
  ["base"]="0x0000000000D8e504002cC26E3Ec46D81971C1664"
  ["optimism"]="0x0000000000D8e504002cC26E3Ec46D81971C1664"
  ["arbitrum"]="0x0000000000D8e504002cC26E3Ec46D81971C1664"
  ["linea"]="0x0000000000D8e504002cC26E3Ec46D81971C1664"
  ["scroll"]="0x0000000000D8e504002cC26E3Ec46D81971C1664"
)

# RPC URLs by chain
declare -A RPC_URL=(
  ["base"]="https://mainnet.base.org"
  ["optimism"]="https://mainnet.optimism.io"
  ["arbitrum"]="https://arb1.arbitrum.io/rpc"
  ["linea"]="https://rpc.linea.build"
  ["scroll"]="https://rpc.scroll.io"
)

CONTRACT="${REVERSE_REGISTRAR[$CHAIN]:?Unsupported chain: $CHAIN}"
RPC="${RPC_URL[$CHAIN]}"

echo "Setting primary name to '${ENS_NAME}' on ${CHAIN}..."
echo "Contract: ${CONTRACT}"
echo "RPC: ${RPC}"

# setName(string name) function selector: 0xc47f0027
# Encode the function call
cast send "$CONTRACT" \
  "setName(string)" "$ENS_NAME" \
  --rpc-url "$RPC" \
  --private-key "${PRIVATE_KEY:?Set PRIVATE_KEY env var}"

echo "Primary name set to '${ENS_NAME}' on ${CHAIN}."
```

## Verify Primary Name Script

```bash
#!/usr/bin/env bash
# verify-primary.sh — Verify ENS primary name resolution
#
# Usage: ./verify-primary.sh <chain> <address>
# Example: ./verify-primary.sh base 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

set -euo pipefail

CHAIN="${1:?Usage: verify-primary.sh <chain> <address>}"
ADDRESS="${2:?Usage: verify-primary.sh <chain> <address>}"

declare -A REVERSE_REGISTRAR=(
  ["base"]="0x0000000000D8e504002cC26E3Ec46D81971C1664"
  ["optimism"]="0x0000000000D8e504002cC26E3Ec46D81971C1664"
  ["arbitrum"]="0x0000000000D8e504002cC26E3Ec46D81971C1664"
)

declare -A RPC_URL=(
  ["base"]="https://mainnet.base.org"
  ["optimism"]="https://mainnet.optimism.io"
  ["arbitrum"]="https://arb1.arbitrum.io/rpc"
)

RPC="${RPC_URL[$CHAIN]:?Unsupported chain: $CHAIN}"

# Compute reverse node: keccak256(addr.reverse)
# The Universal Resolver handles this via reverse lookup
echo "Checking primary name for ${ADDRESS} on ${CHAIN}..."

# Method 1: Using cast (Foundry)
NAME=$(cast call "${REVERSE_REGISTRAR[$CHAIN]}" \
  "node(address)(bytes32)" "$ADDRESS" \
  --rpc-url "$RPC" 2>/dev/null || echo "")

if [ -n "$NAME" ] && [ "$NAME" != "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
  echo "Primary name: ${NAME}"
else
  echo "No primary name set for ${ADDRESS} on ${CHAIN}"
fi

# Method 2: Using ENS Universal Resolver (cross-chain)
echo ""
echo "Checking via Universal Resolver..."
cast call "0xce01f8eee7E479C928F8919abD53E553a36CeF67" \
  "reverse(bytes)" \
  "$(cast abi-encode 'f(address)' "$ADDRESS")" \
  --rpc-url "https://mainnet.base.org"
```

## Set Avatar Script

```bash
#!/usr/bin/env bash
# set-avatar.sh — Set avatar for an ENS name
#
# Usage: ./set-avatar.sh <ens-name> <avatar-uri>
# Example: ./set-avatar.sh name.eth "https://example.com/avatar.png"
# Example: ./set-avatar.sh name.eth "ipfs://QmHash"
# Example: ./set-avatar.sh name.eth "eip155:1/erc721:0xContract/tokenId"

set -euo pipefail

ENS_NAME="${1:?Usage: set-avatar.sh <ens-name> <avatar-uri>}"
AVATAR_URI="${2:?Usage: set-avatar.sh <ens-name> <avatar-uri>}"

# ENS Public Resolver on Ethereum mainnet
RESOLVER="0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63"
RPC="https://eth.llamarpc.com"

# Compute namehash for the ENS name
NAMEHASH=$(cast namehash "$ENS_NAME")

echo "Setting avatar for ${ENS_NAME}..."
echo "Namehash: ${NAMEHASH}"
echo "Avatar URI: ${AVATAR_URI}"

# setText(bytes32 node, string key, string value)
cast send "$RESOLVER" \
  "setText(bytes32,string,string)" \
  "$NAMEHASH" "avatar" "$AVATAR_URI" \
  --rpc-url "$RPC" \
  --private-key "${PRIVATE_KEY:?Set PRIVATE_KEY env var}"

echo "Avatar set for ${ENS_NAME}."
```

## Supported Chains

| Chain | Chain ID | Reverse Registrar | Status |
|-------|----------|-------------------|--------|
| **Ethereum** | 1 | `0x084b1c3C81545d370f3634392De611CaaBFf8148` | Production |
| **Base** | 8453 | `0x0000000000D8e504002cC26E3Ec46D81971C1664` | Production |
| **Optimism** | 10 | `0x0000000000D8e504002cC26E3Ec46D81971C1664` | Production |
| **Arbitrum** | 42161 | `0x0000000000D8e504002cC26E3Ec46D81971C1664` | Production |
| **Linea** | 59144 | `0x0000000000D8e504002cC26E3Ec46D81971C1664` | Production |
| **Scroll** | 534352 | `0x0000000000D8e504002cC26E3Ec46D81971C1664` | Production |

> Addresses verified against the ENS docs ([docs.ens.domains/registry/reverse](https://docs.ens.domains/registry/reverse/)). The five L2s share the same `L2ReverseRegistrar` address. The Ethereum mainnet entry is the default reverse registrar. ENS strongly recommends **not** hardcoding these — resolve them per ENSIP-19, as they can change.

## Bidirectional Link Explained

```
Forward Resolution (name -> address):
  vitalik.eth ──[ENS Registry]──> 0xd8dA...96045

Reverse Resolution (address -> name):
  0xd8dA...96045 ──[Reverse Registrar]──> vitalik.eth

Both must be set for a valid primary name:
  1. Forward: name owner sets address record
  2. Reverse: address owner sets primary name (this skill)
```

**Why both?** Prevents impersonation. You cannot set someone else's name as your primary name unless they also point that name to your address.

## Avatar Formats

ENS supports multiple avatar URI formats:

| Format | Example | Description |
|--------|---------|-------------|
| **HTTPS** | `https://example.com/avatar.png` | Direct URL to image |
| **IPFS** | `ipfs://QmSomeHash` | IPFS content hash |
| **NFT (ERC-721)** | `eip155:1/erc721:0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D/1234` | Reference an owned NFT |
| **NFT (ERC-1155)** | `eip155:1/erc1155:0xContract/tokenId` | ERC-1155 NFT |
| **Data URI** | `data:image/svg+xml;base64,PHN2Zy...` | Inline SVG/image |

### NFT Avatar Format

```
eip155:<chainId>/erc721:<contractAddress>/<tokenId>
```

- `eip155:1` — Ethereum mainnet
- `eip155:8453` — Base
- The NFT must be owned by the ENS name owner

### Programmatic Avatar Setup

```typescript
import { ethers } from "ethers";

const RESOLVER_ABI = [
  "function setText(bytes32 node, string key, string value) external",
  "function text(bytes32 node, string key) external view returns (string)",
];

async function setAvatar(
  ensName: string,
  avatarUri: string,
  signer: ethers.Signer
) {
  const resolver = new ethers.Contract(
    "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63", // ENS Public Resolver
    RESOLVER_ABI,
    signer
  );

  const namehash = ethers.namehash(ensName);
  const tx = await resolver.setText(namehash, "avatar", avatarUri);
  await tx.wait();
  console.log(`Avatar set: ${avatarUri}`);
}

// Verify avatar
async function getAvatar(ensName: string, provider: ethers.Provider) {
  const resolver = new ethers.Contract(
    "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
    RESOLVER_ABI,
    provider
  );

  const namehash = ethers.namehash(ensName);
  return resolver.text(namehash, "avatar");
}
```

## Gotchas

- **Forward record must exist first.** Setting the primary name (`setName`) only writes reverse resolution. If `name.eth` does not point back to your address, wallets/apps will treat the reverse record as unverified and ignore it. Set the forward address record on the ENS Registry before relying on the primary name.
- **Avatars live on mainnet, not the L2.** `set-avatar.sh` and the TypeScript helper write to the ENS Public Resolver on Ethereum mainnet (`0x231b0Ee1...`) — they do not use the L2 Reverse Registrar. Setting an L2 primary name does not set an avatar, and vice versa; they are separate transactions on different chains.
- **Don't hardcode the Reverse Registrar addresses.** The scripts use the published ENS `L2ReverseRegistrar` address (`0x0000000000D8e504002cC26E3Ec46D81971C1664`, shared across Base/Optimism/Arbitrum/Linea/Scroll per docs.ens.domains). ENS warns these can change; resolve them per ENSIP-19 (or re-confirm against the ENS docs) before broadcasting a `cast send`, or you risk a reverted or misdirected transaction.
- **`PRIVATE_KEY` is read from the environment in plaintext.** The send scripts pass `--private-key "$PRIVATE_KEY"` directly to `cast`. Use a dedicated low-value key, avoid committing it to shell history, and prefer a hardware/keystore signer for any address holding real funds.
- **NFT avatars require ownership.** An `eip155:.../erc721:...` avatar URI only renders if the ENS name owner actually owns that token on the referenced chain; otherwise clients fall back to no avatar.

## References

- ENS Docs: https://docs.ens.domains/
- L2 Names: https://docs.ens.domains/learn/ccip-read
- Reverse Registrar: https://docs.ens.domains/contract-api-reference/reverseregistrar
- Foundry / Cast: https://book.getfoundry.sh/reference/cast/
