---
name: "gitlab"
description: "GitLab integration via MCP — projects, merge requests, issues, pipelines, wiki, releases, milestones."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# gitlab

GitLab integration via the [@zereight/mcp-gitlab](https://github.com/zereight/mcp-gitlab) MCP server. Provides full access to GitLab projects, merge requests, issues, pipelines, wiki pages, releases, tags, and milestones. Supports both GitLab.com and self-hosted instances.

## MCP Server

- **Package:** `@zereight/mcp-gitlab`
- **Transport:** stdio (also supports SSE and Streamable HTTP)

## Installation

### Claude Code

```bash
claude mcp add gitlab -- npx @zereight/mcp-gitlab
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "gitlab": {
      "command": "npx",
      "args": ["@zereight/mcp-gitlab"],
      "env": {
        "GITLAB_TOKEN": "your-personal-access-token",
        "GITLAB_URL": "https://gitlab.com"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITLAB_TOKEN` | Yes | - | Personal Access Token (PAT) or OAuth2 token |
| `GITLAB_URL` | No | `https://gitlab.com` | GitLab instance URL (for self-hosted) |

### Token Scopes

Create a Personal Access Token at **Settings > Access Tokens** with these scopes:

| Scope | Required For |
|-------|-------------|
| `api` | Full API access (all operations) |
| `read_api` | Read-only operations (list, view) |
| `read_repository` | Repository file access |
| `write_repository` | Push, merge, branch operations |

Principle of least privilege: use `read_api` + `read_repository` if you only need read access. Use `api` only when you need write operations.

## Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List accessible projects with filtering |
| `get_project` | Get project details by ID or path |
| `create_project` | Create a new project |
| `list_merge_requests` | List MRs with state/label filtering |
| `create_merge_request` | Create a new merge request |
| `merge_merge_request` | Merge an approved MR |
| `approve_merge_request` | Approve a merge request |
| `list_issues` | List issues with filtering |
| `create_issue` | Create a new issue |
| `update_issue` | Update issue (assign, label, close) |
| `list_pipelines` | List pipelines for a project |
| `get_pipeline` | Get pipeline details and job status |
| `retry_pipeline` | Retry a failed pipeline |
| `cancel_pipeline` | Cancel a running pipeline |
| `list_wiki_pages` | List wiki pages |
| `create_wiki_page` | Create a wiki page |
| `create_release` | Create a new release with notes |
| `list_tags` | List repository tags |
| `create_tag` | Create a new tag |
| `list_milestones` | List project milestones |
| `create_milestone` | Create a milestone with due date |

## Procedure

1. **Configure authentication.** Set up the GitLab token:
   - For GitLab.com: Create a PAT at `https://gitlab.com/-/user_settings/personal_access_tokens`
   - For self-hosted: Create a PAT at `https://<your-instance>/-/user_settings/personal_access_tokens`
   - Use the minimum required scopes for the operations needed
   - Set `GITLAB_TOKEN` environment variable
   - For self-hosted instances, also set `GITLAB_URL`

2. **Project operations.** Browse and manage projects:
   - List projects the token has access to (filter by visibility, membership, search)
   - Get project details including default branch, visibility, and statistics
   - Create new projects with description, visibility, and initialization options
   - Access project files and repository structure

3. **Merge request operations.** Manage the full MR lifecycle:
   - Create MRs with title, description, source/target branches, labels, and assignees
   - List MRs filtered by state (opened, merged, closed), author, or labels
   - Review MR changes (diff, commits, discussions)
   - Approve and merge MRs (with merge strategy: merge commit, squash, fast-forward)
   - Add comments and resolve discussions

4. **Issue operations.** Track work items:
   - Create issues with title, description, labels, assignee, milestone, and due date
   - List issues filtered by state, labels, assignee, or milestone
   - Update issues (reassign, relabel, close, reopen)
   - Link issues to merge requests
   - Track time estimates and time spent

5. **Pipeline operations.** Monitor and manage CI/CD:
   - List pipelines for a project (filter by status, ref, source)
   - Get pipeline details including individual job statuses
   - Trigger new pipelines on a specific branch
   - Retry failed pipelines or individual jobs
   - Cancel running pipelines
   - View pipeline artifacts

6. **Wiki management.** Maintain project documentation:
   - List all wiki pages
   - Create new wiki pages with markdown content
   - Update existing wiki pages
   - Useful for automated documentation updates

7. **Releases and tags.** Manage versioning:
   - List existing tags and releases
   - Create new tags from commits or branches
   - Create releases with release notes, assets, and milestones
   - Link releases to milestones for changelog generation

8. **Milestones tracking.** Plan and track progress:
   - Create milestones with title, description, due date, and start date
   - List milestones (active, closed, or all)
   - Track issues and merge requests per milestone
   - Close milestones when all associated items are complete

## Transports

The MCP server supports multiple transport protocols:

| Transport | Use Case | Configuration |
|-----------|----------|---------------|
| **stdio** (default) | Local CLI usage | `npx @zereight/mcp-gitlab` |
| **SSE** | Remote server, web clients | Set `TRANSPORT=sse`, `PORT=3000` |
| **Streamable HTTP** | Modern HTTP-based integration | Set `TRANSPORT=streamable-http`, `PORT=3000` |

## Anti-patterns

- **Broad PAT scopes.** Using `api` scope when only `read_api` is needed exposes unnecessary write access. Always use the minimum required scopes.
- **No pipeline monitoring.** Triggering pipelines without monitoring their status leads to silent failures. Always check pipeline results after triggering.
- **Ignoring merge request reviews.** Auto-merging without review defeats the purpose of MRs. Use the approve/review flow before merging.
- **Hardcoded project IDs.** Project IDs change between instances. Use project paths (e.g., `group/project`) instead of numeric IDs when possible.
- **Token in code.** Never commit the GitLab token. Always use environment variables.
- **No error handling for rate limits.** GitLab API has rate limits. Handle 429 responses with exponential backoff.

## Self-check

Before delivering, verify:

1. [ ] GitLab token is configured via environment variable (not hardcoded)
2. [ ] Token scopes match the operations being performed (least privilege)
3. [ ] GitLab URL is correct for the target instance (gitlab.com vs self-hosted)
4. [ ] Project is identified by path or ID correctly
5. [ ] Merge requests have proper title, description, and target branch
6. [ ] Issues have labels, assignees, and milestones where applicable
7. [ ] Pipeline status was checked after triggering
8. [ ] Wiki pages use proper markdown formatting
9. [ ] Releases include meaningful release notes
10. [ ] Rate limit handling is in place for bulk operations
