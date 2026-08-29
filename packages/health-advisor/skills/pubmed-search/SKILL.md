---
name: health-advisor-pubmed-search
description: Search PubMed for scientific literature. Use when the user asks to find papers, search literature, look up research, find publications, or asks about recent studies. Triggers on "pubmed", "papers", "literature", "publications", "research on", "studies about".
---

# PubMed Search

## Overview

PubMed Search enables retrieval of scientific literature from NCBI PubMed using BioPython's Entrez module. It supports keyword, author, journal, and date-filtered queries, returning structured citation data with abstracts and direct PubMed links. The primary use case is finding evidence-based references for clinical and research questions.

## Dependencies

- **BioPython** (`Bio.Entrez`) -- Python library for NCBI Entrez API access
- **NCBI PubMed** -- external data source for indexed biomedical literature
- **Entrez email registration** -- a valid email must be set for API usage (`Entrez.email`)

## When to Use

- User asks to find papers on a topic
- User wants recent publications in a field
- User asks for references or citations
- User wants to know the state of research on a topic
- User needs systematic evidence for a clinical question

## How to Execute

### 1. Set up Entrez

```python
from Bio import Entrez

# Use the project's configured email -- never hardcode a personal address.
# Check the project config or environment variable for the registered email.
Entrez.email = PROJECT_EMAIL  # e.g., from config or os.environ["ENTREZ_EMAIL"]

# Optional: If an NCBI API key is available, set it for higher rate limits.
# Entrez.api_key = os.environ.get("NCBI_API_KEY")
```

### 2. Build a Search Query

Before searching, construct a well-formed query using PubMed field tags and Boolean operators.

**Field tags:**
- `[tiab]` -- Title/Abstract
- `[ti]` -- Title only
- `[mesh]` -- MeSH (Medical Subject Headings) term
- `[au]` -- Author
- `[jn]` -- Journal name
- `[dp]` -- Date of publication
- `[pt]` -- Publication type
- `[la]` -- Language

**Boolean operators:** `AND`, `OR`, `NOT` (must be uppercase)

**Example queries:**
- `"hypertension"[mesh] AND "exercise"[mesh] AND "randomized controlled trial"[pt]`
- `("CRISPR"[tiab] OR "gene editing"[tiab]) AND "delivery"[tiab]`
- `"Smith J"[au] AND "Nature"[jn] AND "2025"[dp]`

### 3. MeSH Term Lookup

MeSH (Medical Subject Headings) terms ensure consistent, precise searching. Always prefer MeSH terms over free-text when available.

**How to find MeSH terms:**
1. Use the MeSH Browser: https://meshb.nlm.nih.gov/search
2. Or query programmatically:

```python
# Look up the correct MeSH term for a concept
handle = Entrez.esearch(db="mesh", term="high blood pressure")
record = Entrez.read(handle)
handle.close()

# Fetch MeSH term details
if record["IdList"]:
    handle = Entrez.efetch(db="mesh", id=record["IdList"][0], rettype="full")
    mesh_data = handle.read()
    handle.close()
    print(mesh_data)  # Shows preferred term, entry terms, tree numbers
```

**Common MeSH mappings:**
- "high blood pressure" -> `"Hypertension"[mesh]`
- "sugar diabetes" -> `"Diabetes Mellitus"[mesh]`
- "heart attack" -> `"Myocardial Infarction"[mesh]`
- "blood thinner" -> `"Anticoagulants"[mesh]`

**Tip:** Use `[mesh:noexp]` to search the exact MeSH term without including narrower terms in the hierarchy.

### 4. Search PubMed

```python
import time

def search_pubmed(query, max_results=20, sort="relevance"):
    """Search PubMed with error handling.

    Args:
        query: PubMed search query string
        max_results: Number of results per page (default 20, max 10000)
        sort: Sort order -- "relevance", "date", or "first_author"
    """
    try:
        handle = Entrez.esearch(
            db="pubmed",
            term=query,
            retmax=max_results,
            sort=sort,
            usehistory="y"  # Enable history for pagination
        )
        record = Entrez.read(handle)
        handle.close()

        total_count = int(record["Count"])
        id_list = record["IdList"]
        webenv = record.get("WebEnv")
        query_key = record.get("QueryKey")

        print(f"Found {total_count} results, returning top {len(id_list)}")
        return id_list, total_count, webenv, query_key

    except Exception as e:
        handle_error(e)
        return [], 0, None, None
```

