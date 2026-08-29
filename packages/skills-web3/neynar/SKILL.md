---
name: "neynar"
description: "Farcaster social protocol API — read feeds, look up users, post casts, search content."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Neynar — Farcaster Social Protocol API

Neynar provides a REST API for interacting with the Farcaster social protocol. Use it to look up users, read feeds, post casts, manage reactions, and search content across the decentralized social network.

---

## When to Use

- **Reach Farcaster, not Ethereum/L2 chains.** Use this skill for social-graph and content tasks (users, FIDs, casts, channels, reactions, follows) — not for token balances, swaps, or on-chain contract calls. Reach for an RPC/swap skill for those.
- **Resolve identities to wallets.** A user's `verified_addresses` (eth/sol) come back from a single FID/username lookup, making this the right tool when you need to map a Farcaster handle to an on-chain address.
- **Read social signals or feeds.** Trending, channel, user, and following feeds plus full-text cast search make this the tool for ingesting Farcaster discourse, building leaderboards, or monitoring a channel.
- **Post or react as an agent.** Anything that writes to the protocol (cast, reaction, follow) goes through Neynar's managed signer — use this skill rather than signing Farcaster messages by hand.
- **Skip it when** you only need raw Hub data with no managed signer/indexing, or your task is purely on-chain (DeFi, NFTs, bridging) — Farcaster social state is the boundary of this API.

---

## Setup

### 1. Get an API Key

