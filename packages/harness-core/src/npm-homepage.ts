/**
 * npm-homepage — the facts behind the `dz guard` rule of the same name (backlog e5d0d383).
 *
 * Owner rule 2026-09-28 (`.claude/rules/npm-homepage.md`): every `packages/@dzhechkov/*` package, public or
 * private, carries `homepage` = exactly `https://aicoding.space`. The GitHub links are NOT replaced — npm has
 * one `homepage` field, so the site lives there and GitHub stays in `repository` (url + directory) and in
 * `bugs.url`, and the package README carries both links. The rule therefore checks all of them: dropping the
 * GitHub ones while "fixing" homepage is the exact regression the owner's clarification forbids.
 *
 * Every accepted value is an EXACT string from a closed list — no URL parsing, no normalisation (fix round 1,
 * review r1 finding 1: a substring test accepted `https://evil.example/github.com/djd1m/dz-harness`). The lead
 * measured all 57 manifests: each carries exactly the one value listed below.
 *
 * Two halves, so the evaluator is testable without a filesystem:
 *   - `npmHomepageFacts(records, discovery)` (here) is PURE: records in, per-package problem lists out;
 *   - `readNpmHomepageRecords(dir)` lives in harness-cli (`cli.ts`): it lists package directories (hidden ones
 *     included), parses `package.json`, reads `README.md`, and returns every entry it could NOT decide as a
 *     named discovery failure — a permission error is a failure, never "absent". It is NOT here because
 *     harness-core's IO ratchet (test/core-boundary.test.ts) forbids a new file importing node:fs —
 *     MEASURED 2026-09-28: 66 > pinned 65 when it lived here.
 */

/** The owner's site. Compared by strict equality: a trailing slash, a path or an anchor is a violation. */
export const NPM_HOMEPAGE_URL = 'https://aicoding.space';
/** Accepted `repository.url` values — a closed list, compared by strict equality. One entry today. */
export const NPM_REPOSITORY_URLS: readonly string[] = ['git+https://github.com/djd1m/dz-harness.git'];
/** The one accepted `bugs.url`. */
export const NPM_BUGS_URL = 'https://github.com/djd1m/dz-harness/issues';
const README_SITE = NPM_HOMEPAGE_URL;
const README_SOURCE = 'https://github.com/djd1m/dz-harness';
const PACKAGES_PREFIX = 'packages/@dzhechkov/';

/** One package directory as the reader found it. */
export interface NpmHomepageRecord {
  /** The directory name under `packages/@dzhechkov/` — the expected tail of `repository.directory`. */
  readonly dir: string;
  readonly json?: unknown;
  readonly parseError?: string;
  /** README.md text; `null` = the file does not exist; absent = not read (treated as missing). */
  readonly readme?: string | null;
  /** README.md exists but could not be read. */
  readonly readmeError?: string;
}

/** An entry the reader could not decide (stat/read/existence failed for a reason other than "absent"). */
export interface NpmHomepageDiscoveryFailure {
  readonly path: string;
  readonly reason: string;
}

/** What the reader saw besides the records. `unreadableRoot` set ⇒ the rule is NOT ESTABLISHED. */
export interface NpmHomepageDiscovery {
  readonly failures?: readonly NpmHomepageDiscoveryFailure[];
  readonly unreadableRoot?: string;
}

/** The fact the guard rule reads: one entry per package; an empty `problems` list means compliant. */
export interface NpmHomepageFact {
  readonly dir: string;
  /** `name` from package.json when it is a string, else `packages/@dzhechkov/<dir>`. */
  readonly name: string;
  readonly problems: readonly string[];
}

