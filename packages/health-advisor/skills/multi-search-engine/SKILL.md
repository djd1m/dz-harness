---
name: health-advisor-multi-search-engine
description: "Multi search engine integration with 17 engines (8 CN + 9 Global). Supports advanced search operators, time filters, site search, privacy engines, and WolframAlpha knowledge queries. No API keys required."
---

# Multi Search Engine v2.0.1

## Overview

Multi Search Engine integrates 17 search engines (8 domestic Chinese and 9 international) into a unified web search interface that requires no API keys. It supports advanced search operators, time-based filtering, site-specific searches, privacy-focused engines, and WolframAlpha knowledge queries, making it suitable for broad research and information retrieval tasks.

## Dependencies

- **web_fetch** — tool used to execute search queries against engine URLs
- **Internet access** — required for all search operations; no offline fallback
- **DuckDuckGo Bangs** — optional shortcut system for redirecting queries to specific sites
- **WolframAlpha** — external service for computational and knowledge-based queries

## Search Engines

### Domestic (8)
- **Baidu**: `https://www.baidu.com/s?wd={keyword}`
- **Bing CN**: `https://cn.bing.com/search?q={keyword}&ensearch=0`
- **Bing INT**: `https://cn.bing.com/search?q={keyword}&ensearch=1`
- **360**: `https://www.so.com/s?q={keyword}`
- **Sogou**: `https://sogou.com/web?query={keyword}`
- **WeChat**: `https://wx.sogou.com/weixin?type=2&query={keyword}`
- **Toutiao**: `https://so.toutiao.com/search?keyword={keyword}`
- **Jisilu**: `https://www.jisilu.cn/explore/?keyword={keyword}`

### International (9)
- **Google**: `https://www.google.com/search?q={keyword}`
- **Google HK**: `https://www.google.com.hk/search?q={keyword}`
- **DuckDuckGo**: `https://duckduckgo.com/html/?q={keyword}`
- **Yahoo**: `https://search.yahoo.com/search?p={keyword}`
- **Startpage**: `https://www.startpage.com/sp/search?query={keyword}`
- **Brave**: `https://search.brave.com/search?q={keyword}`
- **Ecosia**: `https://www.ecosia.org/search?q={keyword}`
- **Qwant**: `https://www.qwant.com/?q={keyword}`
- **WolframAlpha**: `https://www.wolframalpha.com/input?i={keyword}`

## Quick Examples

```javascript
// Basic search
web_fetch({"url": "https://www.google.com/search?q=python+tutorial"})

// Site-specific
web_fetch({"url": "https://www.google.com/search?q=site:github.com+react"})

// File type
web_fetch({"url": "https://www.google.com/search?q=machine+learning+filetype:pdf"})

// Time filter (past week)
web_fetch({"url": "https://www.google.com/search?q=ai+news&tbs=qdr:w"})

// Privacy search
web_fetch({"url": "https://duckduckgo.com/html/?q=privacy+tools"})

// DuckDuckGo Bangs
web_fetch({"url": "https://duckduckgo.com/html/?q=!gh+tensorflow"})

// Knowledge calculation
web_fetch({"url": "https://www.wolframalpha.com/input?i=100+USD+to+CNY"})
```

## Advanced Operators

| Operator | Example | Description |
|----------|---------|-------------|
| `site:` | `site:github.com python` | Search within site |
| `filetype:` | `filetype:pdf report` | Specific file type |
| `""` | `"machine learning"` | Exact match |
| `-` | `python -snake` | Exclude term |
| `OR` | `cat OR dog` | Either term |

## Time Filters

| Parameter | Description |
|-----------|-------------|
| `tbs=qdr:h` | Past hour |
| `tbs=qdr:d` | Past day |
| `tbs=qdr:w` | Past week |
| `tbs=qdr:m` | Past month |
| `tbs=qdr:y` | Past year |

## Privacy Engines

- **DuckDuckGo**: No tracking
- **Startpage**: Google results + privacy
- **Brave**: Independent index
- **Qwant**: EU GDPR compliant

