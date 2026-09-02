# Orchestrator

Use one immutable input pair: `demo.json` describes user actions and words; `demo-site.config.json`
owns encoding and limits. Complete the stages in order: preflight, recording, montage, site, budget,
then publication. A failed stage invalidates every downstream receipt. Keep raw recordings outside
the site, while the final MP4 and optional WebM belong in the public site only after approval.