### 5. Fetch Article Details

```python
def fetch_articles(id_list):
    """Fetch full article details for a list of PMIDs."""
    if not id_list:
        print("No results to fetch.")
        return []

    try:
        handle = Entrez.efetch(db="pubmed", id=id_list, rettype="xml")
        records = Entrez.read(handle)
        handle.close()
    except Exception as e:
        handle_error(e)
        return []

    articles = []
    for article in records.get('PubmedArticle', []):
        medline = article['MedlineCitation']
        pmid = str(medline['PMID'])
        title = medline['Article']['ArticleTitle']

        # Get authors
        authors = medline['Article'].get('AuthorList', [])
        if authors:
            first_author = f"{authors[0].get('LastName', '')} {authors[0].get('Initials', '')}"
            author_str = f"{first_author} et al." if len(authors) > 1 else first_author
        else:
            author_str = "Unknown"

        # Get journal and year
        journal = medline['Article']['Journal']['Title']
        pub_date = medline['Article']['Journal']['JournalIssue'].get('PubDate', {})
        year = pub_date.get('Year', pub_date.get('MedlineDate', 'N/A'))

        # Get full abstract (do not truncate)
        abstract_parts = medline['Article'].get('Abstract', {}).get('AbstractText', [])
        abstract = ' '.join(str(a) for a in abstract_parts)

        # Get MeSH terms
        mesh_list = medline.get('MeshHeadingList', [])
        mesh_terms = [str(m['DescriptorName']) for m in mesh_list[:5]]

        articles.append({
            'pmid': pmid,
            'title': title,
            'authors': author_str,
            'journal': journal,
            'year': year,
            'abstract': abstract,
            'mesh_terms': mesh_terms,
            'link': f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        })

    return articles
```

### 6. Pagination for Large Result Sets

When total results exceed `retmax`, iterate through pages using the WebEnv/QueryKey history:

```python
def fetch_all_pages(webenv, query_key, total_count, batch_size=20, max_pages=5):
    """Iterate through paginated PubMed results.

    Args:
        webenv: WebEnv from initial search (history server)
        query_key: QueryKey from initial search
        total_count: Total number of results
        batch_size: Results per page
        max_pages: Maximum number of pages to fetch (safety limit)
    """
    all_ids = []
    pages_to_fetch = min(max_pages, (total_count + batch_size - 1) // batch_size)

    for page in range(pages_to_fetch):
        retstart = page * batch_size
        try:
            handle = Entrez.esearch(
                db="pubmed",
                term="",  # empty -- uses history
                retstart=retstart,
                retmax=batch_size,
                webenv=webenv,
                query_key=query_key
            )
            record = Entrez.read(handle)
            handle.close()
            all_ids.extend(record["IdList"])

            # Respect rate limits: wait between requests
            time.sleep(0.34)  # 3 requests/sec without API key

        except Exception as e:
            handle_error(e)
            break

    return all_ids
```

### 7. Output Format for WhatsApp

```
*PubMed Search: "CRISPR delivery methods"*
_Found 1,234 results. Top 5:_

*1.* Lipid nanoparticle-mediated CRISPR delivery...
   _Smith J et al. — Nature (2026)_
   PMID: 12345678
   pubmed.ncbi.nlm.nih.gov/12345678

*2.* AAV-based CRISPR therapeutics: advances and challenges
   _Chen L et al. — Cell (2026)_
   PMID: 12345679
   pubmed.ncbi.nlm.nih.gov/12345679
```

When the user requests details on a specific paper, show the full abstract without truncation.

### 8. Follow-up Suggestions