## Bangs Shortcuts (DuckDuckGo)

| Bang | Destination |
|------|-------------|
| `!g` | Google |
| `!gh` | GitHub |
| `!so` | Stack Overflow |
| `!w` | Wikipedia |
| `!yt` | YouTube |

## WolframAlpha Queries

- Math: `integrate x^2 dx`
- Conversion: `100 USD to CNY`
- Stocks: `AAPL stock`
- Weather: `weather in Beijing`

## Medical Search Sources

For health-related research, use these specialized medical databases in addition to general search engines. Medical databases provide peer-reviewed, evidence-based content that general search engines may not surface reliably.

### Databases

- **PubMed**: `https://pubmed.ncbi.nlm.nih.gov/?term={keyword}`
  - Biomedical literature, clinical studies, systematic reviews
  - Best for: Evidence-based medical questions, drug interactions, treatment efficacy
  - Tip: Use MeSH terms for precise results (e.g., `"Hypertension"[mesh]`)

- **ClinicalTrials.gov**: `https://clinicaltrials.gov/search?query={keyword}`
  - Registry of clinical studies worldwide
  - Best for: Ongoing trials, experimental treatments, study recruitment

- **Cochrane Library**: `https://www.cochranelibrary.com/search?searchBy=6&searchText={keyword}`
  - Systematic reviews and meta-analyses
  - Best for: Treatment effectiveness summaries, clinical decision support

- **WHO**: `https://www.who.int/search#query={keyword}`
  - World Health Organization publications, guidelines, global health data
  - Best for: Public health guidelines, disease outbreak information, vaccination guidance

### Source Credibility Evaluation

When presenting medical search results, evaluate and communicate source credibility:

| Tier | Source Type | Examples | Guidance |
|------|-----------|----------|----------|
| **Tier 1** (Highest) | Systematic reviews, meta-analyses | Cochrane, PubMed systematic reviews | Strongest evidence; prefer these |
| **Tier 2** | Randomized controlled trials | PubMed RCTs, ClinicalTrials.gov | Strong evidence for specific interventions |
| **Tier 3** | Clinical guidelines | WHO, national health agencies | Authoritative but may lag behind latest research |
| **Tier 4** | Observational studies | PubMed cohort/case-control studies | Useful but cannot establish causation |
| **Tier 5** (Lowest) | Expert opinion, news, blogs | General web search results | Use only for context; never as primary evidence |

**Key rules for medical claims:**
- Always cite the source tier when presenting health information
- Cross-reference claims across at least 2 sources when possible
- Flag when information comes only from Tier 4-5 sources
- Note publication dates -- medical guidance can change rapidly

### Privacy for Health Searches

When searching for health-related queries:
- **Prefer privacy engines** (DuckDuckGo, Startpage, Brave, Qwant) for sensitive health topics
- **Never search** with personally identifiable health information (patient names, specific diagnoses linked to identity)
- **PubMed is privacy-safe** -- it searches published literature, not personal data
- Inform the user if a query would be sent to a tracking search engine

## Result Parsing

### Extracting Useful Information from Search Results

When processing search engine results, follow these guidelines:

**General search engines (Google, Bing, DuckDuckGo):**
- Extract the page title, URL, and snippet text
- Identify the domain to assess source type (e.g., `.gov`, `.edu`, `.org` vs `.com`)
- Look for structured data: dates, author names, publication info
- Filter out ads and sponsored results

**PubMed results:**
- Extract: PMID, title, authors, journal, year, abstract
- Note the publication type (RCT, review, case report)
- Check for free full-text availability (PMC links)

**ClinicalTrials.gov results:**
- Extract: NCT number, study title, status (recruiting, completed, etc.), phase
- Note the sponsor and estimated completion date

**Cochrane Library results:**
- Extract: Review title, authors, date, plain language summary
- Note whether it is a full review or a protocol

