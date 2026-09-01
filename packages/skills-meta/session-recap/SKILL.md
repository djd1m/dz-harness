---
name: session-recap
description: >
  Mid-session status protocol for refreshing potentially stale run state and then reporting exactly
  four points without starting new work. Use for "session-recap", "mid-session status check",
  "status during this session", "where do we actually stand", "статус посреди сессии", or
  "дай статус этой сессии". Do not use for calendar-window delivery retrospectives.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# Session Recap

Give a fresh, evidence-disciplined status report in the middle of an active session, without changing
the state being reported.

## What this is — and what it is NOT (`dz recap`)

`dz recap` is a records-only retrospective over a calendar window; `session-recap` is a live
mid-session status protocol with no persisted state and no time window. They answer different
questions, and neither reads the other's output.

## When to Use / When NOT to Use

Use this protocol when the requester asks where an active session or set of related workstreams
really stands. It may run at any point mid-session; it is not tied to session end or to a hook.

Do not use it for an end-of-session wrap-up or for questions such as "what did we ship this month?".
Those are calendar-window retrospective requests for `dz recap`.

## Step 1 — Refresh first (1-2 minutes, mandatory)

Before reporting anything, spend a bounded 1-2 minutes refreshing only potentially stale state that
is already part of this session:

- running jobs and background runs;
- open pull requests already associated with the work;
- related threads or conversations already linked in the session.

Use read-only status checks. Do not start a new investigation, expand scope, or open unrelated work.
Skipping straight to the four points is a protocol violation. If a status source cannot be reached
within the time box, report that gap as an unknown instead of guessing.

## Step 2 — Exactly four points

Return exactly these four numbered points, in this order—no preamble, appendix, or extra status point:

1. **Goal — in the requester's own words.** Quote the actual words of the person who asked. Do not
   paraphrase or replace them with your own restatement. If their exact words are unavailable, say
   that they are unavailable; do not invent a quote.
2. **Where things really stand — with proof.** Name the observed state and put its reproducer next
   to the claim: the command, query, artifact, or live status check another person can repeat.
   **Proof = a reproducer; a green test run is NOT proof of status on its own.** A passing test may
   support a narrower test claim, but it does not prove the broader work status.
3. **What is blocked on whom.** Use two explicit buckets: **Blocked on the human** and **Blocked on
   the machine/technical state**. Write `none observed` for an empty bucket; never collapse them
   into one generic blocker list.
4. **Next steps — short and owned.** List only the immediate next steps. Tag every item with exactly
   one owner: `[Claude]` or `[owner]`.

## Step 3 — No new work during the recap

Producing a session recap is read-only over existing state. Do not start, fix, build, dispatch, or
otherwise begin new work during the recap or immediately after it in the same turn. End the turn
after the four points. If the request mixes a recap with a request to continue or start work, provide
the recap first and ask for confirmation before touching the requested work in a later turn.

## Stateless by Construction

Do not create or update persisted recap state: no `.dz/` access, configuration entry, recap-mode
marker, checkpoint, or output file. Read no unrelated file; use only conversation context and the
already-known live status surfaces refreshed in Step 1.

## The Protocol in One Line

Refresh → their words → proof → blocked-on-who → owned next steps; then stop without starting work.