/** The whole evidence set for the rule. */
export interface NpmHomepageFactSet {
  readonly packages: readonly NpmHomepageFact[];
  readonly discoveryFailures: readonly NpmHomepageDiscoveryFailure[];
  readonly unreadableRoot?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Fix round 2 (review r2 finding 2): the two links must be WHOLE URLs outside code. A URL ends at end of line,
// whitespace, `)`, `]`, `>`, `,`, a quote, or a `.` followed by whitespace/end — so
// `https://aicoding.space.evil.example` and `https://aicoding.space/x` do not count. The source link may continue
// with `/` (a legitimate subpath such as `/tree/main/packages/…`), but not with `-imposter`.
const URL_END = String.raw`(?=$|[\s)\]>,"']|\.(?:\s|$))`;
const SITE_RE = new RegExp(`https://aicoding\\.space${URL_END}`);
const SOURCE_RE = new RegExp(`https://github\\.com/djd1m/dz-harness(?=/|${URL_END.slice(3)}`);
const FENCE_RE = /^\s{0,3}(```|~~~)/;

/** One README line, outside fenced code and outside inline-code spans, carrying BOTH whole links (any order). */
function readmeProblem(rec: NpmHomepageRecord): string | undefined {
  if (rec.readmeError !== undefined) return `README.md could not be read (${rec.readmeError})`;
  if (typeof rec.readme !== 'string') return 'README.md is missing — it must carry a line with both the site and the GitHub link';
  let inFence = false;
  let ok = false;
  for (const line of rec.readme.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const prose = line.replace(/`[^`]*`/g, ' ');
    if (SITE_RE.test(prose) && SOURCE_RE.test(prose)) { ok = true; break; }
  }
  return ok ? undefined : `README.md has no line (outside code) carrying both ${README_SITE} and ${README_SOURCE} as whole links`;
}

/** Pure: evaluate each record against the field and README requirements. Private packages are NOT exempt. */
export function npmHomepageFacts(records: readonly NpmHomepageRecord[], discovery: NpmHomepageDiscovery = {}): NpmHomepageFactSet {
  const out: NpmHomepageFact[] = [];
  for (const rec of Array.isArray(records) ? records : []) {
    const dir = typeof rec?.dir === 'string' ? rec.dir : '(unknown dir)';
    const fallbackName = `${PACKAGES_PREFIX}${dir}`;
    const readme = rec && typeof rec === 'object' ? readmeProblem(rec) : 'record is not an object';
    if (rec?.parseError !== undefined) {
      out.push({ dir, name: fallbackName, problems: [`package.json does not parse (${rec.parseError})`, ...(readme ? [readme] : [])] });
      continue;
    }
    const j = rec?.json;
    if (!isObject(j)) {
      out.push({ dir, name: fallbackName, problems: ['package.json is not a JSON object', ...(readme ? [readme] : [])] });
      continue;
    }
    const name = typeof j['name'] === 'string' && j['name'] !== '' ? j['name'] : fallbackName;
    const problems: string[] = [];
    if (j['homepage'] !== NPM_HOMEPAGE_URL) {
      problems.push(`homepage = ${JSON.stringify(j['homepage'])}, must be exactly "${NPM_HOMEPAGE_URL}"`);
    }
    const repo = j['repository'];
    const repoUrl = isObject(repo) ? repo['url'] : undefined;
    if (typeof repoUrl !== 'string' || !NPM_REPOSITORY_URLS.includes(repoUrl)) {
      problems.push(`repository.url = ${JSON.stringify(repoUrl)}, must be exactly one of ${JSON.stringify(NPM_REPOSITORY_URLS)}`);
    }
    const repoDir = isObject(repo) ? repo['directory'] : undefined;
    if (repoDir !== `${PACKAGES_PREFIX}${dir}`) {
      problems.push(`repository.directory = ${JSON.stringify(repoDir)}, must be "${PACKAGES_PREFIX}${dir}"`);
    }
    const bugs = j['bugs'];
    const bugsUrl = isObject(bugs) ? bugs['url'] : undefined;
    if (bugsUrl !== NPM_BUGS_URL) {
      problems.push(`bugs.url = ${JSON.stringify(bugsUrl)}, must be "${NPM_BUGS_URL}"`);
    }
    if (readme !== undefined) problems.push(readme);
    out.push({ dir, name, problems });
  }
  const failures = Array.isArray(discovery?.failures) ? [...discovery.failures] : [];
  return {
    packages: out,
    discoveryFailures: failures,
    ...(typeof discovery?.unreadableRoot === 'string' ? { unreadableRoot: discovery.unreadableRoot } : {}),
  };
}
