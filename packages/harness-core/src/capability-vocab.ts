/**
 * Shared capability vocabulary — the single source of truth for how the harness
 * classifies agent capabilities, used by BOTH `mcp-scan` (project settings audit)
 * and `benchmark` (per-skill S15 capability-declaration check).
 *
 * Keeping these regexes/sets here (rather than private to mcp-scan) guarantees the
 * project-level scan and the per-skill manifest speak ONE diffable vocabulary.
 *
 * @packageDocumentation
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/** The capability classes the harness recognises. */
export type CapabilityClass = 'shell' | 'network' | 'file-write' | 'secrets' | 'mcp' | 'policy';

// --- Claude permission-grammar tool sets (lowercase for case-insensitive tests) ---
export const SHELL_TOOLS = new Set(['bash', 'powershell', 'shell']);
export const NETWORK_TOOLS = new Set(['webfetch', 'websearch']);
export const WRITE_TOOLS = new Set(['write', 'edit', 'multiedit', 'notebookedit']);
export const READ_TOOLS = new Set(['read']);
/** Recognised + benign tools (so they aren't flagged "unknown"). */
export const SAFE_TOOLS = new Set([
  'glob', 'grep', 'task', 'bashoutput', 'killbash', 'todowrite',
  'notebookread', 'slashcommand', 'exitplanmode', 'ls',
]);

/** Interpreter binaries that can run arbitrary code. */
export const INTERPRETER_RE = /^(bash|sh|zsh|fish|node|nodejs|python\d?|deno|ruby|perl|php)$/i;
/** Package runners that fetch + execute arbitrary remote code. */
export const PACKAGE_RUNNERS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'uvx', 'uv', 'pipx', 'bunx', 'bun', 'deno']);
/** Inline-code argument flags. */
export const INLINE_CODE_ARGS = new Set(['-c', '-e', '-eval', '--eval', '-p']);

/** Binaries that imply outbound network. */
export const SHELL_NET_RE = /\b(curl|wget|nc|ncat|netcat|ssh|scp|sftp|telnet|ftp)\b/i;
/** Binaries / redirects that imply filesystem writes. */
export const SHELL_WRITE_RE = /\b(rm|mv|cp|tee|dd|truncate|chmod|chown|mkfifo)\b|>>?/;
/** Concrete secret-file location patterns (not bare "secret"/"credential" substrings). */
export const SECRET_FILE_RE =
  /\.env\b|\.env\.|id_rsa|id_ed25519|id_ecdsa|\.ssh\/|\.aws\/|\.config\/gcloud|application_default_credentials|\.npmrc|\.netrc|\.git-credentials|\.kube\/config|\.pem\b|\.p12\b|\.pfx\b|\.key\b/i;

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// permission-grammar helpers
// ---------------------------------------------------------------------------

/** Parse a Claude permission grant like `Bash(git *)` → `{ tool, arg }`. Never throws. */
export function parseGrant(grant: unknown): { tool: string; arg: string | null } {
  if (typeof grant !== 'string') return { tool: '', arg: null };
  const s = grant.trim();
  const m = /^([A-Za-z_][\w-]*)\s*\((.*)\)\s*$/.exec(s);
  if (m) return { tool: m[1] ?? s, arg: m[2] ?? null };
  const id = /^([A-Za-z_][\w-]*|\*)/.exec(s);
  return { tool: id ? (id[1] ?? s) : s, arg: null };
}

export function isWildcard(arg: string | null): boolean {
  return arg === null || arg.trim() === '' || arg.includes('*');
}

export function toolKind(tool: string): CapabilityClass | 'read' | 'safe' | 'unknown' {
  const t = tool.toLowerCase();
  if (t === '*') return 'shell';
  if (SHELL_TOOLS.has(t)) return 'shell';
  if (NETWORK_TOOLS.has(t)) return 'network';
  if (WRITE_TOOLS.has(t)) return 'file-write';
  if (READ_TOOLS.has(t)) return 'read';
  if (t.startsWith('mcp__')) return 'mcp';
  if (SAFE_TOOLS.has(t)) return 'safe';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// script capability detection (for the per-skill S15 check)
// ---------------------------------------------------------------------------

/** Self-declared capability surface parsed from a skill's `capabilities:` block. */
export interface DeclaredCapabilities {
  network?: boolean;
  shell?: boolean;
  'file-write'?: boolean;
  dangerous?: boolean;
}

/** Capabilities statically detected in a skill's `scripts/`. P1: network + shell only. */
export interface DetectedCapabilities {
  network: boolean;
  shell: boolean;
}

/** Strip heredoc bodies (`<<EOF … EOF`, incl. `<<-'EOF'`) — unquoted free text. */
function stripHeredocs(text: string): string {
  return text.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n[ \t]*\2\b/g, ' ');
}

