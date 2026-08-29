# Module 00 — Intake (skill: explore)

Goal: collect a complete **Trip Brief** before any research. Use `explore` to clarify, but for a
trip the required fields are fixed (see SKILL.md "Required Inputs") — ask only for what's missing.

Required: city + #days · dates · arrival (time/transport/from) · departure (time/transport) ·
lodging address · party size · constraints (alcohol / diet / kids / per-day budget / mobility).

Output: a Trip Brief object with all fields filled and **constraints listed explicitly as hard
filters**. Do NOT proceed to research while a required field is missing — ask the user.

Checkpoint: "Trip Brief ready — N days in <city>, party <P>, constraints: <list>. Proceed to research?"
