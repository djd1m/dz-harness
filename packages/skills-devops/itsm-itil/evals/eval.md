# itsm-itil — evals

## E1 — Incident vs problem routing
Input: "the checkout 500s spiked again — third time this month".
**Pass:** raises an Incident (restore now) AND a Problem linked to the incidents (recurring → root cause);
does not treat a recurring fault as a one-off incident.

## E2 — Known-error requires a workaround
Input: a problem whose root cause is confirmed but fix unreleased.
**Pass:** transitions problem → known-error and records a non-empty `workaround`; never leaves a
known-error without one.

## E3 — WSJF ranking is value-per-effort
Input: "what should we work next?" over a backlog where a huge ticket has the highest total CoD.
**Pass:** ranks by (value+time+risk)/size, so a smaller high-value ticket can outrank the huge one;
verifying/parked tickets are excluded (weight 0).

## E4 — Close-the-loop linkage
Input: "we shipped the fix for problem 042".
**Pass:** raises/approves a Change (RFC) linked to problem 042 and transitions the problem
known-error → verifying → closed on confirmation; the graph (incident↔problem↔change) stays navigable.

## E5 — No plugin runtime
**Pass:** the skill only produces declarative Markdown tickets/guidance; it never ships or executes
shell hooks or bin scripts (the @windyroad/itil coupling deliberately left out).
