---
name: "monorepo-management"
description: "Manages monorepo structure — workspace config, dependency graph, changesets, selective builds, and package publishing."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# monorepo-management

Manage the full lifecycle of a monorepo: tooling selection, workspace configuration, dependency graphs, build pipelines, changesets, selective execution, and package publishing. This skill covers the structural and operational concerns of running multiple packages in a single repository.

## When to use

- Setting up a new monorepo (pnpm/npm/yarn workspaces, Turborepo, Nx)
- Adding a new package to an existing monorepo
- Managing cross-package dependencies (workspace:* protocol)
- Publishing packages to npm with changesets
- Debugging dependency resolution issues (phantom deps, circular deps, hoist conflicts)
- Optimizing build times with caching and selective execution
- Configuring shared tooling (TypeScript, ESLint, Vitest) across packages

## When NOT to use

- Choosing between monorepo and polyrepo (that is an architecture decision, not a management task)
- Setting up CI from scratch without an existing monorepo (use `ci-fix` for CI issues)
- Publishing a standalone single-package library (no workspace concerns)
- Migrating from one language ecosystem to another

## Procedure

### Step 1: Choose tooling

Compare the available options against the project's needs. Use this decision matrix:

| Tool | Workspaces | Build cache | Remote cache | Task runner | Publishing | Best for |
|------|-----------|-------------|-------------|-------------|------------|----------|
| pnpm workspaces | Built-in | No | No | No (pair with Turbo) | Manual / changesets | Strict dependency isolation |
| npm workspaces | Built-in | No | No | No | Manual / changesets | Minimal setup, Node-native |
| Yarn Berry | Built-in (PnP) | No | No | No | Manual / changesets | Zero-install, strict mode |
| Turborepo | Via pnpm/npm/yarn | Yes (local) | Yes (Vercel) | Yes (topological) | Via changesets | Fast builds, incremental adoption |
| Nx | Built-in | Yes (local) | Yes (Nx Cloud) | Yes (affected graph) | Built-in generators | Large teams, code generation |
| Lerna | Via npm/yarn | No | No | Yes (basic) | Built-in (lerna publish) | Legacy projects, simple needs |

**Decision factors:** team size, number of packages, build frequency, need for remote cache, existing tooling.

**Recommendation for most new projects:** pnpm workspaces + Turborepo + changesets. This combination gives strict dependency isolation, fast cached builds, and structured versioning.

### Step 2: Structure layout

Adopt a conventional directory structure:

```
monorepo-root/
  packages/         # Shared libraries (@org/utils, @org/config)
  apps/             # Deployable applications (web, api, docs)
  tools/            # Internal dev tools (scripts, generators)
  turbo.json        # Turborepo config (if using)
  pnpm-workspace.yaml
  package.json      # Root: devDeps only, no runtime deps
  tsconfig.base.json
  .changeset/
    config.json
```

**Flat vs scoped:** Use `@org/package-name` scoping for all packages. It prevents name collisions on npm, makes imports explicit, and groups packages in node_modules.

**Naming convention:**
- `@org/feat-*` for feature libraries
- `@org/config-*` for shared configs
- `@org/app-*` for applications (if published)

### Step 3: Configure workspace

**pnpm-workspace.yaml:**

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "tools/*"
```

**Root package.json (pnpm):**

```json
{
  "name": "monorepo-root",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "turbo run build --filter='./packages/*' && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "turbo": "^2.3.0"
  }
}
```

**TypeScript project references (tsconfig.base.json):**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "composite": true,
    "baseUrl": ".",
    "paths": {}
  },
  "exclude": ["node_modules", "dist"]
}
```

