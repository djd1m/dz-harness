# Observable scenarios
## FR-1 / NFR-4: Second consumer
GIVEN an unrelated product FAQ corpus WHEN built/opened from installed tarball THEN IDs come only from that corpus and no DZ/site path is required.
## FR-2: Snapshot identity
GIVEN changed catalog revision/model/dimensions/content WHEN open/query THEN invalid snapshot is rejected before paid selection.
## FR-3: Search outage
GIVEN embedding timeout or search unavailable WHEN asking a task THEN baseline retrieval is used with explicit degraded metadata/log code; credentials/user text are not logged.
## FR-4: Supported context
GIVEN source explicitly says context includes alternatives WHEN user requests short ADR with alternatives THEN selector must not call that missing. GIVEN request includes implementing an unrelated payment transfer THEN it must not silently recommend full coverage.
## FR-5 / NFR-1 / NFR-2: Containers
GIVEN stopped advisor/search WHEN website static routes served THEN they still work. Search has no public ports/key; advisor alone sees secret and admission state; restart preserves attempts and origins rejected before paid calls.
