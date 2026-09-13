// Points at the public mirror repo (git+https://github.com/djd1m/dz-harness.git), not the private
// dz-harness-hub monorepo. Decision + rationale: docs/public-mirror-plan.md (2026-08-29) and
// feature-adr npm-readme-install-first (2026-09-13, FR-5, owner approval "возвращать" 07:05 UTC).
// A prior "hygiene" pass (278debac, 2026-09-10) flipped this to the private origin because the
// decision lived only in prose; package-repository-field.test.ts now cites this same trail so a
// future pass reads the reason before reverting it again (teach:a05c61bb).
export const REPOSITORY_ORIGIN = 'git+https://github.com/djd1m/dz-harness.git';
