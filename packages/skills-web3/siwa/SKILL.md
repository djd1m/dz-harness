---
name: "siwa"
description: "Sign-In With Agent (SIWA) — ERC-8004 agent authentication for services."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# SIWA — Sign-In With Agent

SIWA (Sign-In With Agent) implements ERC-8004 agent authentication, allowing AI agents to authenticate with web services using cryptographic wallet signatures. It provides a standardized protocol for agent identity verification, analogous to "Sign-In With Ethereum" (SIWE) but designed specifically for autonomous agents.

---

## When to Use

- Reach for this skill when an **AI agent needs to authenticate itself to a web service** using a wallet signature — i.e. proving agent identity (ERC-8004), not executing on-chain transactions.
- Use it on either side of the handshake: **agent-side** to build and sign a SIWA challenge (via Bankr), or **server-side** to verify the signature and extract capability claims with `verifySiwaMessage()`.
- Choose SIWA when you need **scoped, capability-based access** (ERC-8128 `urn:capability:*` resources) baked into the auth token, rather than coarse all-or-nothing API keys.
- Prefer SIWA over plain SIWE specifically for **autonomous-agent flows** — it carries agent-oriented resources, receipts, and framework middleware (Next.js / Express / Hono / Fastify).
- Do NOT use this skill to actually move funds, swap, or transfer tokens — it only authenticates and authorizes; the on-chain action itself is performed by the wallet/swap skill the granted capability points to.

---

## Installation

```bash
npm install @buildersgarden/siwa
```

---

## Skills

### Agent-Side: Signing via Bankr

The agent signs authentication messages using its Bankr wallet. This produces a cryptographic proof that the agent controls a specific wallet address.

#### Step 1: Request a Challenge

The service provides a SIWA challenge message:

```typescript
import { createSiwaMessage } from '@buildersgarden/siwa';

const message = createSiwaMessage({
  domain: 'app.example.com',
  address: '0xAgentWalletAddress',
  statement: 'Sign in to Example App as an agent',
  uri: 'https://app.example.com/api/auth',
  version: '1',
  chainId: 8453,
  nonce: 'unique-nonce-from-server',
  issuedAt: new Date().toISOString(),
  expirationTime: new Date(Date.now() + 600_000).toISOString(),
  resources: ['urn:capability:trade', 'urn:capability:read']
});
```

#### Step 2: Sign via Bankr

```bash
bankr wallet sign --message "<siwa-message>" --chain base
```

Or via the Bankr REST API:

```typescript
const response = await fetch('https://api.bankr.bot/api/v1/wallet/sign', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${BANKR_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: siwaMessage,
    chain: 'base'
  })
});

const { signature } = await response.json();
```

#### Step 3: Submit to Service

```typescript
const authResponse = await fetch('https://app.example.com/api/auth/siwa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: siwaMessage,
    signature: signature
  })
});

const { token } = await authResponse.json();
// Use token for subsequent authenticated requests
```

---

### Server-Side: Verification

The service verifies the agent's signature and extracts identity claims.

#### Basic Verification

```typescript
import { verifySiwaMessage } from '@buildersgarden/siwa';

const result = await verifySiwaMessage({
  message: receivedMessage,
  signature: receivedSignature
});

if (result.success) {
  console.log('Agent address:', result.data.address);
  console.log('Requested capabilities:', result.data.resources);
  // Grant session token
} else {
  console.error('Verification failed:', result.error);
}
```

#### With Nonce Validation

```typescript
import { verifySiwaMessage, NonceStore } from '@buildersgarden/siwa';

const nonceStore = new NonceStore(); // In-memory or Redis-backed

// Generate nonce for challenge
const nonce = nonceStore.generate();

// Later, verify with nonce check
const result = await verifySiwaMessage({
  message: receivedMessage,
  signature: receivedSignature,
  nonce: nonce // Ensures replay protection
});
```

---

## SDK Modules