Each package extends the base:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../other-package" }
  ]
}
```

### Step 4: Dependency management

**workspace:* protocol** -- always use `workspace:*` (or `workspace:^`) for intra-monorepo deps. This ensures local packages link to each other rather than pulling from the registry:

```json
{
  "dependencies": {
    "@org/utils": "workspace:*",
    "@org/config": "workspace:^"
  }
}
```

- `workspace:*` resolves to the exact local version at publish time
- `workspace:^` resolves to `^x.y.z` at publish time (allows minor bumps)

**.npmrc settings:**

```ini
# Recommended for pnpm monorepos
shamefully-hoist=false
strict-peer-dependencies=true
auto-install-peers=true
link-workspace-packages=true
prefer-workspace-packages=true
```

**Hoisting rules:** Keep `shamefully-hoist=false` (the default) to catch phantom dependencies early. If a specific package needs hoisting (e.g., React Native), use per-package `.npmrc` or `pnpm.overrides`.

### Step 5: Shared config

Centralize configs in root or in a dedicated `@org/config` package:

**Shared vitest config (vitest.workspace.ts):**

```typescript
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "apps/*/vitest.config.ts",
]);
```

**Per-package vitest.config.ts:**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

**ESLint flat config (eslint.config.js at root):**

```javascript
import baseConfig from "@org/config/eslint";

export default [
  ...baseConfig,
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
];
```

### Step 6: Build pipeline

**turbo.json:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig.json", "package.json"],
      "outputs": ["dist/**"],
      "outputLogs": "new-only"
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["src/**", "test/**", "vitest.config.ts"],
      "outputs": [],
      "outputLogs": "new-only"
    },
    "lint": {
      "inputs": ["src/**", "eslint.config.*"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig.json"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Key concepts:**
- `^build` means "build my workspace dependencies first" (topological ordering)
- `dependsOn: ["build"]` means "run my own build task first"
- `inputs` defines what files invalidate the cache
- `outputs` defines what gets cached

### Step 7: Selective execution

Run tasks for specific packages or affected packages only:

```bash
# Single package
pnpm --filter @org/utils build
turbo run build --filter=@org/utils

# Package and its dependents
turbo run build --filter=@org/utils...

# Package and its dependencies
turbo run build --filter=...@org/utils

# Only packages changed since main
turbo run build --filter='...[origin/main]'

