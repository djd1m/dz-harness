---
name: "git-mcp"
description: "Git version control via MCP — clone, commit, branch, merge, diff, stash, cherry-pick, and worktree operations."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# git-mcp

Git version control via the [@cyanheads/git-mcp-server](https://github.com/cyanheads/git-mcp-server). Full Git operations including clone, commit, branch, merge, rebase, diff, stash, cherry-pick, tag, and worktree management.

## MCP Server

- **Package:** `@cyanheads/git-mcp-server`
- **Transport:** stdio

## Installation

### Claude Code

```bash
claude mcp add git -- npx @cyanheads/git-mcp-server
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "git": {
      "command": "npx",
      "args": ["@cyanheads/git-mcp-server"],
      "env": {}
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GIT_DEFAULT_PATH` | No | Default repository path (if not specified per-call) |

## Tools

### git_status

Show working tree status — staged, unstaged, and untracked files.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Path to the Git repository |

**Example:**

```
Check the current status of the repository.

Tool call:
  git_status({
    "repo_path": "/home/user/projects/my-app"
  })
```

### git_diff

Show changes between commits, working tree, and staging area.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `target` | string | No | Diff target (e.g., `HEAD`, `main..feature`, `--staged`) |
| `file_path` | string | No | Limit diff to specific file |

**Example:**

```
Show staged changes ready for commit.

Tool call:
  git_diff({
    "repo_path": "/home/user/projects/my-app",
    "target": "--staged"
  })
```

### git_log

View commit history with optional filtering.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `max_count` | number | No | Maximum commits to show (default: 10) |
| `branch` | string | No | Branch to show log for |
| `author` | string | No | Filter by author |
| `since` | string | No | Show commits after date (e.g., `2026-01-01`) |
| `file_path` | string | No | Show commits affecting this file |

**Example:**

```
Show the last 5 commits on the main branch.

Tool call:
  git_log({
    "repo_path": "/home/user/projects/my-app",
    "max_count": 5,
    "branch": "main"
  })
```

### git_commit

Stage files and create a commit.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `message` | string | Yes | Commit message |
| `files` | array | No | Files to stage (if empty, commits currently staged) |

**Example:**

```
Stage two files and commit with a descriptive message.

Tool call:
  git_commit({
    "repo_path": "/home/user/projects/my-app",
    "message": "feat: add user authentication middleware\n\nImplements JWT-based auth with refresh token rotation.",
    "files": ["src/middleware/auth.ts", "src/types/auth.ts"]
  })
```

### git_branch

List, create, rename, or delete branches.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `action` | string | Yes | `list`, `create`, `delete`, `rename`, `switch` |
| `name` | string | No | Branch name (for create/delete/switch) |
| `new_name` | string | No | New name (for rename) |

**Example:**

```
Create a feature branch and switch to it.

Tool call:
  git_branch({
    "repo_path": "/home/user/projects/my-app",
    "action": "create",
    "name": "feature/mcp-integration"
  })

  git_branch({
    "repo_path": "/home/user/projects/my-app",
    "action": "switch",
    "name": "feature/mcp-integration"
  })
```

### git_merge

Merge a branch into the current branch.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `branch` | string | Yes | Branch to merge from |
| `strategy` | string | No | Merge strategy: `merge`, `squash`, `no-ff` |
| `message` | string | No | Custom merge commit message |

**Example:**

```
Merge the feature branch into main with a squash commit.

Tool call:
  git_merge({
    "repo_path": "/home/user/projects/my-app",
    "branch": "feature/mcp-integration",
    "strategy": "squash",
    "message": "feat: integrate MCP server support"
  })
```

### git_rebase

Rebase the current branch onto another branch.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `onto` | string | Yes | Branch to rebase onto |
| `abort` | boolean | No | Set to true to abort an in-progress rebase |

**Example:**

```
Rebase the current branch onto main.

Tool call:
  git_rebase({
    "repo_path": "/home/user/projects/my-app",
    "onto": "main"
  })
```

### git_stash

Save and restore work-in-progress changes.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `action` | string | Yes | `push`, `pop`, `list`, `drop`, `apply` |
| `message` | string | No | Stash message (for push) |
| `index` | number | No | Stash index (for pop/drop/apply) |

**Example:**

```
Stash current changes with a descriptive message.

Tool call:
  git_stash({
    "repo_path": "/home/user/projects/my-app",
    "action": "push",
    "message": "WIP: auth middleware refactor"
  })
```

### git_cherry_pick

Apply specific commits from another branch.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `commits` | array | Yes | Commit SHAs to cherry-pick |
| `no_commit` | boolean | No | Stage changes without committing |

**Example:**

```
Cherry-pick a specific bugfix commit.

Tool call:
  git_cherry_pick({
    "repo_path": "/home/user/projects/my-app",
    "commits": ["a1b2c3d"]
  })
```

### git_clone

Clone a remote repository.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Repository URL |
| `path` | string | Yes | Local path to clone into |
| `branch` | string | No | Branch to checkout after clone |
| `depth` | number | No | Shallow clone depth |

**Example:**

```
Clone a repository with shallow depth for faster checkout.

Tool call:
  git_clone({
    "url": "https://github.com/anthropics/claude-code.git",
    "path": "/home/user/projects/claude-code",
    "depth": 1
  })
```

### git_fetch

Fetch refs and objects from a remote.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `remote` | string | No | Remote name (default: `origin`) |
| `prune` | boolean | No | Remove remote-tracking refs that no longer exist |

**Example:**

```
Tool call:
  git_fetch({
    "repo_path": "/home/user/projects/my-app",
    "remote": "origin",
    "prune": true
  })
```

### git_pull

Fetch and integrate changes from a remote branch.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `remote` | string | No | Remote name (default: `origin`) |
| `branch` | string | No | Branch to pull |
| `rebase` | boolean | No | Use rebase instead of merge |

**Example:**

```
Pull latest changes from origin/main with rebase.

Tool call:
  git_pull({
    "repo_path": "/home/user/projects/my-app",
    "remote": "origin",
    "branch": "main",
    "rebase": true
  })
```

### git_push

Push commits to a remote repository.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `remote` | string | No | Remote name (default: `origin`) |
| `branch` | string | No | Branch to push |
| `set_upstream` | boolean | No | Set upstream tracking |

**Example:**

```
Push the current branch and set upstream tracking.

Tool call:
  git_push({
    "repo_path": "/home/user/projects/my-app",
    "remote": "origin",
    "branch": "feature/mcp-integration",
    "set_upstream": true
  })
```

### git_reset

Reset HEAD to a specific state.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `target` | string | No | Commit to reset to (default: `HEAD`) |
| `mode` | string | No | Reset mode: `soft`, `mixed` (default), `hard` |
| `files` | array | No | Specific files to unstage |

**Example:**

```
Unstage a specific file.

Tool call:
  git_reset({
    "repo_path": "/home/user/projects/my-app",
    "files": ["src/config.ts"]
  })
```

### git_tag

Create, list, or delete tags.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `action` | string | Yes | `list`, `create`, `delete` |
| `name` | string | No | Tag name (for create/delete) |
| `message` | string | No | Annotated tag message |
| `commit` | string | No | Commit to tag (default: HEAD) |

**Example:**

```
Create an annotated release tag.

Tool call:
  git_tag({
    "repo_path": "/home/user/projects/my-app",
    "action": "create",
    "name": "v1.2.0",
    "message": "Release v1.2.0 — MCP integration + auth middleware"
  })
```

### git_worktree

Manage multiple working trees for the same repository.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `action` | string | Yes | `list`, `add`, `remove` |
| `path` | string | No | Worktree path (for add/remove) |
| `branch` | string | No | Branch for the worktree |

**Example:**

```
Create a worktree for a hotfix branch.

Tool call:
  git_worktree({
    "repo_path": "/home/user/projects/my-app",
    "action": "add",
    "path": "/home/user/projects/my-app-hotfix",
    "branch": "hotfix/critical-fix"
  })
```

### git_remote

Manage remote repositories.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | Yes | Repository path |
| `action` | string | Yes | `list`, `add`, `remove`, `set-url` |
| `name` | string | No | Remote name |
| `url` | string | No | Remote URL (for add/set-url) |

**Example:**

```
Add an upstream remote for a fork.

Tool call:
  git_remote({
    "repo_path": "/home/user/projects/my-app",
    "action": "add",
    "name": "upstream",
    "url": "https://github.com/original-org/my-app.git"
  })
```

## When to Use

- **Git operations via AI agent** — automating version control workflows through natural language
- **Automated version control** — scripted commit/branch/merge cycles
- **Branch management** — creating, switching, merging feature branches
- **Code review diffs** — viewing changes between branches, commits, or working tree
- **Release management** — tagging releases, cherry-picking fixes, managing worktrees

## Procedure

1. **Connect to repo** — verify repository path with `git_status` to confirm the working tree state
2. **Status/diff** — use `git_status` and `git_diff` to understand current changes before any operations
3. **Branch management** — create, switch, list, or delete branches with `git_branch`
4. **Commit workflow** — stage specific files and commit with `git_commit`; push to remote with `git_push`
5. **Merge/rebase with conflict detection** — use `git_merge` (with squash/no-ff options) or `git_rebase`; check status after for conflicts
6. **Stash operations** — save WIP with `git_stash push`, list stashes, and restore with `pop` or `apply`
7. **Cherry-pick** — apply specific commits across branches with `git_cherry_pick`
8. **Tag/release management** — create annotated tags with `git_tag`, push tags to remote

## Security Notes

- **No force-push by default** — the MCP server does not expose `--force` push to prevent accidental history rewriting
- **No secret detection** — always review staged files with `git_diff --staged` before committing to avoid pushing credentials
- **Branch protection** — the server does not enforce branch protection rules; rely on remote-side (GitHub/GitLab) protections
- **SSH keys** — the server uses the system's Git configuration; ensure SSH keys or credential helpers are configured for remote access

## Anti-Patterns

- **Force-push without confirmation** — never force-push to shared branches; always communicate with team members first and prefer `git_push` without force
- **Committing secrets** — always review diffs before committing; use `.gitignore` for `.env`, `credentials.json`, and other sensitive files
- **No branch protection awareness** — do not attempt direct pushes to protected branches (main/master); create feature branches and use pull requests

## Self-Check

1. Git is installed and accessible from the system PATH
2. `git_status` returns working tree information for a known repository
3. `git_log` shows recent commit history
4. `git_diff` displays changes in the working tree
5. `git_branch` lists all local branches
6. `git_commit` creates a commit with staged files and a message
7. `git_stash push` saves WIP and `git_stash pop` restores it
8. `git_tag list` shows existing tags
9. `git_remote list` shows configured remotes
10. `git_clone` successfully clones a public repository

## Tips

- Always run `git_status` before committing to review what will be included
- Use `git_diff` with `target: "--staged"` to review exactly what a commit will contain
- Prefer `git_merge` with `strategy: "no-ff"` for feature branches to preserve merge history
- Use `git_stash` with descriptive messages to easily identify saved work later
- Use `git_log` with `file_path` to trace the history of a specific file
- Prefer shallow clones (`depth: 1`) for CI/CD or when full history is not needed
- Use `git_worktree` for parallel work on hotfixes without switching branches