After showing results, suggest:
- "Want me to summarize any of these papers?"
- "Should I search with different keywords?"
- "Want me to find related papers to any of these?"
- "Should I narrow results using MeSH terms?"

## Error Handling

### Rate Limits

NCBI enforces rate limits on the Entrez API:
- **Without API key:** 3 requests per second
- **With API key:** 10 requests per second

Obtain an API key at: https://www.ncbi.nlm.nih.gov/account/settings/

```python
import time

def rate_limited_request(func, *args, **kwargs):
    """Wrap Entrez calls with rate limiting and retry logic."""
    max_retries = 3
    base_delay = 1.0  # seconds

    for attempt in range(max_retries):
        try:
            result = func(*args, **kwargs)
            time.sleep(0.34)  # Enforce 3 req/sec without API key
            return result
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower():
                delay = base_delay * (2 ** attempt)
                print(f"Rate limited. Retrying in {delay}s...")
                time.sleep(delay)
            else:
                raise
    raise Exception("Max retries exceeded for PubMed API request")
```

### Common Errors and Handling

```python
def handle_error(e):
    """Handle common PubMed/Entrez errors."""
    error_msg = str(e)

    if "429" in error_msg or "rate" in error_msg.lower():
        print("Rate limit exceeded. Wait 1-2 seconds and retry.")

    elif "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
        print("Request timed out. PubMed may be slow. Retry with a smaller retmax.")

    elif "HTTP Error 500" in error_msg or "HTTP Error 502" in error_msg:
        print("PubMed server error. Try again in a few minutes.")

    elif "HTTP Error 400" in error_msg:
        print("Bad request. Check query syntax (unmatched quotes, invalid field tags).")

    else:
        print(f"PubMed API error: {error_msg}")
```

### Empty Results

When a search returns zero results:
1. Check for typos in the query
2. Try broader terms (remove filters, use OR instead of AND)
3. Try free-text `[tiab]` instead of `[mesh]` -- the concept may not have a MeSH term
4. Remove date filters to see if older literature exists
5. Suggest alternative search terms to the user

## Search Strategy Tips

### Building Effective Queries

1. **Start with MeSH terms** for well-defined medical concepts
2. **Add free-text synonyms** with OR for comprehensive coverage
3. **Use field tags** to reduce noise: `[tiab]` for title/abstract, `[ti]` for title only
4. **Apply filters** to narrow results: publication type, date range, language

### Systematic Search Pattern

For thorough literature reviews, use this PICO-based approach:

```
("Population terms"[mesh] OR "population synonyms"[tiab])
AND
("Intervention terms"[mesh] OR "intervention synonyms"[tiab])
AND
("Outcome terms"[mesh] OR "outcome synonyms"[tiab])
```

### Date Filtering

```python
# Papers from the last 5 years
term = '"diabetes"[mesh] AND "2021/01/01"[dp] : "2026/12/31"[dp]'

# Relative date filter (last 2 years)
term = '"diabetes"[mesh] AND "last 2 years"[dp]'
```

### Publication Type Filters

- `"review"[pt]` -- Review articles
- `"systematic review"[pt]` -- Systematic reviews
- `"meta-analysis"[pt]` -- Meta-analyses
- `"randomized controlled trial"[pt]` -- RCTs
- `"clinical trial"[pt]` -- Clinical trials
- `"guideline"[pt]` -- Practice guidelines

## Examples

### Example 1: Clinical Question Search

**Question:** What is the evidence for exercise in managing type 2 diabetes?

```python
# Step 1: Identify MeSH terms
# "Type 2 diabetes" -> "Diabetes Mellitus, Type 2"[mesh]
# "Exercise" -> "Exercise"[mesh]

# Step 2: Build query with filters
query = (
    '"Diabetes Mellitus, Type 2"[mesh] '
    'AND "Exercise"[mesh] '
    'AND ("systematic review"[pt] OR "meta-analysis"[pt]) '
    'AND "2021/01/01"[dp] : "2026/12/31"[dp]'
)

# Step 3: Search
ids, total, webenv, qk = search_pubmed(query, max_results=10, sort="relevance")

# Step 4: Fetch and display
articles = fetch_articles(ids)
for i, a in enumerate(articles, 1):
    print(f"{i}. {a['title']}")
    print(f"   {a['authors']} — {a['journal']} ({a['year']})")
    print(f"   {a['link']}")
    print()
```