# Only packages in a directory
turbo run test --filter='./packages/*'
```

**Affected detection:** Turborepo compares file hashes against the cache. Only packages whose inputs changed (or whose dependencies changed) will actually execute.

### Step 8: Changesets workflow

**Initialize changesets:**

```bash
pnpm add -Dw @changesets/cli
pnpm changeset init
```

**.changeset/config.json:**

```json
{
  "$schema": "https://github.com/changesets/changesets/blob/main/packages/config/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [],
  "___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH": {
    "onlyUpdatePeerDependentsWhenOutOfRange": true
  }
}
```

**Workflow:**

1. Developer creates a changeset: `pnpm changeset` -- select packages, bump type (patch/minor/major), write summary
2. PR includes the `.changeset/*.md` file alongside code changes
3. On merge to main, CI runs `pnpm changeset version` -- consumes changeset files, bumps versions, updates CHANGELOGs
4. A "Version Packages" PR is opened automatically (via GitHub Action)
5. Merging the version PR triggers `pnpm changeset publish`

**Versioning policy:**
- `fixed: [["@org/core", "@org/cli"]]` -- these packages always share the same version
- `linked: [["@org/plugin-*"]]` -- these packages bump together but can have different versions

### Step 9: Package publishing

**Per-package package.json for publishing:**

```json
{
  "name": "@org/utils",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./sub-path": {
      "import": "./dist/sub-path.js",
      "types": "./dist/sub-path.d.ts"
    }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "publishConfig": {
    "access": "public",
    "provenance": true,
    "registry": "https://registry.npmjs.org/"
  },
  "sideEffects": false
}
```

**Checklist before first publish:**
- `files` field restricts what goes in the tarball (never publish src/ or tests/)
- `publishConfig.access: "public"` is required for scoped packages on npm
- `provenance: true` enables npm provenance (ties package to CI build)
- `exports` map defines the public API surface
- Run `npm pack --dry-run` to verify tarball contents

### Step 10: CI optimization

**GitHub Actions example with caching:**

```yaml
name: CI
on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Needed for affected detection

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - uses: actions/cache@v4
        with:
          path: node_modules/.cache/turbo
          key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: turbo-${{ runner.os }}-

      - run: pnpm turbo run build test lint --filter='...[origin/main]'
```

**Optimization techniques:**
- `--frozen-lockfile` ensures reproducible installs
- Turbo local cache persists between CI runs via actions/cache
- `--filter='...[origin/main]'` runs only affected packages
- `fetch-depth: 0` is needed for git-based affected detection
- For remote cache: `turbo run build --remote-only` with TURBO_TOKEN

### Step 11: Common issues

| Issue | Symptom | Fix |
|-------|---------|-----|
| Phantom dependencies | Package imports a dep it does not declare | Set `shamefully-hoist=false`, add missing dep to package.json |
| Circular dependencies | Build hangs or produces wrong output | Refactor shared code into a new leaf package |
| Version drift | Package A uses lodash@4.17.20, Package B uses 4.17.21 | Use `pnpm.overrides` or `resolutions` to pin |
| Hoist conflicts | Two packages need different versions of the same dep | Use `pnpm.peerDependencyRules` or per-package `.npmrc` |
| Symlink issues | Tools that do not follow symlinks fail | Set `preserveSymlinks: true` in tsconfig or use `shamefully-hoist` for that specific dep |
| Missing workspace dep | `ERR_MODULE_NOT_FOUND` for a workspace package | Ensure `workspace:*` is in dependencies, run `pnpm install` |
| Build order wrong | Package builds before its dependency | Add `"dependsOn": ["^build"]` in turbo.json |
| Changeset not detected | `changeset version` does nothing | Ensure `.changeset/*.md` files exist and reference the right packages |

### Step 12: Health checks

Run these periodically to keep the monorepo healthy:

```bash
# Dependency graph visualization
pnpm ls --depth=1 -r --json | jq '.[].dependencies'
turbo run build --graph=graph.html  # visual DAG

# Unused dependencies
npx depcheck packages/utils  # per package

# Version consistency across packages
pnpm ls react -r  # show all versions of react across workspace

# Circular dependency detection
npx madge --circular --extensions ts packages/

# License audit
pnpm licenses list --json > licenses.json

# Changeset status
pnpm changeset status  # which packages have pending changesets

# Workspace integrity
pnpm install --frozen-lockfile  # fails if lockfile is stale
pnpm -r exec -- node -e "require('./package.json')"  # validate all package.json files
```

## Anti-patterns

- **Publishing without changesets** -- leads to version drift, missing CHANGELOGs, and broken consumers
- **Circular workspace dependencies** -- breaks topological sort, causes infinite build loops
- **Global devDependencies that should be per-package** -- testing libs used by only one package should not be in root
- **Not using --filter for selective operations** -- running all tasks on every change wastes CI minutes
- **Missing publishConfig.access for scoped packages** -- npm defaults scoped packages to restricted (private)
- **Relying on hoisting instead of explicit deps** -- works locally but breaks when packages are published
- **Single tsconfig without project references** -- loses incremental build benefits, type-checking is slow
- **Committing dist/ folders** -- use prepublishOnly or build in CI instead

## Self-check

Before considering the task complete, verify:

- [ ] Does every package have correct `workspace:*` dependencies for intra-monorepo refs?
- [ ] Is there a build pipeline with correct task dependencies (`^build`)?
- [ ] Are changesets configured for version management?
- [ ] Does `--filter` work correctly for selective builds?
- [ ] Are shared configs (tsconfig, eslint, vitest) in a central location?
- [ ] Is the CI using caching effectively (pnpm store + turbo cache)?
- [ ] Does `npm pack --dry-run` show only intended files for each publishable package?
- [ ] Are there no circular dependencies in the workspace graph?
- [ ] Is `shamefully-hoist` disabled (or intentionally enabled with documentation)?
- [ ] Do all scoped packages have `publishConfig.access: "public"` if intended for public npm?

## Examples

- **In scope:** "Set up a pnpm monorepo with 5 packages and Turborepo"
- **In scope:** "Add turborepo to existing pnpm workspace"
- **In scope:** "Debug why package A can't find package B in the workspace"
- **In scope:** "Configure changesets for independent versioning"
- **In scope:** "Optimize CI -- builds take 20 minutes for a small change"
- **In scope:** "Add a new @org/analytics package to the monorepo"
- **Out of scope:** "Choose between monorepo and polyrepo" (architecture decision)
- **Out of scope:** "Migrate from JavaScript to TypeScript" (language migration, not monorepo management)