/** Strip comments + heredocs (keeps string literals — curl inside an arg string is real). */
export function stripComments(text: string): string {
  return stripHeredocs(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')        // /* paired block */
    .replace(/\/\*[\s\S]*$/g, ' ')            // unterminated block → EOF
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')    // // line (not http://)
    .replace(/(^|\s)#[^\n]*/g, '$1 ');        // # shell/py
}

/**
 * Strip comments, heredocs AND quoted string literals. Used for the IDENTIFIER
 * pass (fetch/axios/execSync/http modules) where the token is real code, never a
 * quoted search pattern — this is what kills FPs like `grep "writeFileSync"`.
 */
export function stripCodeNoise(text: string): string {
  return stripComments(text)
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ');
}

const SCRIPT_EXTS = new Set(['.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.ts', '.py', '.rb', '.pl', '.php']);

// command position = line start, after a shell separator, after `sudo`/`do`/`then`,
// inside `$( )`, or right after an opening quote (covers subprocess.run("curl …")).
const CMD_PREFIX = `(?:^|[;&|(\\n]|&&|\\|\\||\\$\\(|\\bsudo\\s+|\\bthen\\s+|\\bdo\\s+|["'\`])\\s*`;
// the next token must look like an argument/subcommand (a word/path/flag), not an
// operator — so `uv = coord` / `ssh = cfg` (assignments) and `grep "curl"` don't match.
const ARG_FOLLOWS = `(?=\\s+[\\w./~-])`;
// a network binary AT command position, followed by an argument.
const CMD_NET_RE = new RegExp(`${CMD_PREFIX}(curl|wget|nc|ncat|netcat|ssh|scp|sftp|telnet|ftp)\\b${ARG_FOLLOWS}`, 'i');
// a package-runner / interpreter AT command position, followed by an argument → shell.
const CMD_SHELL_RE = new RegExp(
  `${CMD_PREFIX}(${[...PACKAGE_RUNNERS].join('|')}|python\\d?|node|nodejs|bash|sh|zsh|ruby|perl|php)\\b${ARG_FOLLOWS}`,
  'i',
);
// network via library identifiers (matched on noise-stripped code — never in a quote).
const NETWORK_CALL_RE =
  /\bfetch\s*\(|\baxios\b|WebFetch\s*\(|\bWebSearch\b|\brequests\.|\burllib3?\b|\bhttpx\b|\baiohttp\b|\bparamiko\b|\bsmtplib\b|\bftplib\b|\bhttp\.client\b|\bsocket\.(?:socket|create_connection)\s*\(|\b(?:https?|net|dgram|tls|dns)\.(?:get|request|createConnection|connect|createSocket|resolve\w*)\s*\(|\bnew\s+WebSocket\b|(?:require\(|from\s+)['"](?:node:)?(?:http|https|net|dgram|tls|ws|node-fetch|got|undici)['"]/;
// shell exec via library identifiers (language-agnostic).
const EXEC_CALL_RE =
  /child_process|execSync|execFileSync|spawnSync|\bspawn\s*\(|\bexec(?:File)?\s*\(|\bsubprocess\b|\bos\.system\b|\bos\.popen\b|\bPopen\b|\bOpen3\b|\bcommands\.get(?:status)?output\b|%x[([{]|(?:^|[^.\w])system\s*\(/m;

function isProbablyBinary(buf: string): boolean {
  return /[\x00-\x08\x0E-\x1F]/.test(buf);
}

function collectScriptFiles(dir: string, depth: number, acc: string[]): void {
  if (depth > 3 || acc.length >= 200) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (acc.length >= 200) return;
    const abs = join(dir, name);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      collectScriptFiles(abs, depth + 1, acc);
    } else if (st.isFile() && st.size <= 256 * 1024) {
      acc.push(abs);
    }
  }
}

/**
 * Statically detect network + shell capability usage in a skill's `scripts/`.
 * Reads only `scripts/` (never SKILL.md prose), recursively (bounded), skipping
 * binary / symlinked / oversized files. Deterministic, no execution.
 *
 * Known scope (Phase 1, by design — documented, not bugs): file-write and
 * `dangerous` are not auto-detected; dynamically-assembled commands
 * (`$RUNNER install`, eval'd strings) and indirected calls evade static regexes.
 * S15 is a best-effort self-consistency LINT, not a sandbox.
 */
export function detectScriptCapabilities(skillDir: string): DetectedCapabilities {
  const out: DetectedCapabilities = { network: false, shell: false };
  const scriptsDir = join(skillDir, 'scripts');
  if (!existsSync(scriptsDir)) return out;

  const files: string[] = [];
  collectScriptFiles(scriptsDir, 0, files);

  for (const abs of files) {
    const ext = extname(abs).toLowerCase();
    let raw: string;
    try {
      raw = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    if (isProbablyBinary(raw)) continue;

    const hasShebang = /^#!/.test(raw);
    const isShellExt = ext === '.sh' || ext === '.bash' || ext === '.zsh';
    // shell scripts (by extension, or extensionless with a shell shebang) ARE shell usage
    if (isShellExt || (ext === '' && /^#![^\n]*\b(bash|sh|zsh)\b/.test(raw))) out.shell = true;
    if (!SCRIPT_EXTS.has(ext) && !hasShebang) continue;

    const commentless = stripComments(raw); // strings kept → curl in an arg string survives
    const noiseless = stripCodeNoise(raw); // strings gone → identifier pass

    if (CMD_NET_RE.test(commentless) || NETWORK_CALL_RE.test(noiseless)) out.network = true;
    if (out.shell || CMD_SHELL_RE.test(commentless) || EXEC_CALL_RE.test(noiseless)) out.shell = true;
  }
  return out;
}

/**
 * Parse the `capabilities:` block from a SKILL.md document. Reads only the
 * frontmatter region (the first `---`-fenced block) and only DIRECT children of
 * `capabilities:` (so a nested `limits.network` is never mistaken for a top-level
 * declaration). Absent block or absent key → `undefined` ("not asserted").
 */
export function parseDeclaredCapabilities(skillMd: string): DeclaredCapabilities {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd);
  const fm = fmMatch ? (fmMatch[1] ?? '') : '';
  const block = /^capabilities:[ \t]*\r?\n((?:[ \t]+.*\r?\n?)*)/m.exec(fm);
  if (!block) return {};
  const lines = (block[1] ?? '').split('\n');
  const firstReal = lines.find((l) => l.trim() !== '');
  if (!firstReal) return {};
  const childIndent = (/^[ \t]*/.exec(firstReal)?.[0]) ?? '';

  const out: DeclaredCapabilities = {};
  const read = (key: string): boolean | undefined => {
    const re = new RegExp(`^${childIndent}${key.replace('-', '\\-')}:[ \\t]*(true|false)\\b`);
    for (const l of lines) {
      const m = re.exec(l);
      if (m) return m[1] === 'true';
    }
    return undefined;
  };
  const network = read('network');
  const shell = read('shell');
  const fileWrite = read('file-write');
  const dangerous = read('dangerous');
  if (network !== undefined) out.network = network;
  if (shell !== undefined) out.shell = shell;
  if (fileWrite !== undefined) out['file-write'] = fileWrite;
  if (dangerous !== undefined) out.dangerous = dangerous;
  return out;
}

/** Declared runtime limits (inert today — no enforcement home in Claude Code settings). */
export interface DeclaredLimits {
  toolTimeoutMs?: number;
  maxToolCallsPerTurn?: number;
  requireApprovalForDangerous?: boolean;
}

/**
 * Parse the nested `capabilities.limits` block from a SKILL.md frontmatter.
 * Fail-open: a malformed/absent block yields `{}` (never throws). These values
 * are INERT — Claude Code settings.json has no timeout/rate-limit field; they are
 * only machine-actionable in an MCP host's policy.json.
 */
export function parseDeclaredLimits(skillMd: string): DeclaredLimits {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd);
  const fm = fmMatch ? (fmMatch[1] ?? '') : '';
  // Anchor under capabilities: — only a `limits:` that is a DIRECT child of
  // capabilities counts (not some unrelated indented `limits:` elsewhere).
  const capBlock = /^capabilities:[ \t]*\r?\n((?:[ \t]+.*\r?\n?)*)/m.exec(fm);
  if (!capBlock) return {};
  const capLines = (capBlock[1] ?? '').split('\n');
  const firstReal = capLines.find((l) => l.trim() !== '');
  if (!firstReal) return {};
  const childIndent = (/^[ \t]*/.exec(firstReal)?.[0]) ?? '';

  // find the `limits:` line at the capabilities-child indent, then capture only
  // its strictly-deeper-indented children.
  const limitsIdx = capLines.findIndex((l) => new RegExp(`^${childIndent}limits:[ \\t]*$`).test(l));
  if (limitsIdx === -1) return {};
  const body: string[] = [];
  for (let i = limitsIdx + 1; i < capLines.length; i++) {
    const l = capLines[i] ?? '';
    if (l.trim() === '') continue;
    const indent = (/^[ \t]*/.exec(l)?.[0]) ?? '';
    if (indent.length <= childIndent.length) break; // back to a sibling → end of limits
    body.push(l);
  }
  const text = body.join('\n');
  const out: DeclaredLimits = {};
  const num = (key: string): number | undefined => {
    const m = new RegExp(`^[ \\t]+${key}:[ \\t]*(\\d+)\\b`, 'm').exec(text);
    if (!m) return undefined;
    const n = Number(m[1]);
    return Number.isSafeInteger(n) && n >= 0 ? n : undefined; // fail-open on absurd values
  };
  const bool = (key: string): boolean | undefined => {
    const m = new RegExp(`^[ \\t]+${key}:[ \\t]*(true|false)\\b`, 'm').exec(text);
    return m ? m[1] === 'true' : undefined;
  };
  const tt = num('toolTimeoutMs');
  const mc = num('maxToolCallsPerTurn');
  const ra = bool('requireApprovalForDangerous');
  if (tt !== undefined) out.toolTimeoutMs = tt;
  if (mc !== undefined) out.maxToolCallsPerTurn = mc;
  if (ra !== undefined) out.requireApprovalForDangerous = ra;
  return out;
}
