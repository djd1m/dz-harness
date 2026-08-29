---
name: health-advisor-clinpgx
description: "Query the ClinPGx REST API for pharmacogenomic data. Look up gene-drug interactions, clinical annotations, CPIC guidelines, and FDA drug labels with pharmacogenomic information."
---

# ClinPGx — Pharmacogenomics Agent

## Overview

ClinPGx is a specialized pharmacogenomics agent that queries the ClinPGx REST API for gene-drug interactions and clinical evidence. It retrieves allele definitions, clinical annotations, CPIC/DPWG guidelines, and FDA drug label pharmacogenomic information. The tool supports batch queries using comma-separated gene symbols or drug names, with built-in rate limiting and local caching.

## When to Use This Skill

- Looking up pharmacogenes (e.g., CYP2D6, CYP2C19) and their allele variants
- Searching for drugs with pharmacogenomic relevance (e.g., warfarin, codeine)
- Analyzing gene-drug interaction pairs with CPIC evidence levels
- Retrieving clinical practice guidelines for gene-drug combinations
- Finding FDA-approved drug labels with pharmacogenomic information
- Generating pharmacogenomics reports for clinical or research use

## Quick Start

### Single Gene Query

```bash
python3 clinpgx.py --gene CYP2D6 --output report/
```

### Batch Query

```bash
python3 clinpgx.py --genes "CYP2D6,CYP2C19" --drugs "warfarin" --output report/
```

### Demo Mode

```bash
python3 clinpgx.py --demo --output /tmp/clinpgx_demo
```

## Core Capabilities

### 1. Gene Lookup

Query genes by HGNC symbol to retrieve allele definitions, clinical annotations, guidelines, and drug labels.

```python
from clinpgx import ClinPGxClient, query_gene

client = ClinPGxClient(cache_dir=Path("~/.clawbio/clinpgx_cache"))
result = query_gene(client, "CYP2D6")
```

### 2. Drug Lookup

Search drugs by name to find associated pharmacogenomic data.

```python
from clinpgx import ClinPGxClient, query_drug

client = ClinPGxClient(cache_dir=Path("~/.clawbio/clinpgx_cache"))
result = query_drug(client, "warfarin")
```

### 3. Clinical Annotations

Retrieve curated variant-drug-phenotype clinical annotations with evidence levels (1A, 1B, 2A, 2B, 3, 4).

### 4. CPIC/DPWG Guidelines

Access clinical practice guidelines with dosing recommendations for specific gene-drug combinations.

### 5. FDA Drug Labels

Find pharmacogenomic information from FDA-approved drug labels, including testing level classifications.

## Output Formats

- **Markdown report** (`report.md`) — Full formatted report with tables
- **CSV tables** (`tables/`) — Structured data for clinical annotations, guidelines, and drug labels
- **JSON** (`result.json`) — Standardized machine-readable output
- **Text summary** — Console output for quick review

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `data/gene` | Gene information and allele definitions |
| `data/chemical` | Drug/chemical search |
| `data/clinicalAnnotation` | Clinical annotations |
| `data/guidelineAnnotation` | CPIC/DPWG guidelines |
| `data/label` | FDA/EMA drug labels |
| `data/variantAnnotation` | Variant annotations |

## Technical Specifications

- **Base URL**: `https://api.clinpgx.org/v1`
- **Authentication**: Not required (public API)
- **Rate Limit**: 2 requests/second (enforced by client)
- **Cache**: 24-hour local file cache (configurable)
- **License**: CC BY-SA 4.0 (attribution required in all reports)

## Anti-Patterns

1. **Exceeding rate limits** — The API allows only 2 requests per second; disable caching only when necessary and never parallelize requests without throttling.
2. **Using raw API output for clinical decisions** — ClinPGx is a research and educational tool, not a medical device; all results require professional interpretation.
3. **Ignoring evidence levels** — Not all clinical annotations carry equal weight; Level 1A annotations have strong evidence while Level 3-4 are preliminary.
4. **Querying without caching for repeated analyses** — The 24-hour cache exists to reduce API load and speed up workflows; disabling it for unchanged queries wastes resources.
5. **Omitting CC BY-SA 4.0 attribution** — All data sourced from ClinPGx (PharmGKB + CPIC + PharmCAT) requires proper attribution in outputs.
6. **Assuming comprehensive coverage** — Not all genes or drugs have pharmacogenomic data; always check the `found` flag in results before processing.

## Dependencies

- **Runtime**: Python 3.10+
- **Libraries**: `requests` (>=2.28.0)
- **Tools**: Shell command execution for CLI usage
- **External APIs**: ClinPGx REST API v1 (`https://api.clinpgx.org/v1`) — public, no API key required
- **Other Skills**: None (standalone; optionally integrates with `clawbio.common.report` for standardized output)

## Disclaimer

*ClinPGx/ClawBio is a research and educational tool. It is not a medical device and does not provide clinical diagnoses. Consult a healthcare professional before making any medical decisions.*
