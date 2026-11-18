# Conditional first-set recommendation

A user asks for deployment followed by monitoring. The selector finds current catalog entries and reads source evidence for a deploy skill and a distinct watch skill. Its draft implies monitoring starts even after deployment fails. An independent reviewer identifies that ordering as misleading.

The editor changes only the order: run the watch skill after successful deployment verification. A fresh reviewer checks the entire changed payload against the original task and sources. If that review fails, stop after this single repair. Skill names and installation commands must come from the current catalog and target-specific sources; the example does not assert that any particular entry exists.
