## ADDED Requirements
### Requirement: Reusable snapshot search
The search module SHALL accept generic ID/text/vector documents independently of the DZ catalog and provider credentials.
#### Scenario: Unrelated consumer
- **WHEN** another project imports the packed module with its own FAQ corpus
- **THEN** it can build, reopen and search its own documents without DZ or website sources
### Requirement: Bound snapshot identity
The search service SHALL bind revision, model, dimension, lexicalizer and document content to the opened snapshot.
#### Scenario: Stale revision
- **WHEN** a request expects a different source revision
- **THEN** it is rejected before results reach model selection
### Requirement: Bounded degradation
The advisor SHALL use lexical fallback only for availability failures and preserve existing output/source verification.
#### Scenario: Search unavailable
- **WHEN** the private search cannot be reached before its deadline
- **THEN** the advisor uses current lexical retrieval and records degraded metadata without user text or credentials
### Requirement: Isolated paid service
Search and advisor SHALL run separately from the static website; search SHALL have no provider key/public port and advisor SHALL preserve both existing durable ledgers.
#### Scenario: Restart
- **WHEN** the advisor restarts against existing state
- **THEN** previously reserved calls remain counted and missing state prevents startup
### Requirement: Source-supported selection
The selector SHALL interpret supplied evidence as context for the card's promised outcome without broadening narrow scenario boundaries.
#### Scenario: Already chosen decision
- **WHEN** the user requests a short ADR including alternatives and the evidence defines context as including alternatives
- **THEN** alternatives are not reported as missing capability
