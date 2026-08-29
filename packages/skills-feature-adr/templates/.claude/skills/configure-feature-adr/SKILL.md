---
name: configure-feature-adr
description: |
  Guided, conversational setup that makes feature-adr aware of THIS product — vision, architecture map,
  testing/verification rules, and (optionally) a review critic — WITHOUT the user knowing any manifest schema.
  Complex inside, simple outside.

  TRIGGERS: "настрой feature-adr под мой продукт", "помоги настроить feature-adr", "configure feature-adr
  for my product", "какие документы нужны для feature-adr и куда их добавить", "onboard feature-adr".

  Uses the deterministic engine `dz feature-adr-setup` (plan → scaffold-from-spec, propose-confirm,
  augment-never-clobber). Reuses `dz architecture` (map) and `dz mr-rakes --gen-critic` (auto critic).
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

# Configure feature-adr for this product

Turn a generic feature-adr into a **project-aware** one by scaffolding four committed files under
`architecture/` and wiring `project-skills.json` — through a short conversation, not a schema lesson.

**Golden rule:** you NEVER hand-write manifest JSON in front of the user, and you NEVER overwrite an existing
file. The engine scaffolds; you interview only for what can't be auto-derived.

## Protocol

### 1. Read the current state (never writes)
```bash
dz feature-adr-setup --plan --json
```
Report in plain language: which of `vision.md` / `subsystems.manifest.json` / `testing.md` /
`project-skills.json` already exist, how many workspace packages were discovered (a map can be
auto-scaffolded), and whether a review corpus exists (a critic can be auto-generated). Tell the user exactly
which documents are still missing — this is the "which docs, and where?" answer.

### 2. Auto-derive what you can (confirm, don't dictate)
- **Map:** take the discovered packages and propose a starter subsystem grouping (foundation / arsenal / your
  app subsystems). Show it; ask the user to rename/split to their real subsystems. (Their product, their call.)
- **Critic (optional):** if a review corpus exists, offer to run `dz mr-rakes --gen-critic
  architecture/project-critic/SKILL.md --apply` to generate the critic role from their recurring rakes.

### 3. Short interview — only the un-derivable
Ask, ONE topic at a time (this is the whole point of the skill — keep it to a handful of questions):
- **Product vision** — what the product IS (one paragraph), where it's going, and 1-3 things it consciously
  does NOT do. Seed your draft from the repo README's "why/what" section, then confirm.
- **Testing / verification** — the commands that prove "done" here (e.g. `pnpm test -- --run`), what "done"
  means in this project, and any required gates (coverage, lint, typecheck). This becomes the `testing` role.
- **Optional roles** — ask briefly whether they have a code implementation bar (`impl-bar`) or brand/UI rules
  (`brand`) to point at; skip if not.

### 4. Fill the SPEC and scaffold (propose-confirm)
Write the collected answers to a spec file, then preview:
```bash
# spec shape: { vision:{core,direction?,boundaries?[],principles?[]}, testing:{commands?[],doneDefinition?,gates?[]},
#               subsystems:[…], roles:{critic?:"auto"|path, brand?:path, "impl-bar"?:path}, extra?:[…] }
dz feature-adr-setup --from-spec /tmp/feature-adr-spec.json          # preview: create / augment / unchanged per file
```
Show the preview. An **existing file is `unchanged` (never clobbered)**; a structured file is **augmented**
(existing content kept, new added). On the user's explicit "yes":
```bash
dz feature-adr-setup --from-spec /tmp/feature-adr-spec.json --apply
```

### 5. Verify + hand off
```bash
dz project-skills          # confirm the roles resolve (product-vision, testing, critic, …)
dz architecture --revise   # confirm no drift
```
Tell the user: from now on every `/feature-adr` in this repo folds their vision into design + QE, their
testing rules into Step 8, and their critic into review — automatically. Re-run this skill any time the
product grows; it only augments (new packages, fresh rakes), never overwrites.

## Notes
- **Re-run = update.** The same flow, idempotent: step 1 surfaces only what's new.
- **Nothing is written without the user's confirmation**, and no hand-edited file is ever overwritten.
- If `dz` is not set up, install it first (`npm i -g @dzhechkov/harness-cli`); the engine needs `dz` ≥ 0.3.116.
