# Selecting documented passages by ID

The advisor gives the selector up to twelve short literal passages per candidate. The selector chooses a passage ID for a requirement and can pair several independent requirements with one scenario. The host resolves the ID against the exact input sent to the model and verifies ownership, the requirement text, action coverage and unambiguous conflicts with the final missing parts. The public response still contains ordinary text. IDs and full selector input remain internal. None of these contract checks proves that a supplied passage substantiates a requirement or that the model enumerated every essential requirement. Independent semantic review covers that distinction.

The search index remains the 8,926-document BGE-M3 snapshot. The evidence-selection layer ranks short passages from the hash-bound documentation and the existing retrieved source windows. No extra model call is required for a recommendation. The [trial receipts](evidence/passage-trial.json) retain the frozen tasks, visible answers, reviewer decisions, exact source fingerprints and bounded provider diagnostics.

## First pass

| Result | Known cases | Fresh cases |
|---|---:|---:|
| All required skills in raw search | 6/6 | 6/6 |
| All required skills in candidate shortlist | 6/6 | 5/6 |
| Independent semantic pass | 2/6 | 3/6 |

The same stored vectors were reused for the known cases. The six new tasks were written independently from source documents, with distinct query formulations. Grafana and Hermes passed with several details in their respective cards. One fresh academic compound case lost its second required skill during grouping. In the Compose case no offered passage for the selected package contained `service_healthy`, though the source documents it. This identifies a source-selection gap even when the correct skill is in the shortlist.

The first pass recorded four incomplete completions and one `detail-requirement` rejection. In particular, the earlier successful `pr-review` plus `ci-fix` replay did not return a complete answer this time. The new and prior fresh samples differ. Their scores do not establish an overall quality change.

## Focused replay with lower reasoning effort

The four incomplete cases were repeated against the exact same vectors and serialized selector input. The private runner added `reasoning.effort=low` to the provider request. One response completed, with an insufficient Compose explanation. The other three ended with provider reason `length`, each at the 1,800-token limit. Recorded reasoning consumption was 1,486, 1,800 and 1,533 tokens respectively. The low setting is therefore insufficient as a reliability fix on these cases and remains a diagnostic override.

Combined spend was $0.043353546 under a single $0.06 cap. The evaluated changes passed 105 advisor tests, 10 hybrid tests and four assembly and isolated-container checks. A stubbed browser response verified multiple details shown as inert text, the explicit gap and the old response shape at 390 and 1440 pixels. The measured runtime remains a draft and the public advisor remains on its prior pilot.

The next implementation should reduce the amount of candidate and requirement text the selector must process and generate. Separately measure whether the compact input carries the particular cited detail for each requirement, then test completion and semantics again before considering broad acceptance.

The [compact-input trial](COMPACT-TRIAL.md) follows up on the output-limit failures and preserves an independent comparison of completion, contract validation and semantic coverage.
