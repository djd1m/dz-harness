# Git Workflow Rules

Project-wide commit, branch, and push discipline. Applies to all commands
that modify files.

## Branch Strategy

- `main` — production-ready, protected
- `feature/<id>-<slug>` — per-feature work
- `hotfix/<slug>` — emergency fixes

## Commit Discipline

### Cadence

Commit after each **logical change**, not at session end. NEVER batch unrelated changes.

### Message Format (Conventional Commits)

```
<type>(<scope>): <subject>

[body — what + why, NOT how]
```

| Type | Use for |
|------|---------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Behavior unchanged |
| `test` | Tests only |
| `chore` | Build, deps, scaffolding |
| `perf` | Performance |
| `style` | Formatting |
| `ci` | CI/CD |

### Examples

```
feat(auth): JWT-based login with refresh tokens
fix(payment): handle Stripe webhook retry idempotency
docs(roadmap): mark auth-jwt as done
chore: bump @dzhechkov/p-replicator to 1.4.0
```

## Push Discipline

- Push after each successful phase completion
- `git push origin HEAD`
- Force-push (`--force-with-lease`) ONLY on personal feature branches

## Pre-Commit Hooks (auto-installed by `init` via `settings.json`)

| Hook | Purpose |
|------|---------|
| `Stop` autocommit-roadmap | Commits `.claude/feature-roadmap.json` if changed |
| `Stop` autocommit-insights | Commits `.claude/insights/` if changed |
| `Stop` autocommit-plans | Commits new `docs/plans/*.md` if added |

## Forbidden

- `git commit --no-verify` (without explicit user approval)
- `git push --force` to `main`
- Committing `.env`, `.env.*` (except `.env.example`)
- Committing secrets, API keys, passwords
- Committing `node_modules/`, `dist/`, `coverage/`

## Pre-Push Self-Check

- [ ] Tests pass
- [ ] Lint clean
- [ ] No secrets in diff
- [ ] Branch up-to-date with origin/main