Register at [dev.neynar.com](https://dev.neynar.com) and create a new application to obtain your API key.

### 2. Generate a Signer UUID

A Signer UUID is required for write operations (posting casts, reactions, follows). Generate one through the Neynar dashboard or via the `/v2/farcaster/signer` endpoint.

### 3. Configuration

Create a `config.json`:

```json
{
  "apiKey": "NEYNAR_API_KEY",
  "signerUuid": "YOUR_SIGNER_UUID",
  "baseUrl": "https://api.neynar.com"
}
```

Set the environment variable:

```bash
export NEYNAR_API_KEY="your-api-key-here"
```

All requests must include the header:

```
x-api-key: <NEYNAR_API_KEY>
```

---

## Core Concepts

| Concept   | Description |
|-----------|-------------|
| **FID**     | Farcaster ID — a unique numeric identifier for every user on the protocol. Immutable once assigned. |
| **Cast**    | A post on Farcaster. Can contain text (up to 320 chars), embeds (URLs, images), mentions, and channel tags. |
| **Channel** | A topic-based feed. Users can post casts to a channel. Channels have an owner and moderation rules. |
| **Frame**   | An interactive mini-app embedded inside a cast. Frames use the OpenGraph standard extended with Farcaster Frame actions. |

---

## Usage

### User Lookup

#### By Username

```bash
GET /v2/farcaster/user/by_username?username=dwr.eth
```

```json
{
  "user": {
    "fid": 3,
    "username": "dwr.eth",
    "display_name": "Dan Romero",
    "pfp_url": "https://...",
    "follower_count": 185000,
    "following_count": 2800,
    "verified_addresses": {
      "eth_addresses": ["0x..."],
      "sol_addresses": []
    }
  }
}
```

#### By FID

```bash
GET /v2/farcaster/user?fid=3
```

#### Bulk Lookup

Look up multiple users in a single request (up to 100 FIDs):

```bash
GET /v2/farcaster/user/bulk?fids=3,194,2
```

Returns an array of user objects. Useful for resolving participant lists, leaderboards, or reaction authors.

---

### Read Feed

#### User Feed

```bash
GET /v2/farcaster/feed/user/{fid}?limit=25
```

Returns the most recent casts by a specific user. Supports pagination via `cursor`.

#### Channel Feed

```bash
GET /v2/farcaster/feed/channels?channel_ids=base,ethereum&limit=50
```

Returns casts from one or more channels. Combine with `with_recasts=false` to exclude recasts.

#### Trending Feed

```bash
GET /v2/farcaster/feed/trending?limit=10&time_window=24h
```

Returns trending casts across Farcaster based on engagement signals.

#### Following Feed

```bash
GET /v2/farcaster/feed/following/{fid}?limit=25
```

Returns casts from users that the given FID follows. Requires the viewer's FID for personalized ranking.

---

### Search

#### Search Casts

```bash
GET /v2/farcaster/cast/search?q=onchain%20identity&limit=20
```

Full-text search across all public casts. Results ranked by relevance and recency.

#### Search Users

```bash
GET /v2/farcaster/user/search?q=vitalik&limit=10
```

Search users by username or display name. Returns matching profiles with follower counts.

#### Channel-Scoped Search

```bash
GET /v2/farcaster/cast/search?q=bridge&channel_id=base&limit=20
```

Restrict cast search to a specific channel by adding `channel_id`.

---

### Get Cast

Retrieve a single cast by its hash:

```bash
GET /v2/farcaster/cast?identifier=0xabcdef1234...&type=hash
```

Or by its Warpcast URL:

```bash
GET /v2/farcaster/cast?identifier=https://warpcast.com/dwr.eth/0xabcdef&type=url
```

Response includes the cast text, embeds, reactions summary, replies count, and author profile.

---

### Post Cast

```bash
POST /v2/farcaster/cast
Content-Type: application/json
x-api-key: <NEYNAR_API_KEY>

{
  "signer_uuid": "YOUR_SIGNER_UUID",
  "text": "Hello from my agent! 🤖",
  "channel_id": "base",
  "embeds": [
    { "url": "https://example.com/image.png" }
  ]
}
```

**Fields:**

| Field         | Required | Description |
|---------------|----------|-------------|
| `signer_uuid` | Yes      | Your authorized signer |
| `text`         | Yes      | Cast content (max 320 chars) |
| `channel_id`   | No       | Target channel |
| `embeds`       | No       | Array of URL embeds (max 2) |
| `parent`       | No       | Cast hash to reply to |

---

### Reactions

#### Like a Cast

```bash
POST /v2/farcaster/reaction
{
  "signer_uuid": "YOUR_SIGNER_UUID",
  "reaction_type": "like",
  "target": "0xabcdef1234..."
}
```

#### Recast

```bash
POST /v2/farcaster/reaction
{
  "signer_uuid": "YOUR_SIGNER_UUID",
  "reaction_type": "recast",
  "target": "0xabcdef1234..."
}
```

#### Remove Reaction

```bash
DELETE /v2/farcaster/reaction
{
  "signer_uuid": "YOUR_SIGNER_UUID",
  "reaction_type": "like",
  "target": "0xabcdef1234..."
}
```

---

### Follow / Unfollow

#### Follow a User

```bash
POST /v2/farcaster/user/follow
{
  "signer_uuid": "YOUR_SIGNER_UUID",
  "target_fids": [3, 194]
}
```

#### Unfollow a User

```bash
DELETE /v2/farcaster/user/follow
{
  "signer_uuid": "YOUR_SIGNER_UUID",
  "target_fids": [3]
}
```

---

## API Endpoints Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/v2/farcaster/user` | GET | API Key | Lookup user by FID |
| `/v2/farcaster/user/by_username` | GET | API Key | Lookup user by username |
| `/v2/farcaster/user/bulk` | GET | API Key | Bulk lookup up to 100 FIDs |
| `/v2/farcaster/user/search` | GET | API Key | Search users by name |
| `/v2/farcaster/user/follow` | POST | API Key + Signer | Follow users |
| `/v2/farcaster/user/follow` | DELETE | API Key + Signer | Unfollow users |
| `/v2/farcaster/cast` | GET | API Key | Get cast by hash or URL |
| `/v2/farcaster/cast` | POST | API Key + Signer | Post a new cast |
| `/v2/farcaster/cast` | DELETE | API Key + Signer | Delete a cast |
| `/v2/farcaster/cast/search` | GET | API Key | Search casts (full-text) |
| `/v2/farcaster/feed/user/{fid}` | GET | API Key | User's cast feed |
| `/v2/farcaster/feed/channels` | GET | API Key | Channel feed |
| `/v2/farcaster/feed/trending` | GET | API Key | Trending casts |
| `/v2/farcaster/feed/following/{fid}` | GET | API Key | Following feed |
| `/v2/farcaster/reaction` | POST | API Key + Signer | Like or recast |
| `/v2/farcaster/reaction` | DELETE | API Key + Signer | Remove reaction |

---

## Rate Limits

| Plan | Rate Limit |
|------|------------|
| **Free** | 300 requests/minute |
| **Growth** | 1,000 requests/minute |
| **Enterprise** | Custom |

Rate limit headers are returned on every response:

```
x-ratelimit-limit: 300
x-ratelimit-remaining: 287
x-ratelimit-reset: 1717200060
```

When the limit is exceeded, the API returns `429 Too Many Requests`. Implement exponential backoff with a minimum 1-second delay.

---

## Gotchas

- **A signer must be *approved* before it can write.** A freshly generated `signer_uuid` starts in `pending_approval` — the owning Farcaster account has to approve it (via the dashboard/deep link) before posts, reactions, or follows succeed. An unapproved signer returns an auth error, not a rate-limit error.
- **Writes are not instantly final.** `POST` cast/reaction/follow calls are accepted by Neynar and propagated to Farcaster hubs asynchronously. The returned cast hash may not appear in feeds or `GET /v2/farcaster/cast` for a short window; don't treat a 200 as "globally visible."
- **Respect the content limits.** `text` is capped at 320 characters and `embeds` at 2 URLs — exceeding either is rejected at post time, so truncate/trim before sending rather than relying on the API to clip.
- **`verified_addresses` reflects user claims, not your verification.** The eth/sol addresses on a user object are ones that account proved ownership of to Farcaster; treat an empty array as "none verified" and never assume an unverified address belongs to a given FID.
- **Keep the API key server-side.** The `x-api-key` header authenticates your whole Neynar app and counts against your plan's quota — never ship it in client-side code or embed it in a cast/frame.