**General parsing tips:**
- When `web_fetch` returns HTML, look for `<title>`, `<h1>`, `<meta description>` tags
- For structured results, parse `<li>`, `<div class="result">`, or similar containers
- Remove HTML tags and normalize whitespace for clean output
- If results are empty or blocked, try an alternative engine

## Error Handling

### Blocked Requests and CAPTCHAs

Search engines may block automated requests with CAPTCHAs or HTTP 403/429 responses. Handle these gracefully:

```python
def search_with_fallback(query, engines):
    """Try multiple engines in priority order until one succeeds."""
    for engine in engines:
        try:
            result = web_fetch({"url": engine["url"].format(keyword=query), "timeout": 10000})

            # Check for blocking signals
            if is_blocked(result):
                print(f"{engine['name']}: Blocked (CAPTCHA or 403). Trying next engine...")
                continue

            if is_empty(result):
                print(f"{engine['name']}: No results. Trying next engine...")
                continue

            return {"engine": engine["name"], "result": result}

        except TimeoutError:
            print(f"{engine['name']}: Timed out after 10s. Trying next engine...")
            continue
        except Exception as e:
            print(f"{engine['name']}: Error ({e}). Trying next engine...")
            continue

    return {"engine": None, "result": None, "error": "All engines failed"}

def is_blocked(response):
    """Detect if a search engine blocked the request."""
    blocked_signals = [
        "captcha", "CAPTCHA", "unusual traffic",
        "robot", "automated", "verify you are human",
        "Access Denied", "403 Forbidden"
    ]
    return any(signal in str(response) for signal in blocked_signals)

def is_empty(response):
    """Detect if search results are empty."""
    empty_signals = [
        "No results found", "did not match any",
        "0 results", "no matching"
    ]
    return any(signal in str(response) for signal in empty_signals)
```

### Timeout Handling

Set a 10-second timeout per request to avoid blocking on slow engines:

```javascript
// Set timeout for each request
web_fetch({"url": "https://duckduckgo.com/html/?q=query", "timeout": 10000})
```

If a request times out, log it and move to the next engine in the fallback chain.

### Empty Results Strategy

When a search returns zero results:
1. **Broaden the query** -- Remove quotes, reduce terms, use OR instead of AND
2. **Try a different engine** -- Move to the next in the fallback chain
3. **Simplify language** -- Replace technical terms with common synonyms
4. **Remove filters** -- Drop time/site/filetype restrictions
5. **Report to user** -- If all engines return empty, inform the user and suggest alternative queries

### Rate Limiting

Respect engine rate limits to avoid IP blocks:

| Rule | Value |
|------|-------|
| Max requests per engine | 5 per minute |
| Delay between requests to same engine | 12 seconds minimum |
| Max concurrent engine requests | 1 (sequential only) |
| Cooldown after 429/block response | 60 seconds for that engine |

```python
import time

request_timestamps = {}  # engine_name -> [timestamp, ...]

def can_request(engine_name, max_per_minute=5):
    """Check if we can make a request without exceeding rate limits."""
    now = time.time()
    timestamps = request_timestamps.get(engine_name, [])
    # Remove timestamps older than 60 seconds
    timestamps = [t for t in timestamps if now - t < 60]
    request_timestamps[engine_name] = timestamps
    return len(timestamps) < max_per_minute
```

## Output Format

### Structured Search Results Template

Present search results in a consistent markdown format:

```markdown
## Search Results

**Query:** "metformin cardiovascular outcomes"
**Engine:** PubMed (primary) | DuckDuckGo (fallback)
**Date:** 2026-04-19
**Total results:** ~2,340

---

### 1. [Title of the result](https://full-url-here)

- **Source:** pubmed.ncbi.nlm.nih.gov
- **Credibility:** Tier 1 (Systematic Review)
- **Date:** 2026-03-15
- **Snippet:** "This meta-analysis of 42 RCTs found that metformin significantly reduced cardiovascular mortality (RR 0.81, 95% CI 0.71-0.93)..."

### 2. [Title of the result](https://full-url-here)

- **Source:** cochranelibrary.com
- **Credibility:** Tier 1 (Cochrane Review)
- **Date:** 2025-11-02
- **Snippet:** "Moderate-certainty evidence suggests that metformin may reduce..."

---

**Sources checked:** PubMed, Cochrane Library, Google Scholar
**Engines that failed:** Google (CAPTCHA blocked)
**Note:** Results from Tier 1-2 sources only. No Tier 5 sources included.
```

