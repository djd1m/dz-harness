---
name: health-advisor-clinicaltrials-database
description: "Query ClinicalTrials.gov via API v2. Search trials by condition, drug, location, status, or phase. Retrieve trial details by NCT ID, export data, for clinical research and patient matching."
---

# ClinicalTrials.gov Database

## Overview

ClinicalTrials.gov is a comprehensive registry of clinical studies conducted worldwide, maintained by the U.S. National Library of Medicine. This skill provides access to API v2 to search for trials, retrieve detailed study information, filter by various criteria, and export data for analysis. The API is public (no authentication required) with rate limits of ~50 requests per minute, supporting JSON and CSV formats.

## When to Use This Skill

This skill should be used when working with clinical trial data in scenarios such as:

- **Patient matching** - Finding recruiting trials for specific conditions or patient populations
- **Research analysis** - Analyzing clinical trial trends, outcomes, or study designs
- **Drug/intervention research** - Identifying trials testing specific drugs or interventions
- **Geographic searches** - Locating trials in specific locations or regions
- **Sponsor/organization tracking** - Finding trials conducted by specific institutions
- **Data export** - Extracting clinical trial data for further analysis or reporting
- **Trial monitoring** - Tracking status updates or results for specific trials
- **Eligibility screening** - Reviewing inclusion/exclusion criteria for trials

## Quick Start

### Basic Search Query

Search for clinical trials using the helper script:

```bash
cd scripts/
python3 query_clinicaltrials.py
```

Or use Python directly with the `requests` library:

```python
import requests

url = "https://clinicaltrials.gov/api/v2/studies"
params = {
    "query.cond": "breast cancer",
    "filter.overallStatus": "RECRUITING",
    "pageSize": 10
}

response = requests.get(url, params=params)
data = response.json()

print(f"Found {data['totalCount']} trials")
```

### Retrieve Specific Trial

Get detailed information about a trial using its NCT ID:

```python
import requests

nct_id = "NCT04852770"
url = f"https://clinicaltrials.gov/api/v2/studies/{nct_id}"

response = requests.get(url)
study = response.json()

# Access specific modules
title = study['protocolSection']['identificationModule']['briefTitle']
status = study['protocolSection']['statusModule']['overallStatus']
```

## Core Capabilities

### 1. Search by Condition/Disease

Find trials studying specific medical conditions or diseases using the `query.cond` parameter.

**Example: Find recruiting diabetes trials**

```python
from scripts.query_clinicaltrials import search_studies

results = search_studies(
    condition="type 2 diabetes",
    status="RECRUITING",
    page_size=20,
    sort="LastUpdatePostDate:desc"
)

print(f"Found {results['totalCount']} recruiting diabetes trials")
for study in results['studies']:
    protocol = study['protocolSection']
    nct_id = protocol['identificationModule']['nctId']
    title = protocol['identificationModule']['briefTitle']
    print(f"{nct_id}: {title}")
```

### 2. Search by Intervention/Drug

Search for trials testing specific interventions, drugs, devices, or procedures using the `query.intr` parameter.

**Example: Find Phase 3 trials testing Pembrolizumab**

```python
from scripts.query_clinicaltrials import search_studies

results = search_studies(
    intervention="Pembrolizumab",
    status=["RECRUITING", "ACTIVE_NOT_RECRUITING"],
    page_size=50
)

phase3_trials = [
    study for study in results['studies']
    if 'PHASE3' in study['protocolSection'].get('designModule', {}).get('phases', [])
]
```

### 3. Geographic Search

Find trials in specific locations using the `query.locn` parameter.

```python
from scripts.query_clinicaltrials import search_studies

results = search_studies(
    condition="cancer",
    location="New York",
    status="RECRUITING",
    page_size=100
)
```

### 4. Search by Sponsor/Organization

Find trials conducted by specific organizations using the `query.spons` parameter.

### 5. Filter by Study Status

Filter trials by recruitment or completion status using the `filter.overallStatus` parameter.

**Valid status values:**
- `RECRUITING` - Currently recruiting participants
- `NOT_YET_RECRUITING` - Not yet open for recruitment
- `ENROLLING_BY_INVITATION` - Only enrolling by invitation
- `ACTIVE_NOT_RECRUITING` - Active but no longer recruiting
- `SUSPENDED` - Temporarily halted
- `TERMINATED` - Stopped prematurely
- `COMPLETED` - Study has concluded
- `WITHDRAWN` - Withdrawn prior to enrollment