### Example 2: Drug Safety Search

**Question:** Are there reports of liver toxicity with a specific medication?

```python
query = (
    '"Drug Name"[mesh] '
    'AND ("Chemical and Drug Induced Liver Injury"[mesh] '
    'OR "hepatotoxicity"[tiab] OR "liver injury"[tiab]) '
    'AND ("case reports"[pt] OR "adverse effects"[sh])'
)

ids, total, webenv, qk = search_pubmed(query, max_results=20, sort="date")
articles = fetch_articles(ids)
```

### Example 3: Systematic Review Search (Comprehensive Multi-Term Strategy)

**Question:** Conduct a systematic search on the effect of Mediterranean diet on cardiovascular outcomes.

```python
# Step 1: Define PICO components with MeSH + free-text
population = (
    '("Cardiovascular Diseases"[mesh] OR "cardiovascular"[tiab] '
    'OR "coronary heart disease"[tiab] OR "myocardial infarction"[tiab] '
    'OR "stroke"[tiab] OR "heart failure"[tiab])'
)

intervention = (
    '("Diet, Mediterranean"[mesh] OR "mediterranean diet"[tiab] '
    'OR "mediterranean dietary pattern"[tiab] OR "MedDiet"[tiab])'
)

outcome = (
    '("mortality"[tiab] OR "cardiovascular events"[tiab] '
    'OR "major adverse cardiac events"[tiab] OR "MACE"[tiab] '
    'OR "Mortality"[mesh])'
)

# Step 2: Combine with study type filter
study_filter = '("systematic review"[pt] OR "meta-analysis"[pt] OR "randomized controlled trial"[pt])'

query = f"{population} AND {intervention} AND {outcome} AND {study_filter}"

# Step 3: Search and document
ids, total, webenv, qk = search_pubmed(query, max_results=20, sort="relevance")
articles = fetch_articles(ids)

# Step 4: Document for PRISMA
print(f"PRISMA Search Record:")
print(f"  Database: PubMed")
print(f"  Date: 2026-04-19")
print(f"  Query: {query}")
print(f"  Results: {total}")
print(f"  Retrieved: {len(articles)}")

# Step 5: Assess evidence levels
for a in articles:
    title_lower = a['title'].lower()
    if 'systematic review' in title_lower or 'meta-analysis' in title_lower:
        a['evidence_level'] = 1
    elif 'randomized' in title_lower:
        a['evidence_level'] = 2
    else:
        a['evidence_level'] = 3  # Default; verify manually
```

### Example 4: Drug Safety Search (Adverse Events + FAERS)

**Question:** Are there reports of QT prolongation with azithromycin?

```python
# Step 1: Build drug safety query
drug = '("Azithromycin"[mesh] OR "azithromycin"[tiab] OR "Zithromax"[tiab])'

adverse_event = (
    '("Long QT Syndrome"[mesh] OR "QT prolongation"[tiab] '
    'OR "torsades de pointes"[tiab] OR "cardiac arrhythmia"[tiab] '
    'OR "QTc interval"[tiab])'
)

# Include case reports and adverse effects subheading
safety_filter = '("case reports"[pt] OR "adverse effects"[sh] OR "pharmacovigilance"[tiab])'

query = f"{drug} AND {adverse_event} AND {safety_filter}"

ids, total, webenv, qk = search_pubmed(query, max_results=20, sort="date")
articles = fetch_articles(ids)

# Step 2: Also search for FAERS (FDA Adverse Event Reporting System) references
faers_query = f'{drug} AND ("FAERS"[tiab] OR "FDA adverse event"[tiab] OR "post-marketing surveillance"[tiab])'

faers_ids, faers_total, _, _ = search_pubmed(faers_query, max_results=10)
faers_articles = fetch_articles(faers_ids)

# Step 3: Check for retracted papers in results
for a in articles + faers_articles:
    if check_retraction(a['pmid']):
        a['retracted'] = True
        print(f"WARNING: PMID {a['pmid']} has been retracted!")

# Step 4: Summarize findings by evidence level
print(f"\nDrug Safety Search: Azithromycin + QT Prolongation")
print(f"PubMed results: {total} | FAERS-related: {faers_total}")
print(f"\nNote: Also check the FDA FAERS database directly at:")
print(f"https://www.fda.gov/drugs/questions-and-answers-fdas-adverse-event-reporting-system-faers")
```