| Module | Import | Description |
|--------|--------|-------------|
| **Core** | `@buildersgarden/siwa` | `createSiwaMessage()`, `verifySiwaMessage()`, `parseSiwaMessage()` — message creation, verification, and parsing |
| **Signer** | `@buildersgarden/siwa/signer` | `signMessage()`, `signTypedData()` — wallet signing utilities for agents |
| **ERC-8128** | `@buildersgarden/siwa/erc8128` | `resolveCapabilities()`, `validateCapabilities()` — capability resolution per ERC-8128 |
| **Receipt** | `@buildersgarden/siwa/receipt` | `createReceipt()`, `verifyReceipt()` — post-action receipts proving an agent performed an operation |
| **Nonce Store** | `@buildersgarden/siwa/nonce-store` | `NonceStore` class — replay-protection nonce management (in-memory or Redis) |
| **Next.js Middleware** | `@buildersgarden/siwa/next` | `withSiwa()` — Next.js API route middleware for SIWA verification |
| **Express Middleware** | `@buildersgarden/siwa/express` | `siwaMiddleware()` — Express middleware for SIWA verification |
| **Hono Middleware** | `@buildersgarden/siwa/hono` | `siwaMiddleware()` — Hono middleware for SIWA verification |
| **Fastify Plugin** | `@buildersgarden/siwa/fastify` | `siwaPlugin()` — Fastify plugin for SIWA verification |

---

## Message Format

A SIWA message follows the ERC-8004 specification:

```
app.example.com wants you to sign in with your agent account:
0xAgentWalletAddress

Sign in to Example App as an agent

URI: https://app.example.com/api/auth
Version: 1
Chain ID: 8453
Nonce: unique-nonce-from-server
Issued At: 2026-06-03T12:00:00.000Z
Expiration Time: 2026-06-03T12:10:00.000Z
Resources:
- urn:capability:trade
- urn:capability:read
```

---

## Capabilities (ERC-8128)

Resources in the SIWA message define what the agent is authorized to do:

| Capability URN | Description |
|----------------|-------------|
| `urn:capability:trade` | Execute trades and swaps |
| `urn:capability:read` | Read portfolio and market data |
| `urn:capability:transfer` | Transfer tokens between wallets |
| `urn:capability:deploy` | Deploy smart contracts |
| `urn:capability:sign` | Sign arbitrary messages |
| `urn:capability:admin` | Full administrative access |

Services should validate requested capabilities against their allowed set before granting access.

---

## Gotchas

- **Always validate the nonce server-side.** A signature without `nonce` replay protection (the `NonceStore` / `nonce` arg to `verifySiwaMessage()`) can be captured and replayed. Generate a fresh single-use nonce per challenge and reject reused ones.
- **Honor `expirationTime`.** SIWA messages carry `issuedAt` / `expirationTime`; a verifier that ignores them will accept stale signatures indefinitely. The example uses a 10-minute window (`600_000` ms) — keep it short.
- **`result.success === false` is not an exception.** `verifySiwaMessage()` returns a result object, not a thrown error — check `result.success` and read `result.error` rather than wrapping in try/catch and assuming success.
- **`chainId` must match.** The signed message pins a chain (e.g. `8453` for Base); a signature produced for one chain ID will fail verification against another. Keep the agent's signing chain and the service's expected chain aligned.
- **Treat the Bankr API key as a server secret.** `BANKR_API_KEY` in the signing requests grants wallet-signing power — never ship it to the browser or embed it in agent prompts/logs.
- **Capabilities are claims, not enforcement.** The `resources` URNs only state what the agent *requests*; the service must intersect them against its own allowed set before granting `urn:capability:trade`/`transfer`/`admin` access.

---

## Links

- **ERC-8004 Specification**: [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)
- **SIWA SDK Docs**: [docs.buildersgarden.com/siwa](https://docs.buildersgarden.com/siwa)
- **ERC-8128 Capabilities**: [eips.ethereum.org/EIPS/eip-8128](https://eips.ethereum.org/EIPS/eip-8128)
- **npm Package**: [@buildersgarden/siwa](https://www.npmjs.com/package/@buildersgarden/siwa)