### 6. Retrieve Detailed Study Information

Get comprehensive information about specific trials including eligibility criteria, outcomes, contacts, and locations.

### 7. Pagination and Bulk Data Retrieval

Handle large result sets efficiently using pagination with `search_with_all_results()`.

### 8. Data Export to CSV

Export trial data to CSV format for analysis in spreadsheet software or data analysis tools.

## Resources

### scripts/query_clinicaltrials.py

Comprehensive Python script providing helper functions for common query patterns:

- `search_studies()` - Search for trials with various filters
- `get_study_details()` - Retrieve full information for a specific trial
- `search_with_all_results()` - Automatically paginate through all results
- `extract_study_summary()` - Extract key information for quick overview

Run the script directly for example usage:

```bash
python3 scripts/query_clinicaltrials.py
```

## Best Practices

### Rate Limit Management

The API has a rate limit of approximately 50 requests per minute. For bulk data retrieval:

1. Use maximum page size (1000) to minimize requests
2. Implement exponential backoff on rate limit errors (429 status)
3. Add delays between requests for large-scale data collection

### Data Structure Navigation

The API response has a nested structure. Key paths to common information:

- **NCT ID**: `study['protocolSection']['identificationModule']['nctId']`
- **Title**: `study['protocolSection']['identificationModule']['briefTitle']`
- **Status**: `study['protocolSection']['statusModule']['overallStatus']`
- **Phase**: `study['protocolSection']['designModule']['phases']`
- **Eligibility**: `study['protocolSection']['eligibilityModule']`
- **Locations**: `study['protocolSection']['contactsLocationsModule']['locations']`
- **Interventions**: `study['protocolSection']['armsInterventionsModule']['interventions']`

### Error Handling

Always implement proper error handling for network requests:

```python
import requests

try:
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
except requests.exceptions.HTTPError as e:
    print(f"HTTP error: {e.response.status_code}")
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
except ValueError as e:
    print(f"JSON decode error: {e}")
```

## Technical Specifications

- **Base URL**: `https://clinicaltrials.gov/api/v2`
- **Authentication**: Not required (public API)
- **Rate Limit**: ~50 requests/minute per IP
- **Response Formats**: JSON (default), CSV
- **Max Page Size**: 1000 studies per request
- **Date Format**: ISO 8601
- **Text Format**: CommonMark Markdown for rich text fields
- **API Version**: 2.0 (released March 2024)
- **API Specification**: OpenAPI 3.0

## Anti-Patterns

1. **Ignoring rate limits** — Sending more than 50 requests per minute will result in 429 errors and potential IP throttling; always implement backoff and use max page sizes.
2. **Hardcoding NCT IDs without validation** — NCT IDs can be withdrawn or merged; always verify trial existence before referencing in reports.
3. **Assuming all fields are present** — Not all trials have complete data; always use `.get()` with defaults to avoid KeyError crashes.
4. **Downloading entire database via pagination** — ClinicalTrials.gov has 400,000+ studies; use targeted filters instead of bulk retrieval unless specifically needed.
5. **Treating trial status as static** — Recruitment status changes frequently; cache results for no more than 24 hours for active trial searches.
6. **Presenting raw eligibility criteria to patients** — Eligibility text is written for clinicians; it requires interpretation before sharing with patients.

## Dependencies

- **Runtime**: Python 3.8+
- **Libraries**: `requests` (>=2.25.0)
- **Tools**: Shell command execution for running `query_clinicaltrials.py`
- **External APIs**: ClinicalTrials.gov API v2 (`https://clinicaltrials.gov/api/v2`) — public, no API key required
- **Other Skills**: None

## References

- ClinicalTrials.gov API v2 Documentation: https://clinicaltrials.gov/data-api/api
- Zarin DA, Tse T, Williams RJ, Califf RM, Ide NC. The ClinicalTrials.gov results database — update and key issues. *N Engl J Med.* 2011;364(9):852-860. [PMID: 21666480](https://pubmed.ncbi.nlm.nih.gov/21666480/)