### Example 5: Recent Research on a Topic

**Question:** What are the latest studies on long COVID?

```python
query = (
    '("Post-Acute COVID-19 Syndrome"[mesh] OR "long COVID"[tiab] '
    'OR "post-COVID"[tiab]) '
    'AND "last 1 year"[dp]'
)

ids, total, webenv, qk = search_pubmed(query, max_results=15, sort="date")
articles = fetch_articles(ids)
# Show full abstracts for the most recent papers
```

## Systematic Review Support

### PICO Framework

Use the PICO framework to structure clinical research questions before building PubMed queries:

- **P**opulation -- Who is the patient group? (e.g., adults with type 2 diabetes, children under 5)
- **I**ntervention -- What treatment or exposure is being studied? (e.g., metformin, aerobic exercise)
- **C**omparison -- What is the alternative? (e.g., placebo, standard care, no treatment)
- **O**utcome -- What result is being measured? (e.g., HbA1c reduction, mortality, quality of life)

**PICO Example:**

| Component | Clinical Question | PubMed Terms |
|-----------|------------------|--------------|
| **P** | Adults with major depressive disorder | `"Depressive Disorder, Major"[mesh]` |
| **I** | Cognitive behavioral therapy | `"Cognitive Behavioral Therapy"[mesh]` |
| **C** | Pharmacotherapy (SSRIs) | `"Serotonin Uptake Inhibitors"[mesh]` |
| **O** | Remission rates | `"Remission, Spontaneous"[mesh] OR "remission"[tiab]` |

```python
# PICO-based query construction
population = '"Depressive Disorder, Major"[mesh]'
intervention = '("Cognitive Behavioral Therapy"[mesh] OR "CBT"[tiab])'
comparison = '("Serotonin Uptake Inhibitors"[mesh] OR "SSRI"[tiab])'
outcome = '("remission"[tiab] OR "treatment response"[tiab])'

query = f"({population}) AND ({intervention}) AND ({comparison}) AND ({outcome})"
```

### PRISMA-Style Search Documentation

When conducting a systematic review search, document the search strategy using a PRISMA-compatible template. This ensures reproducibility and transparency.

```markdown
## Search Documentation Template

**Database:** PubMed (MEDLINE)
**Date of search:** YYYY-MM-DD
**Search strategy:**

| # | Query Component | Search Terms | Results |
|---|----------------|--------------|---------|
| 1 | Population      | "Diabetes Mellitus, Type 2"[mesh] OR "type 2 diabetes"[tiab] | N |
| 2 | Intervention    | "Exercise"[mesh] OR "physical activity"[tiab] | N |
| 3 | Outcome         | "Glycated Hemoglobin"[mesh] OR "HbA1c"[tiab] | N |
| 4 | Combined (#1 AND #2 AND #3) | — | N |
| 5 | Filtered (RCTs only) | #4 AND "randomized controlled trial"[pt] | N |
| 6 | Date limited    | #5 AND "2020/01/01"[dp] : "2026/12/31"[dp] | N |

**Filters applied:** RCTs, English language, last 6 years
**Total records identified:** N
**Duplicates removed:** N
**Records screened:** N
```

### Combining MeSH and Free-Text for Comprehensive Searches

For systematic reviews, always combine controlled vocabulary (MeSH) with free-text synonyms to maximize recall:

```python
# Pattern: (MeSH term OR free-text synonyms) for each concept
population = (
    '("Hypertension"[mesh] OR "high blood pressure"[tiab] '
    'OR "elevated blood pressure"[tiab] OR "arterial hypertension"[tiab])'
)

intervention = (
    '("Antihypertensive Agents"[mesh] OR "antihypertensive"[tiab] '
    'OR "blood pressure lowering"[tiab])'
)

# Combine with AND
query = f"{population} AND {intervention}"
```

**Why both?** MeSH captures papers indexed with the standard term regardless of the author's wording. Free-text catches recently published articles not yet MeSH-indexed and variant terminology that indexers may not assign.

### Study Type Filters Using [pt]

Use the `[pt]` (publication type) field tag to restrict results to specific study designs:

```python
# Filter for highest-quality evidence
systematic = '"systematic review"[pt]'
meta = '"meta-analysis"[pt]'
rct = '"randomized controlled trial"[pt]'
guideline = '"practice guideline"[pt]'

# Combine for best evidence
best_evidence_filter = f'({systematic} OR {meta} OR {rct} OR {guideline})'
query = f'"Hypertension"[mesh] AND "Exercise"[mesh] AND {best_evidence_filter}'
```

## Study Quality Assessment

### Hierarchy of Evidence

When evaluating search results, consider the level of evidence. Higher levels provide stronger support for clinical decisions:

| Level | Study Design | Strength | Notes |
|-------|-------------|----------|-------|
| **1** | Systematic reviews and meta-analyses | Highest | Synthesize multiple studies; check for heterogeneity |
| **2** | Randomized controlled trials (RCTs) | High | Gold standard for interventions; check for adequate blinding |
| **3** | Cohort studies | Moderate | Prospective > retrospective; watch for confounders |
| **4** | Case-control studies | Moderate-Low | Useful for rare outcomes; prone to recall bias |
| **5** | Case series / case reports | Low | Hypothesis-generating only; no control group |
| **6** | Expert opinion / editorials | Lowest | No original data; useful for context only |

### Key Quality Indicators

When reviewing individual studies from search results, assess these indicators:

**For RCTs:**
- **Sample size** -- Was the study adequately powered? Look for power calculations in the methods
- **Randomization** -- Was allocation truly random? Was it concealed from investigators?
- **Blinding** -- Double-blind > single-blind > open-label
- **Intention-to-treat analysis** -- Were all randomized participants included in the analysis?
- **Follow-up** -- Was dropout rate < 20%? Were dropouts accounted for?

**For Systematic Reviews:**
- **Comprehensive search** -- Were multiple databases searched? Was grey literature included?
- **Risk of bias assessment** -- Was study quality evaluated (e.g., Cochrane Risk of Bias tool)?
- **Heterogeneity** -- Was I-squared reported? (I² > 75% = substantial heterogeneity)
- **Publication bias** -- Was a funnel plot or Egger's test reported?

**For Observational Studies:**
- **Confounding** -- Were key confounders adjusted for?
- **Selection bias** -- How were participants recruited?
- **Exposure measurement** -- Was it self-reported or objectively measured?

### Identifying Retracted Papers

Always check for retractions before citing a paper:

```python
def check_retraction(pmid):
    """Check if a paper has been retracted."""
    # Method 1: Search for retraction notice
    query = f'"{pmid}"[pmid] AND "retracted publication"[pt]'
    handle = Entrez.esearch(db="pubmed", term=query)
    record = Entrez.read(handle)
    handle.close()

    if int(record["Count"]) > 0:
        return True  # Paper has been retracted

    # Method 2: Check Retraction Watch database
    # https://retractionwatch.com/retracted-coronavirus-covid-19-papers/
    # (manual check recommended for critical citations)

    return False
```

**Other retraction resources:**
- Retraction Watch Database: https://retractiondatabase.org/
- PubMed marks retracted articles with `[Retracted]` in the title
- Always verify by clicking the PubMed link -- retraction notices appear prominently

## Output Format

### Structured Search Results Template

Format search results consistently using this structure:

**Markdown format:**