### Result Fields

Every search result should include these fields when available:

| Field | Required | Description |
|-------|----------|-------------|
| **Title** | Yes | Page or article title |
| **URL** | Yes | Direct link to the result |
| **Source** | Yes | Domain name (e.g., pubmed.ncbi.nlm.nih.gov) |
| **Credibility Tier** | For medical queries | Tier 1-5 per the credibility table |
| **Date** | When available | Publication or last-updated date |
| **Snippet** | Yes | Relevant excerpt (2-3 sentences) |
| **Type** | For medical queries | Study type (RCT, review, guideline, etc.) |

## Fallback Strategy

### Engine Priority for Medical Queries

When searching for health or medical information, use engines in this order. Move to the next engine when the current one fails, is blocked, or returns empty results:

```
Priority 1: PubMed          → Peer-reviewed biomedical literature
Priority 2: Cochrane Library → Systematic reviews, highest evidence
Priority 3: ClinicalTrials  → Ongoing and completed clinical trials
Priority 4: Google Scholar   → Broader academic literature
Priority 5: WHO             → Global health guidelines
Priority 6: DuckDuckGo      → General web (privacy-safe fallback)
```

### Engine Priority for General Queries

For non-medical information retrieval:

```
Priority 1: DuckDuckGo      → Privacy-first, no tracking
Priority 2: Brave Search    → Independent index, privacy-focused
Priority 3: Bing            → Good coverage, less blocking than Google
Priority 4: Google           → Largest index but may block/CAPTCHA
Priority 5: Startpage       → Google results via privacy proxy
```

### Fallback Decision Logic

```
1. Send query to Priority 1 engine
2. If blocked/CAPTCHA → log, move to Priority 2
3. If timeout (>10s) → log, move to Priority 2
4. If empty results → broaden query, retry same engine once
5. If still empty → move to next priority engine
6. If all engines exhausted → report failure with attempted engines list
7. Always return results from the highest-priority engine that succeeded
```

### Cross-Referencing Strategy

For important medical claims, do not rely on a single engine:
- Search at least 2 engines from different categories (e.g., PubMed + Cochrane)
- Compare results for consistency
- Flag contradictions between sources
- Prefer the higher-credibility source when results conflict

## Documentation

- `references/international-search.md` - International search guide
- `CHANGELOG.md` - Version history

## Examples

### Example 1: Medical Search -- Full Workflow

**User question:** "What are the latest guidelines for managing hypertension in pregnancy?"

**Step 1: Query Formulation**

```
Medical query detected → Use medical engine priority order
Query: "hypertension pregnancy guidelines 2024 2025 2026"
Medical-optimized query: "hypertension in pregnancy" OR "preeclampsia" guidelines
```

**Step 2: Engine Selection and Execution**

```javascript
// Priority 1: PubMed (peer-reviewed literature)
web_fetch({"url": "https://pubmed.ncbi.nlm.nih.gov/?term=%22Hypertension%2C+Pregnancy-Induced%22%5Bmesh%5D+AND+%22practice+guideline%22%5Bpt%5D&sort=date", "timeout": 10000})
// Result: 3 relevant guidelines found ✓

// Priority 2: Cochrane (systematic reviews)
web_fetch({"url": "https://www.cochranelibrary.com/search?searchBy=6&searchText=hypertension+pregnancy+management", "timeout": 10000})
// Result: 1 Cochrane review found ✓

// Priority 3: WHO (global guidelines)
web_fetch({"url": "https://www.who.int/search#query=hypertension+pregnancy+guidelines", "timeout": 10000})
// Result: WHO recommendation page found ✓
```

**Step 3: Result Parsing**

