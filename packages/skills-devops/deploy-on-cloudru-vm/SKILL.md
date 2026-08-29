---
name: "deploy-on-cloudru-vm"
description: >
  Repo URL → running app on a Cloud.ru VM, one conversation: clone & analyze any GitHub/GitLab
  repo, ensure/synthesize a docker-compose.yml, collect the four required Cloud.ru credentials
  (asking the user for anything missing), deploy via the cloudru-vm CLI, verify health, and hand
  back the public IP / connection URL / ssh string. Wraps github.com/djd1m/cloudru-vm-cli
  (binary `cloudru-vm`). Triggers on: "задеплой в cloud.ru", "deploy to cloud.ru",
  "разверни репозиторий на ВМ", "deploy this repo to a VM", "cloudru deploy",
  "дай ссылку на подключение".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# Deploy to Cloud.ru VM

Take a repository URL, understand what it is, and get it **running on a Cloud.ru VM with a public
IP** — asking the user only for what cannot be discovered. The heavy lifting of provisioning is
done by [`cloudru-vm`](https://github.com/djd1m/cloudru-vm-cli) (MIT, Go); this skill supplies the
intelligence the CLI deliberately doesn't: repo analysis, compose synthesis, credential
collection, and honest verification.

> **Division of labor:** `cloudru-vm deploy` takes a **docker-compose project** and does
> auth → VM provisioning → floating IP → SFTP → `docker compose up -d` → health-check.
> Everything before that (is this repo deployable? what does its compose look like?) and after
> (is the thing actually serving? what URL do I give the user?) is this skill's protocol.

## When to use

- "Вот репозиторий по ссылке — изучи и задеплой в cloud.ru на ВМ, дай ссылку на подключение"
- Deploying any GitHub/GitLab repo (own or third-party) to a fresh Cloud.ru VM
- Re-deploying after changes (`cloudru-vm` skips provisioning when the compose hash is unchanged)
- Checking on / tearing down a previous deployment (`status`, `logs`, `destroy`)

## When NOT to use

- Kubernetes-shaped workloads (many services, autoscaling) → use the `kubernetes` skill; this
  targets ONE VM running docker compose
- Serverless / static-site hosting — a VM is the wrong shape
- Providers other than Cloud.ru (the CLI is Cloud.ru-specific)

## Prerequisites

```bash
# cloudru-vm is a Go CLI (no npm package; pre-built binaries not yet released):
go install github.com/dzhechko/cloudru-vm-cli/cmd/cloudru-vm@latest   # dzhechko/ = Go MODULE path; the repo lives at djd1m/ — not a typo
# or: git clone https://github.com/djd1m/cloudru-vm-cli && cd cloudru-vm-cli && make build \
#     && sudo mv cloudru-vm /usr/local/bin/
cloudru-vm version   # sanity check
```

Docker + `docker compose` are needed locally only if you want to test the compose file before
deploying (recommended when you synthesized it yourself).

## Protocol

### Step 1 — Clone and analyze the repository

```bash
git clone <repo-url> ./deploy-target && cd deploy-target
```

Determine, in order: (a) does a working `docker-compose.yml` / `compose.yaml` exist?
(b) a `Dockerfile` without compose? (c) neither — infer the stack (package.json / requirements.txt
/ go.mod / pom.xml, start command, listen port) from the code and README. Record: exposed port(s),
required env vars (grep for `process.env` / `os.environ` / `.env.example`), persistent volumes,
and external services (postgres/redis/…) the app expects.

### Step 2 — Ensure a docker-compose.yml (the CLI's contract)

| Repo has | Action |
|----------|--------|
| Working compose file | Use as-is; only verify ports are exposed and images build |
| Dockerfile only | Wrap it: one service with `build: .`, the detected port, env, volumes |
| Neither | Synthesize BOTH: a Dockerfile from the detected stack, then the compose wrapper |

Rules for synthesized files: pin base-image majors (`node:22-alpine`, `python:3.12-slim`);
`restart: unless-stopped`; map the app port to the SAME host port (that is what gets
health-checked and what the connection URL uses); include the app's dependency services
(postgres/redis) as compose services with volumes. If the app needs secrets (API keys, DB
passwords), put placeholders in an `environment:` block and **ask the user for values** — never
invent credentials. If you synthesized anything, show it to the user before deploying.

### Step 3 — Collect Cloud.ru credentials (ask for what's missing)

The CLI requires four values. Check env first, then `.cloudru-vm.yaml`, then **ask the user**
for whatever is absent — by name, all at once:

| Variable | What it is | If missing |
|----------|-----------|------------|
| `CLOUDRU_KEY_ID` + `CLOUDRU_SECRET` (or `CLOUDRU_API_KEY="keyId:secret"`) | IAM service key | ASK — cannot be discovered |
| `CLOUDRU_PROJECT_ID` | Cloud.ru project UUID | ASK — cannot be discovered |
| `CLOUDRU_REGION` | availability-zone UUID | run `cloudru-vm list-zones` and let the user pick |
| `CLOUDRU_IMAGE_ID` | boot-image UUID | run `cloudru-vm list-images --json`, prefer an Ubuntu LTS image, confirm with the user |

Optional knobs (`CLOUDRU_FLAVOR` default `auto` — the CLI sizes from compose resources +30%;
`CLOUDRU_DISK_SIZE` default 10 GB — raise it for DB volumes; `CLOUDRU_TIMEOUT` default 300 s; `CLOUDRU_COMPOSE_FILE` default docker-compose.yml; `CLOUDRU_PROJECT_NAME`).
Precedence is flags > env > `.cloudru-vm.yaml` > defaults; `cloudru-vm init` scaffolds the yaml
if the user prefers a config file.

### Step 4 — Deploy

```bash
cloudru-vm deploy -f docker-compose.yml --json
# flags when not using env: --project-id <uuid> --region <uuid> --image-id <uuid> [--disk-size N]
```

What the CLI does: IAM auth → parse compose + hash → auto-size flavor → create VM → wait for
`running` (≤5 min) → assign floating IP (auto-retries 422) → SSH/SFTP the compose project →
`docker compose up -d` → health-check exposed ports → write deployment state to
`.cloudru-vm/state.json`. Re-runs with an unchanged compose hash skip provisioning; `--force`
overrides. On first deploy it generates the ssh keypair at `.cloudru-vm/id_ed25519`.

### Step 5 — Verify honestly, then hand over the connection

```bash
cloudru-vm status          # deployment state + public IP
cloudru-vm verify          # HTTP health-check of exposed ports
cloudru-vm logs -n 50      # if verify fails: what did the containers say?
```

Do not declare success on `deploy`'s exit code alone — report to the user only after `verify`
passes (or report exactly what failed, with the log excerpt). Then hand over:

```
✅ Deployed <repo> to Cloud.ru
   App:  http://<public-ip>:<port>
   SSH:  ssh -i .cloudru-vm/id_ed25519 user1@<public-ip>
   Ops:  cloudru-vm status | logs -f | destroy
```

Remind the user: `.cloudru-vm/` contains the ssh private key and deployment state — keep it out
of git, and `cloudru-vm destroy` tears the VM down when done.

## Anti-patterns

| Anti-pattern | Why it fails | Correct approach |
|--------------|--------------|------------------|
| Deploying without reading the repo | compose may reference missing env/secrets → boots then crashes | Step 1 analysis first, ask for secrets |
| Inventing credential values or zone/image UUIDs | deploy fails opaquely at IAM/provision | ask the user; use `list-zones` / `list-images` |
| Declaring success from `deploy` exit code | app can be up-but-broken (bad env, migrations) | `verify` + `logs` before reporting |
| Silent synthesized compose | user deploys a file they never saw | show synthesized Dockerfile/compose before Step 4 |
| Committing `.cloudru-vm/` | leaks the ssh private key | gitignore it; say so in the handover |

## Self-check

- [ ] Repo analyzed: stack, port(s), env vars, external services identified?
- [ ] compose file exists / synthesized AND shown to the user?
- [ ] All four credentials resolved — and every missing one was ASKED, not guessed?
- [ ] `cloudru-vm verify` passed (or failure reported with logs)?
- [ ] User got: app URL, ssh string, and the status/logs/destroy commands?
- [ ] `.cloudru-vm/` excluded from git?

## Examples

**In scope:**
- "Вот репо github.com/x/y — изучи и задеплой в cloud.ru, дай ссылку" → full protocol
- "Redeploy with the latest changes" → `cloudru-vm deploy` (hash-skip aware) → `verify`
- "Что там с моим деплоем?" → `status` + `verify` + `logs`
- "Снеси ВМ" → `cloudru-vm destroy` (confirm first)

**Out of scope:**
- "Deploy to AWS/GCP" → different tooling (terraform skill)
- "Set up k8s with autoscaling" → `kubernetes` skill