```markdown
## PubMed Search Results

**Query:** "Diabetes Mellitus, Type 2"[mesh] AND "Exercise"[mesh] AND "systematic review"[pt]
**Date searched:** 2026-04-19
**Total results:** 87
**Showing:** Top 5 by relevance

---

### 1. [Title of the article](https://pubmed.ncbi.nlm.nih.gov/PMID/)

- **Authors:** Smith J, Chen L, et al.
- **Journal:** *The Lancet Diabetes & Endocrinology* (2026)
- **PMID:** 12345678
- **Type:** Systematic Review | **Evidence Level:** 1
- **MeSH:** Diabetes Mellitus, Type 2; Exercise; Glycated Hemoglobin
- **Abstract:** [Full abstract text here]

---
```

**JSON format (for programmatic use):**

```json
{
  "query": "search query used",
  "date_searched": "2026-04-19",
  "total_results": 87,
  "results_shown": 5,
  "articles": [
    {
      "rank": 1,
      "pmid": "12345678",
      "title": "Title of the article",
      "authors": "Smith J, Chen L, et al.",
      "journal": "The Lancet Diabetes & Endocrinology",
      "year": "2026",
      "publication_type": "Systematic Review",
      "evidence_level": 1,
      "mesh_terms": ["Diabetes Mellitus, Type 2", "Exercise"],
      "abstract": "Full abstract text...",
      "link": "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      "retracted": false,
      "free_full_text": true
    }
  ]
}
```

## Anti-Patterns

- **Returning raw tool output** -- Do not dump unformatted Entrez XML or JSON to the user; always parse and format results into readable citation lists.
- **Ignoring retmax limits** -- Do not fetch hundreds of articles at once; keep `retmax` reasonable (10-20) to avoid API throttling and overwhelming the user.
- **Omitting PubMed links** -- Every result must include a direct `pubmed.ncbi.nlm.nih.gov` link; never present citations without a way to verify the source.
- **Using vague search terms** -- Do not search with overly broad single-word queries (e.g., "cancer"); always construct specific queries using MeSH terms, title/abstract fields, or filters.
- **Skipping date filters for recency requests** -- When the user asks for "recent" studies, always apply a date filter; do not rely on default sort order alone.
- **Presenting results without context** -- Do not list papers without mentioning total result count, search terms used, and any filters applied.
- **Truncating abstracts arbitrarily** -- Do not cut abstracts at a fixed character count; show the full abstract when the user requests paper details, or provide a meaningful summary.
- **Hardcoding email addresses** -- Always use the project's configured email or an environment variable; never embed personal email addresses in code.
- **Ignoring API errors** -- Always wrap Entrez calls in error handling; check for rate limits, timeouts, and server errors before retrying or reporting to the user.
- **Citing retracted papers** -- Always check retraction status before presenting a paper as evidence; retracted papers can mislead clinical decisions.
- **Skipping PICO structuring** -- Do not jump straight to keyword searches for clinical questions; always decompose the question using PICO first to ensure comprehensive coverage.
- **Using free-text only** -- Do not rely exclusively on free-text `[tiab]` searches; always combine with MeSH terms to capture papers indexed under the controlled vocabulary.

## References

- PubMed Search Guide: https://pubmed.ncbi.nlm.nih.gov/help/
- MeSH Browser: https://meshb.nlm.nih.gov/search
- NCBI Entrez Programming Utilities: https://www.ncbi.nlm.nih.gov/books/NBK25501/
- PubMed Field Tags Reference: https://pubmed.ncbi.nlm.nih.gov/help/#search-tags
- PRISMA Statement: https://pubmed.ncbi.nlm.nih.gov/19621072/ (PMID: 19621072)
- Cochrane Handbook for Systematic Reviews: https://pubmed.ncbi.nlm.nih.gov/29431050/ (PMID: 29431050)
- Levels of Evidence in Medical Literature: https://pubmed.ncbi.nlm.nih.gov/19399825/ (PMID: 19399825)
- Retraction Watch Database: https://retractiondatabase.org/
- NCBI API Key Registration: https://www.ncbi.nlm.nih.gov/account/settings/
