# @dzhechkov/skills-web3

Canonical Web3/DeFi skill pack — **12 agentic skills** for blockchain RPC, wallet analytics, cross-chain swaps, DeFi governance, privacy, on-chain identity, and social protocols.

Canonicalized from [gitlawb/banker-skills](https://github.com/gitlawb/banker-skills) into the [agentskills.io](https://agentskills.io) standard.

## Install

```bash
# Via dz CLI (recommended)
dz init --target claude-code --preset web3

# Or select specific skills
dz init --target claude-code --select quicknode,zerion,symbiosis

# Or install the package directly
npm install @dzhechkov/skills-web3
```

## Skill Inventory (12)

| Skill | Domain | Description |
|-------|--------|-------------|
| `quicknode` | Infrastructure | Blockchain RPC across 77+ networks, x402 pay-per-request |
| `zerion` | Analytics | Wallet intelligence — portfolio, PnL, positions across 41+ chains |
| `symbiosis` | DeFi | Cross-chain token swaps across 54+ blockchains |
| `ens-primary-name` | Identity | ENS name management on Base and L2s |
| `erc-8004` | Identity | On-chain AI agent identity (ERC-721 NFT + reputation) |
| `veil` | Privacy | ZK-proof private transactions on Base (ETH/USDC) |
| `neynar` | Social | Farcaster protocol API — feeds, casts, users, search |
| `trails` | DeFi | Cross-chain DeFi orchestration — swaps, bridges, yield vaults |
| `bankr` | Trading | AI trading agent — swaps, DCA, stop-loss, leverage, token deploy |
| `siwa` | Auth | Sign-In With Agent (ERC-8004 authentication) |
| `hydrex` | Governance | Liquidity governance — veHYDX voting, ICHI vaults, yield |
| `quotient` | Data | Market intelligence with x402 micropayments |

## Chain Coverage

| Chain | Skills supporting it |
|-------|---------------------|
| **Base** | All 12 |
| **Ethereum** | quicknode, zerion, symbiosis, ens-primary-name, erc-8004, trails, bankr |
| **Polygon** | quicknode, zerion, symbiosis, trails, bankr |
| **Solana** | quicknode, zerion, bankr |
| **Arbitrum** | zerion, symbiosis, ens-primary-name, trails, bankr |
| **Optimism** | zerion, symbiosis, ens-primary-name |
| **54+ more** | symbiosis (via Sequence routing) |

## Origin

All 12 skills were originally created by [gitlawb/banker-skills](https://github.com/gitlawb/banker-skills) (BankrBot, license: MIT). Converted to [agentskills.io](https://agentskills.io) standard with trust_tier, validation schemas, and eval templates.

## Status

`v0.1.0` — initial release. Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub).

## How to use

Skills **auto-activate** — your agent loads a skill when your task matches its trigger phrases (defined in each skill's `SKILL.md` frontmatter). For example:

- "Show my wallet balances on Zerion" → `zerion`
- "Set my ENS primary name" → `ens-primary-name`
- "Swap tokens via Symbiosis" → `symbiosis`

To see a skill's exact triggers and assets: `dz info <skill-id>`. To find one: `dz registry search <term>`.
