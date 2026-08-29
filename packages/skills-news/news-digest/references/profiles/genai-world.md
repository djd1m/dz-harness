# Profile: genai-world

GenAI news for a global/technical audience. World-wide coverage plus open-source and research streams.
Topic-specific config for the engine in `../engine.md`. (No company/competitive context — that belongs
in a local profile; see `_template.md`.)

## Research streams

| # | Stream | Weight | Focus |
|---|--------|--------|-------|
| 1 | Frontier models & product updates | 30% | model releases + product/pricing/feature changes |
| 2 | Agentic AI | 8% | MCP / agent protocols / frameworks / enterprise adoption |
| 3 | Partnerships, investment & financial | 8% | deals, funding, revenue, IPO, M&A |
| 4 | Trends | 8% | AI coding, efficient models, physical AI/robotics, energy |
| 5 | Hardware & events | 8% | chips; period events (CES, MWC, GTC, I/O, WWDC) |
| 6 | Regulation | 5% | EU AI Act, national policy, safety incidents |
| 7 | AI products & platforms | 8% | the app layer on top of models (see watchlist) |
| 8 | Open source & GitHub | 5% | frameworks, inference engines, trending repos |
| 9 | arXiv research | 5% | notable papers, conferences, research trends |

(QUICK mode → streams 1 + the most relevant 2–3 only; STANDARD/QUARTERLY → all.)

## Must-cover entities (tiered)

- **Tier 1 (always check):** Anthropic, OpenAI, Google DeepMind, Meta, NVIDIA, Microsoft, xAI, Apple.
- **Tier 2 (STANDARD+):** DeepSeek, Mistral, Zhipu AI, MiniMax, Alibaba/Qwen, ByteDance, Amazon (Bedrock/Nova), Cohere, AI21, Stability AI.
- **Tier 3 (if surfaced by the broad sweep):** Moonshot, 01.AI, Samsung, Qualcomm, Intel, AMD; startups (Perplexity, Cursor, Replit, Character AI, Sakana).

## Product watchlist (stream 7)

AI coding agents and "super-agent" platforms: Cursor, Kilo Code, Genspark, Manus, Flowith, Replit, and
similar. Track: version, new features, user base, funding, partnerships.

## Open-source watchlist (stream 8)

vLLM, llama.cpp, Ollama, SGLang, BitNet, LangChain/LangGraph, CrewAI, n8n, ComfyUI — plus current
`github.com/trending`.

## Meta-sources (changelog sweep — WebFetch these)

- Official release feeds / changelogs for the Tier-1 vendors (model + product release notes).
- `github.com/trending` for current trending repos.
- An LLM-news aggregator and a recent-papers feed (e.g. arXiv `cs.AI`/`cs.CL`/`cs.LG` recent listings).

> Use the *kinds* of sources above and resolve the current canonical URLs at run time; vendors move and
> rename changelog pages, so confirm each via a quick search rather than trusting a hardcoded link.

## Comparison table (synthesis)

A model/product table is expected for GenAI: `Model | Date | Architecture | Context | Benchmark | Price |
License`. Include every significant model of the period + notable product updates to existing ones.

## Sections (document)

Executive summary → Models & products (+ table) → adaptive sections (agentic, partnerships/finance,
trends, hardware, regulation) → AI products & platforms → GitHub / open source → arXiv → conclusions
(trends / what to watch / risks) → source index.