Extract structured data from each engine's response: titles, URLs, dates, snippets, and source type.

**Step 4: Credibility Evaluation**

| # | Source | Tier | Type | Date |
|---|--------|------|------|------|
| 1 | PubMed (ACOG Practice Bulletin) | Tier 3 | Clinical Guideline | 2025 |
| 2 | Cochrane Library | Tier 1 | Systematic Review | 2025 |
| 3 | WHO | Tier 3 | Clinical Guideline | 2024 |
| 4 | PubMed (NICE Guideline Review) | Tier 3 | Clinical Guideline | 2024 |

**Step 5: Final Output**

```markdown
## Search Results: Hypertension in Pregnancy Guidelines

**Query:** hypertension in pregnancy management guidelines
**Engines used:** PubMed, Cochrane Library, WHO
**Date:** 2026-04-19
**Total relevant results:** 4

---

### 1. [Cochrane Review: Interventions for managing hypertension in pregnancy](https://www.cochranelibrary.com/...)

- **Source:** cochranelibrary.com
- **Credibility:** Tier 1 (Systematic Review)
- **Date:** 2025-08-12
- **Snippet:** "This review included 58 RCTs with 7,402 participants. Moderate-certainty evidence supports early initiation of antihypertensive therapy at BP ≥140/90 mmHg..."

### 2. [ACOG Practice Bulletin: Gestational Hypertension and Preeclampsia](https://pubmed.ncbi.nlm.nih.gov/...)

- **Source:** pubmed.ncbi.nlm.nih.gov
- **Credibility:** Tier 3 (Clinical Guideline)
- **Date:** 2025-03-01
- **Snippet:** "Updated recommendations include lower thresholds for treatment initiation and expanded criteria for aspirin prophylaxis..."

---

**Sources checked:** PubMed ✓, Cochrane ✓, WHO ✓, Google Scholar (not needed)
**Privacy:** All searches conducted via non-tracking medical databases
**Note:** All results are Tier 1-3 evidence. Consult your healthcare provider for clinical decisions.
```

### Example 2: General Search with Engine Fallback

**User question:** "Latest Python 3.13 features"

```javascript
// Priority 1: DuckDuckGo (privacy-first)
web_fetch({"url": "https://duckduckgo.com/html/?q=Python+3.13+new+features", "timeout": 10000})
// Result: 5 results found ✓ → Use these, no fallback needed

// If DuckDuckGo had failed:
// Priority 2: Brave Search
// web_fetch({"url": "https://search.brave.com/search?q=Python+3.13+new+features", "timeout": 10000})
```

## Anti-Patterns

- **Relying on a single engine** — Do not use only one search engine for research tasks; cross-reference across multiple engines to reduce bias and improve coverage.
- **Ignoring regional relevance** — Do not use domestic Chinese engines for international queries or vice versa without considering the audience and content language.
- **Scraping at high frequency** — Do not send rapid successive requests to search engines; this can trigger rate limiting or IP blocks.
- **Treating results as verified facts** — Do not present search engine snippets as authoritative information without verifying against primary sources.
- **Leaking sensitive queries to non-privacy engines** — Do not search for sensitive or personal health information through engines that track user activity; use privacy engines (DuckDuckGo, Startpage, Brave, Qwant) instead.
- **Hardcoding URL patterns without validation** — Do not assume search engine URL formats are permanent; engines may change their query parameter structure.
- **No fallback on failure** — Do not give up after a single engine fails; always try the next engine in the priority chain before reporting failure to the user.
- **Ignoring timeouts** — Do not wait indefinitely for a search engine response; enforce a 10-second timeout and fall back to the next engine.
- **Missing credibility tiers on medical results** — Do not present health search results without indicating the source credibility tier; users need to understand evidence strength.
- **Exceeding rate limits** — Do not send more than 5 requests per minute to any single engine; this leads to IP blocks that affect all subsequent searches.
- **Unstructured output** — Do not dump raw search results; always format them with title, URL, source, credibility tier, date, and snippet fields.

## License

MIT
