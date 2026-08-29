#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const PAGE_BYTE_LIMIT = 1_048_576;
export const BRIEF_BYTE_LIMIT = 262_144;
export const EVIDENCE_BYTE_LIMIT = 1_048_576;
export const PARSER_BUNDLE_BYTE_LIMIT = 524_288;
export const PREIMPORT_MODULE_BYTE_LIMIT = 262_144;
export const CSS_BLOCK_LIMIT = 4_096;
export const CSS_NESTING_LIMIT = 64;
export const STRUCTURED_DEPTH_LIMIT = 64;
export const PREIMPORT_PROJECTION_SHA256 = Object.freeze({
  'scripts/verify-story-semantics.mjs': '13f703cd21051adf934b8be404f902a3ebba260c4ff6b26645016ef142989300',
  'vendor/parse5.bundle.mjs': '67ad160b1d7dc6a36314459390148ad4699732f4c503e90790e6fced5c11c528',
  'scripts/extract-package-evidence.mjs': 'ee175aa24fde44dba2df4b42f6d91a6060b29f0f2934d136c5b090d22d1c8efa',
  'scripts/render-story-page.mjs': 'da9a444761650001175ef5a5cba4697f0eafacd28ce3fe74132e84aec8c54a8b',
  'scripts/story-schema.mjs': 'dfd7dbfa0ee87fa56f5cbaad1c66434632046571e1fcb96678512f6ab9dd5074',
});
export const SEMANTIC_PROJECTION_SHA256 = Object.freeze({
  'scripts/verify-story-semantics.mjs': PREIMPORT_PROJECTION_SHA256['scripts/verify-story-semantics.mjs'],
  'vendor/parse5.bundle.mjs': PREIMPORT_PROJECTION_SHA256['vendor/parse5.bundle.mjs'],
});
export const EXPECTED_SEMANTIC_CHECK_IDS = Object.freeze([
  'page.html-parser-threw', 'page.html-parse', 'page.html-subset', 'page.structure',
  'page.style-count', 'page.style-authority', 'page.links', 'page.item-copy', 'page.copy',
  'page.item-bindings', 'page.controls', 'source.closure', 'page.unknown-labels', 'page.claims',
  'page.synthetic-label', 'page.schema', 'page.language', 'story.order', 'page.visuals',
  'page.external-assets', 'page.javascript', 'page.unsafe-html', 'page.inline-style',
  'page.semantic-query-threw',
]);

export function safeJsonBudget(value, limit, id) {
  try {
    const body = JSON.stringify(value);
    const bytes = Buffer.byteLength(body, 'utf8');
    return { pass: bytes <= limit, bytes, serialized: body, id, detail: bytes <= limit ? `${id} is within ${limit} bytes` : `${id} exceeds ${limit} bytes` };
  } catch (error) {
    return { pass: false, bytes: null, id, detail: `${id} cannot be safely serialized: ${error?.message ?? String(error)}` };
  }
}

export function parseBudgetedJson(budget, label) {
  try {
    if (budget?.pass !== true || typeof budget.serialized !== 'string') {
      throw new TypeError(`${label} has no accepted serialized JSON`);
    }
    return { pass: true, value: JSON.parse(budget.serialized), detail: `${label} serialized JSON parsed` };
  } catch (error) {
    return { pass: false, value: null, detail: `${label} serialized JSON cannot be parsed: ${error?.message ?? String(error)}` };
  }
}

function lexJavaScript(source) {
  const tokens = [];
  let index = 0;
  const regexPrefixPunct = new Set(['(', '{', '[', ',', ';', ':', '=', '!', '?', '+', '-', '*', '%', '&', '|', '^', '~', '<', '>']);
  const regexPrefixKeywords = new Set(['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'yield', 'await', 'else', 'do']);
  const controlHeadKeywords = new Set(['if', 'while', 'for', 'with', 'switch', 'catch']);
  const closesControlHead = () => {
    if (tokens.at(-1)?.value !== ')') return false;
    let depth = 0;
    for (let cursor = tokens.length - 1; cursor >= 0; cursor -= 1) {
      if (tokens[cursor].value === ')') depth += 1;
      else if (tokens[cursor].value === '(') {
        depth -= 1;
        if (depth === 0) return controlHeadKeywords.has(tokens[cursor - 1]?.value);
      }
    }
    return false;
  };
  const canStartRegex = () => {
    const previous = tokens.at(-1);
    return previous === undefined
      || (previous.type === 'punct' && regexPrefixPunct.has(previous.value))
      || (previous.type === 'id' && regexPrefixKeywords.has(previous.value))
      || closesControlHead()
      || (previous.value === '}' && previous.block === true);
  };
  const regexToken = () => {
    index += 1;
    let inClass = false;
    let raw = '';
    while (index < source.length) {
      const char = source[index++];
      if (char === '\\') { raw += `${char}${source[index] ?? ''}`; index += 1; continue; }
      if (char === '[') { raw += char; inClass = true; continue; }
      if (char === ']' && inClass) { raw += char; inClass = false; continue; }
      if (char === '/' && !inClass) {
        while (index < source.length && /[A-Za-z]/.test(source[index])) index += 1;
        const ambiguousDynamicImport = /\bimport\b[\s\S]*\(/.test(raw);
        tokens.push({ type: ambiguousDynamicImport ? 'invalid' : 'regex', value: ambiguousDynamicImport ? 'ambiguous-dynamic-import-regex' : '<regex>' });
        return;
      }
      raw += char;
      if (char === '\n' || char === '\r') {
        tokens.push({ type: 'invalid', value: 'unterminated-regex' });
        return;
      }
    }
    tokens.push({ type: 'invalid', value: 'unterminated-regex' });
  };
  const identifierEscape = () => {
    if (source[index] !== '\\' || source[index + 1] !== 'u') return null;
    if (source[index + 2] === '{') {
      const close = source.indexOf('}', index + 3);
      const digits = close >= 0 ? source.slice(index + 3, close) : '';
      if (!/^[0-9a-f]{1,6}$/i.test(digits)) return null;
      const value = String.fromCodePoint(Number.parseInt(digits, 16));
      index = close + 1;
      return value;
    }
    const digits = source.slice(index + 2, index + 6);
    if (!/^[0-9a-f]{4}$/i.test(digits)) return null;
    index += 6;
    return String.fromCharCode(Number.parseInt(digits, 16));
  };
  const stringToken = (quote) => {
    index += 1;
    let value = '';
    while (index < source.length) {
      const char = source[index++];
      if (char === quote) break;
      if (char !== '\\') { value += char; continue; }
      const escaped = source[index++] ?? '';
      if (escaped === 'x' && /^[0-9a-f]{2}/i.test(source.slice(index, index + 2))) {
        value += String.fromCharCode(Number.parseInt(source.slice(index, index + 2), 16)); index += 2;
      } else if (escaped === 'u' && source[index] === '{') {
        const close = source.indexOf('}', index + 1);
        const digits = close >= 0 ? source.slice(index + 1, close) : '';
        if (/^[0-9a-f]{1,6}$/i.test(digits)) { value += String.fromCodePoint(Number.parseInt(digits, 16)); index = close + 1; }
        else value += 'u';
      } else if (escaped === 'u' && /^[0-9a-f]{4}/i.test(source.slice(index, index + 4))) {
        value += String.fromCharCode(Number.parseInt(source.slice(index, index + 4), 16)); index += 4;
      } else value += ({ n: '\n', r: '\r', t: '\t' })[escaped] ?? escaped;
    }
    tokens.push({ type: 'string', value });
  };
  const code = (stopAtTemplateBrace = false) => {
    let braces = 0;
    const braceKinds = [];
    while (index < source.length) {
      const char = source[index];
      if (/\s/.test(char)) { index += 1; continue; }
      if (char === '/' && source[index + 1] === '/') {
        index += 2; while (index < source.length && !/[\r\n]/.test(source[index])) index += 1; continue;
      }
      if (char === '/' && source[index + 1] === '*') {
        index += 2; while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
        index += 2; continue;
      }
      if (char === '/' && canStartRegex()) { regexToken(); continue; }
      if (char === '"' || char === "'") { stringToken(char); continue; }
      if (char === '`') {
        index += 1;
        let value = '';
        let dynamic = false;
        while (index < source.length) {
          if (source[index] === '\\') { value += source[index + 1] ?? ''; index += 2; continue; }
          if (source[index] === '`') { index += 1; break; }
          if (source[index] === '$' && source[index + 1] === '{') { dynamic = true; index += 2; code(true); continue; }
          value += source[index]; index += 1;
        }
        tokens.push({ type: dynamic ? 'template' : 'string', value });
        continue;
      }
      if (stopAtTemplateBrace && char === '}' && braces === 0) { index += 1; return; }
      if (char === '{') {
        const previous = tokens.at(-1);
        const block = previous === undefined || previous.value === ')' || previous.value === ';'
          || (previous.type === 'id' && ['else', 'try', 'finally', 'do', 'catch'].includes(previous.value))
          || (previous.value === '>' && tokens.at(-2)?.value === '=');
        braceKinds.push(block);
        braces += 1;
        tokens.push({ type: 'punct', value: '{', block });
        index += 1;
        continue;
      }
      if (char === '}') {
        braces -= 1;
        tokens.push({ type: 'punct', value: '}', block: braceKinds.pop() ?? true });
        index += 1;
        continue;
      }
      if (/[A-Za-z_$]/.test(char) || (char === '\\' && source[index + 1] === 'u')) {
        let value = '';
        while (index < source.length) {
          if (/[A-Za-z0-9_$]/.test(source[index])) { value += source[index]; index += 1; continue; }
          const decoded = identifierEscape();
          if (decoded !== null && /^[A-Za-z0-9_$]$/.test(decoded)) { value += decoded; continue; }
          break;
        }
        tokens.push({ type: 'id', value });
        continue;
      }
      if (/[0-9]/.test(char)) {
        const start = index++;
        while (index < source.length && /[0-9A-Fa-f_xX]/.test(source[index])) index += 1;
        tokens.push({ type: 'number', value: source.slice(start, index) });
        continue;
      }
      tokens.push({ type: 'punct', value: char });
      index += 1;
    }
  };
  code();
  return tokens;
}

const FORBIDDEN_GLOBALS = new Set(['fetch', 'WebSocket', 'eval', 'Function', 'WebAssembly', 'require']);
const FORBIDDEN_PROCESS = new Set(['getBuiltinModule', 'dlopen']);

function computedProperty(tokens, open) {
  const values = [];
  let hasTemplate = false;
  let index = open + 1;
  while (tokens[index] && tokens[index].value !== ']') {
    if (tokens[index].type === 'template') hasTemplate = true;
    if (tokens[index].type === 'string') values.push(tokens[index].value);
    else if (tokens[index].value !== '+') return { value: null, end: index, dynamic: true, hasTemplate };
    index += 1;
  }
  return { value: values.join(''), end: index, dynamic: false, hasTemplate };
}

function isMemberBracket(tokens, open) {
  const previous = tokens[open - 1];
  return previous?.type === 'id'
    || previous?.type === 'string'
    || previous?.type === 'number'
    || [')', ']', '}'].includes(previous?.value);
}

const reviewedGeneratedBundle = (file) => file.path === 'vendor/parse5.bundle.mjs'
  && SEMANTIC_PROJECTION_SHA256[file.path] === createHash('sha256').update(file.source, 'utf8').digest('hex');

export function scanExecutableCapabilities(files) {
  const failures = [];
  for (const file of files) {
    const tokens = lexJavaScript(file.source);
    for (const token of tokens) {
      if (token.type === 'invalid') failures.push(`${file.path}: invalid JavaScript token ${token.value}`);
    }
    if (!reviewedGeneratedBundle(file) && tokens.some((token) => token.type === 'punct' && token.value === '/')) {
      failures.push(`${file.path}: unclassified slash is rejected outside the pinned generated bundle`);
    }
    const aliases = new Map([['globalThis', 'globalThis'], ['global', 'globalThis'], ['process', 'process']]);
    const capabilityAliases = new Set();
    const safeIdentifiers = new Set();
    const forbiddenProperty = (root, property) => root === 'globalThis'
      ? FORBIDDEN_GLOBALS.has(property)
      : root === 'process' && (property === null || FORBIDDEN_PROCESS.has(property));
    const propertyAt = (rootIndex) => {
      if (tokens[rootIndex + 1]?.value === '.' && tokens[rootIndex + 2]?.type === 'id') {
        return { property: tokens[rootIndex + 2].value, end: rootIndex + 2, dynamic: false };
      }
      if (tokens[rootIndex + 1]?.value === '[') {
        const computed = computedProperty(tokens, rootIndex + 1);
        return { property: computed.value, end: computed.end, dynamic: computed.dynamic };
      }
      return { property: null, end: rootIndex, dynamic: false };
    };
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (['const', 'let', 'var'].includes(token.value) && tokens[index + 1]?.type === 'id' && tokens[index + 2]?.value === '=') {
        const local = tokens[index + 1].value;
        const sourceIndex = index + 3;
        const sourceRoot = tokens[sourceIndex]?.type === 'id' ? aliases.get(tokens[sourceIndex].value) : null;
        if (sourceRoot) {
          const selected = propertyAt(sourceIndex);
          if (selected.dynamic) failures.push(`${file.path}: forbidden dynamic computed ${sourceRoot} capability`);
          if (selected.property === null) aliases.set(local, sourceRoot);
          else if (forbiddenProperty(sourceRoot, selected.property)) capabilityAliases.add(local);
        } else if (FORBIDDEN_GLOBALS.has(tokens[sourceIndex]?.value) || capabilityAliases.has(tokens[sourceIndex]?.value)) {
          capabilityAliases.add(local);
        } else {
          safeIdentifiers.add(local);
        }
      }
      if (['const', 'let', 'var'].includes(token.value) && tokens[index + 1]?.value === '{') {
        let close = index + 2;
        while (tokens[close] && tokens[close].value !== '}') close += 1;
        const sourceRoot = tokens[close + 1]?.value === '=' && tokens[close + 2]?.type === 'id'
          ? aliases.get(tokens[close + 2].value) : null;
        if (sourceRoot) {
          for (let cursor = index + 2; cursor < close;) {
            if (tokens[cursor]?.type !== 'id') { cursor += 1; continue; }
            const property = tokens[cursor].value;
            const local = tokens[cursor + 1]?.value === ':' && tokens[cursor + 2]?.type === 'id'
              ? tokens[cursor + 2].value : property;
            if (forbiddenProperty(sourceRoot, property)) capabilityAliases.add(local);
            cursor += tokens[cursor + 1]?.value === ':' ? 3 : 1;
            if (tokens[cursor]?.value === ',') cursor += 1;
          }
        }
      }
      if (token.value === 'import' && tokens[index + 1]?.value === '(') failures.push(`${file.path}: forbidden dynamic import capability`);
      if (token.type === 'id' && tokens[index - 1]?.value !== '.' && !safeIdentifiers.has(token.value)
        && (FORBIDDEN_GLOBALS.has(token.value) || token.value === 'globalThis' || token.value === 'global' || token.value === 'Reflect' || token.value === 'process')) {
        failures.push(`${file.path}: forbidden capability reference ${token.value}`);
      }
      if (token.value === 'constructor' && tokens[index - 1]?.value === '.') {
        failures.push(`${file.path}: forbidden constructor-chain capability`);
      }
      if (token.type === 'string' && token.value === 'constructor' && tokens[index - 1]?.value === '[') {
        failures.push(`${file.path}: forbidden computed constructor-chain capability`);
      }
      if ((token.type === 'string' || token.type === 'template') && token.value === 'constructor') {
        failures.push(`${file.path}: forbidden constructor reflection capability`);
      }
      if (token.value === '[') {
        const computed = computedProperty(tokens, index);
        if (isMemberBracket(tokens, index) && computed.hasTemplate) {
          failures.push(`${file.path}: forbidden template-computed member capability`);
        }
        if (!computed.dynamic && computed.value === 'constructor') {
          failures.push(`${file.path}: forbidden folded constructor-chain capability`);
        }
      }
      const root = token.type === 'id' && tokens[index - 1]?.value !== '.' ? aliases.get(token.value) : null;
      if (root) {
        const selected = propertyAt(index);
        if (selected.dynamic) failures.push(`${file.path}: forbidden dynamic computed ${root} capability`);
        if (forbiddenProperty(root, selected.property)) failures.push(`${file.path}: forbidden ${root}.${selected.property ?? '*'} capability`);
      }
      if (token.value === 'Reflect' && tokens[index + 1]?.value === '.' && tokens[index + 2]?.value === 'get'
        && tokens[index + 3]?.value === '(') {
        const reflectedRoot = aliases.get(tokens[index + 4]?.value);
        const property = tokens[index + 5]?.value === ',' && tokens[index + 6]?.type === 'string'
          ? tokens[index + 6].value : null;
        if (reflectedRoot && (property === null || forbiddenProperty(reflectedRoot, property))) {
          failures.push(`${file.path}: forbidden Reflect.get ${reflectedRoot}.${property ?? '*'} capability`);
        }
      }
      if (FORBIDDEN_GLOBALS.has(token.value) && tokens[index + 1]?.value === '('
        && !['function', 'class'].includes(tokens[index - 1]?.value)) failures.push(`${file.path}: forbidden ${token.value} call`);
      if (capabilityAliases.has(token.value) && tokens[index + 1]?.value === '(') failures.push(`${file.path}: forbidden aliased ${token.value} capability`);
      if (token.value === 'WebAssembly' && ['.', '['].includes(tokens[index + 1]?.value)) failures.push(`${file.path}: forbidden WebAssembly capability`);
    }
  }
  return { pass: failures.length === 0, failures };
}

export function classifyStaticModuleParserRun(run, path) {
  const unavailable = (detail) => ({ specifiers: [], failure: `${path}: Node module parser unavailable: ${detail}` });
  if (run?.error) return unavailable(run.error?.message ?? String(run.error));
  if (run?.signal) return unavailable(`terminated by ${run.signal}`);
  if (typeof run?.stdout !== 'string' || run.stdout === '') return unavailable('empty parser response');
  try {
    const result = JSON.parse(run.stdout);
    if (result?.kind === 'requests' && Array.isArray(result.specifiers)
      && result.specifiers.every((item) => typeof item === 'string') && run?.status === 0) {
      return { specifiers: result.specifiers, failure: null };
    }
    if (result?.kind === 'source-rejection' && typeof result.message === 'string') {
      return { specifiers: [], failure: `${path}: Node module parser rejected source: ${result.message}` };
    }
    if (result?.kind === 'parser-unavailable') return unavailable(result.message ?? 'untyped parser failure');
    if (result?.kind === 'requests') {
      if (!Array.isArray(result.specifiers)) return unavailable('request response has no specifier array');
      const invalidIndex = result.specifiers.findIndex((item) => typeof item !== 'string');
      if (invalidIndex >= 0) return unavailable(`request response has a non-string specifier at index ${invalidIndex}`);
      return unavailable(`request response exited with status ${run?.status}`);
    }
    return unavailable(`unexpected response kind ${JSON.stringify(result?.kind ?? null)}`);
  } catch (error) {
    return unavailable(`invalid JSON response: ${error?.message ?? String(error)}`);
  }
}

export function moduleRequestSpecifiers(module) {
  if (Array.isArray(module?.moduleRequests)) {
    if (!module.moduleRequests.every((request) => typeof request?.specifier === 'string')) return null;
    if (module.moduleRequests.length > 0 || !Array.isArray(module?.dependencySpecifiers)) {
      return module.moduleRequests.map((request) => request.specifier);
    }
  }
  if (Array.isArray(module?.dependencySpecifiers)) {
    return module.dependencySpecifiers.every((specifier) => typeof specifier === 'string')
      ? [...module.dependencySpecifiers]
      : null;
  }
  return null;
}

export function parserChildEnvironment(environment = process.env) {
  const parserEnvironment = { ...environment };
  for (const key of Object.keys(parserEnvironment)) {
    if (key.toUpperCase() === 'NODE_OPTIONS') delete parserEnvironment[key];
  }
  return parserEnvironment;
}

export function parseStaticModuleSpecifiers(source, path, environment = process.env) {
  const parser = [
    "import { readFileSync } from 'node:fs';",
    "import { SourceTextModule } from 'node:vm';",
    `const moduleRequestSpecifiers=${moduleRequestSpecifiers.toString()};`,
    "const source=readFileSync(process.argv[1],'utf8');",
    "try {",
    " const module=new SourceTextModule(source);",
    " const specifiers=moduleRequestSpecifiers(module);",
    " if(specifiers===null) process.stdout.write(JSON.stringify({kind:'parser-unavailable',message:'SourceTextModule exposes neither a valid moduleRequests nor dependencySpecifiers inventory'}));",
    " else process.stdout.write(JSON.stringify({kind:'requests',specifiers}));",
    "} catch (error) {",
    " const kind=error?.name==='SyntaxError'?'source-rejection':'parser-unavailable';",
    " process.stdout.write(JSON.stringify({kind,message:error?.message ?? String(error)}));",
    "}",
  ].join('');
  let scratch = null;
  try {
    scratch = mkdtempSync(join(tmpdir(), 'story-module-parser-'));
    const input = join(scratch, 'input.mjs');
    writeFileSync(input, source);
    const parserEnvironment = parserChildEnvironment(environment);
    const run = spawnSync(process.execPath, ['--no-warnings', '--experimental-vm-modules', '--input-type=module', '-e', parser, input], {
      encoding: 'utf8', timeout: 10_000, maxBuffer: 1_048_576, env: parserEnvironment,
    });
    return classifyStaticModuleParserRun(run, path);
  } catch (error) {
    return { specifiers: [], failure: `${path}: Node module parser unavailable: ${error?.message ?? String(error)}` };
  } finally {
    if (scratch !== null) {
      try { rmSync(scratch, { recursive: true, force: true }); } catch {}
    }
  }
}

export function scanSemanticImportGraph(files, entry = 'scripts/verify-story-semantics.mjs') {
  const sources = new Map(files.map((file) => [file.path.split('\\').join('/'), file.source]));
  const failures = [];
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const source = sources.get(path);
    if (source === undefined) { failures.push(`${path}: unresolved module`); return; }
    const tokens = lexJavaScript(source);
    for (const token of tokens) {
      if (token.type === 'invalid') failures.push(`${path}: invalid JavaScript token ${token.value}`);
    }
    if (!reviewedGeneratedBundle({ path, source })
      && tokens.some((token) => token.type === 'punct' && token.value === '/')) {
      failures.push(`${path}: unclassified slash is forbidden in the semantic projection`);
    }
    const parsed = parseStaticModuleSpecifiers(source, path);
    if (parsed.failure) failures.push(parsed.failure);
    const specifiers = parsed.specifiers ?? [];
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].value === 'import') {
        if (tokens[index + 1]?.value === '(') failures.push(`${path}: dynamic import forbidden`);
      }
    }
    for (const specifier of specifiers) {
      if (specifier === 'node:crypto') continue;
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) { failures.push(`${path}: forbidden specifier ${specifier}`); continue; }
      const parts = path.split('/').slice(0, -1);
      let escaped = false;
      for (const segment of specifier.split('/')) {
        if (segment === '.' || segment === '') continue;
        if (segment === '..') { if (parts.length === 0) escaped = true; else parts.pop(); }
        else parts.push(segment);
      }
      const target = parts.join('/');
      if (escaped || !target.endsWith('.mjs') || target.split('/').includes('node_modules')) {
        failures.push(`${path}: import escapes, enters node_modules, or is not .mjs: ${specifier}`); continue;
      }
      if (/(?:^|\/)render-story-page\.mjs$/.test(target)) { failures.push(`${path}: semantic graph reaches canonical renderer`); continue; }
      visit(target);
    }
  };
  visit(entry.split('\\').join('/'));
  return { pass: failures.length === 0, failures, visited: [...seen].sort() };
}

const verifierDir = dirname(fileURLToPath(import.meta.url));
const projectionRoot = resolve(verifierDir, '..');
function readPreImportBytes(path, limit = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(fsConstants.O_RDONLY) || !Number.isInteger(fsConstants.O_NOFOLLOW)) {
    throw new Error('semantic pre-import integrity gate failed: O_NOFOLLOW is unavailable');
  }
  let descriptor;
  try {
    descriptor = openSync(resolve(projectionRoot, path), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error(`${path} is not a regular file`);
    if (before.size > limit) throw new Error(`${path} is ${before.size}/${limit} bytes`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (before.size !== after.size || bytes.length !== after.size) throw new Error(`${path} changed during descriptor read`);
    return bytes;
  } catch (error) {
    throw new Error(`semantic pre-import integrity gate failed: ${error?.message ?? String(error)}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
const preImportInputPaths = Object.keys(PREIMPORT_PROJECTION_SHA256);
const preImportInputs = preImportInputPaths.map((path) => ({
  path,
  bytes: readPreImportBytes(path, path === 'vendor/parse5.bundle.mjs' ? PARSER_BUNDLE_BYTE_LIMIT : PREIMPORT_MODULE_BYTE_LIMIT),
}));
const semanticIntegrityFailures = preImportInputs.flatMap((file) => {
  const actual = createHash('sha256').update(file.bytes).digest('hex');
  const expected = PREIMPORT_PROJECTION_SHA256[file.path];
  return actual === expected ? [] : [`${file.path}: expected ${expected}, received ${actual}`];
});
if (semanticIntegrityFailures.length > 0) {
  throw new Error(`semantic pre-import integrity gate failed: ${semanticIntegrityFailures.join('; ')}`);
}
const semanticFiles = preImportInputs
  .filter((file) => Object.hasOwn(SEMANTIC_PROJECTION_SHA256, file.path))
  .map((file) => ({ path: file.path, source: file.bytes.toString('utf8') }));
const semanticGate = scanSemanticImportGraph(semanticFiles);
if (!semanticGate.pass) throw new Error(`semantic pre-import graph gate failed: ${semanticGate.failures.join('; ')}`);
const semanticInventory = Object.keys(SEMANTIC_PROJECTION_SHA256).sort();
if (JSON.stringify(semanticGate.visited) !== JSON.stringify(semanticInventory)) {
  throw new Error(`semantic pre-import graph gate failed: visited ${semanticGate.visited.join(', ')}, expected ${semanticInventory.join(', ')}`);
}
const semanticDiagnostic = scanExecutableCapabilities(semanticFiles);
if (!semanticDiagnostic.pass) throw new Error(`semantic pre-import defence-in-depth scan failed: ${semanticDiagnostic.failures.join('; ')}`);
const [extractorModule, rendererModule, schemaModule, semanticModule] = await Promise.all([
  import('./extract-package-evidence.mjs'),
  import('./render-story-page.mjs'),
  import('./story-schema.mjs'),
  import('./verify-story-semantics.mjs'),
]);
const {
  countSourceLines,
  readDescriptorBounded,
  SOURCE_AGGREGATE_BYTE_LIMIT,
  SOURCE_BYTE_LIMIT,
} = extractorModule;
const { renderStoryPage } = rendererModule;
const { canonicalJsonText, sha256Text, validateBrief, validateEvidence } = schemaModule;
const { verifyStorySemantics } = semanticModule;
export const PROVENANCE_FILE_BYTE_LIMIT = SOURCE_BYTE_LIMIT;

function args(argv) {
  const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
  return {
    brief: value('brief'), site: value('site'), evidence: value('evidence'),
    packageRoot: value('pkg'), json: value('json'),
  };
}

const sha = (body) => createHash('sha256').update(body).digest('hex');
const escaped = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const numericTokens = (value) => String(value).match(/\p{N}+(?:[.,]\p{N}+)*(?:\s*[%$€₽£])?/gu) ?? [];
const normalizedNumber = (value) => String(value).replace(/\s+/g, '');
const list = (value) => (Array.isArray(value) ? value : []);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
const dynamicCheckComponent = (value, fallback) => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) ? value : fallback;

function uniqueDynamicCheckComponents(items, key) {
  const bases = items.map((item, index) => dynamicCheckComponent(record(item)?.[key], `invalid-${index}`));
  const counts = new Map();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  const reserved = new Set(bases);
  const used = new Set();
  return bases.map((base, index) => {
    let candidate = base;
    if ((counts.get(base) ?? 0) > 1 || used.has(candidate)) {
      candidate = `${base}-duplicate-${index}`;
      while (reserved.has(candidate) || used.has(candidate)) candidate += '-x';
    }
    used.add(candidate);
    return candidate;
  });
}

function cssBlocks(css) {
  const blocks = [];
  const stack = [];
  let segmentStart = 0;
  for (let index = 0; index < css.length; index += 1) {
    if (css[index] === '{') {
      stack.push({ header: css.slice(segmentStart, index).trim(), bodyStart: index + 1 });
      if (stack.length > CSS_NESTING_LIMIT) return null;
      segmentStart = index + 1;
    } else if (css[index] === '}') {
      const block = stack.pop();
      if (block) {
        blocks.push({ header: block.header, body: css.slice(block.bodyStart, index) });
        if (blocks.length > CSS_BLOCK_LIMIT) return null;
      }
      segmentStart = index + 1;
    }
  }
  return stack.length === 0 ? blocks : null;
}

function cssBlock(blocks, headerPattern) {
  for (const block of blocks) {
    headerPattern.lastIndex = 0;
    if (headerPattern.test(block.header)) return block.body;
  }
  return '';
}

function containsFocusSelector(header) {
  const lower = header.toLowerCase();
  let cursor = 0;
  while ((cursor = lower.indexOf(':focus', cursor)) >= 0) {
    const suffix = lower.slice(cursor + 6);
    if (suffix.startsWith('-visible')) {
      const next = suffix[8] ?? '';
      if (!/[a-z0-9_-]/.test(next)) return true;
    } else if (!/[a-z0-9_-]/.test(suffix[0] ?? '')) return true;
    cursor += 6;
  }
  return false;
}

function focusRuleBodies(blocks) {
  return blocks.filter((block) => containsFocusSelector(block.header)).map((block) => block.body);
}

function cssDeclarations(body) {
  const declarations = [];
  for (const raw of body.split(';')) {
    const colon = raw.indexOf(':');
    if (colon < 0) continue;
    const name = raw.slice(0, colon).trim().toLowerCase();
    const value = raw.slice(colon + 1).trim().replace(/\s*!important\s*$/i, '');
    if (name !== '' && value !== '') declarations.push({ name, value });
  }
  return declarations;
}

const disabledOutlineKeyword = (value) => ['none', 'initial', 'unset', 'revert', 'inherit', 'transparent'].includes(value.toLowerCase());
const zeroCssToken = (value) => /^[+-]?(?:0+(?:\.0*)?|\.0+)(?:[a-z%]+)?$/i.test(value.trim());

function hasZeroAlphaColour(value) {
  const lower = value.toLowerCase();
  for (const name of ['rgba(', 'hsla(']) {
    let cursor = 0;
    while ((cursor = lower.indexOf(name, cursor)) >= 0) {
      const close = lower.indexOf(')', cursor + name.length);
      if (close < 0) return true;
      const channels = lower.slice(cursor + name.length, close).split(',').map((item) => item.trim());
      if (channels.length === 4 && zeroCssToken(channels[3])) return true;
      cursor = close + 1;
    }
  }
  return false;
}

function shorthandDisablesOutline(value) {
  if (hasZeroAlphaColour(value)) return true;
  return value.toLowerCase().split(/\s+/).some((token) => disabledOutlineKeyword(token) || zeroCssToken(token));
}

function focusBodyRetainsOutline(body) {
  const declarations = cssDeclarations(body);
  const outlines = declarations.filter((item) => item.name === 'outline').map((item) => item.value);
  const widths = declarations.filter((item) => item.name === 'outline-width').map((item) => item.value);
  const styles = declarations.filter((item) => item.name === 'outline-style').map((item) => item.value);
  const colours = declarations.filter((item) => item.name === 'outline-color').map((item) => item.value);
  return outlines.length > 0
    && outlines.every((value) => !shorthandDisablesOutline(value))
    && widths.every((value) => !zeroCssToken(value) && !disabledOutlineKeyword(value))
    && styles.every((value) => !disabledOutlineKeyword(value))
    && colours.every((value) => !disabledOutlineKeyword(value) && !hasZeroAlphaColour(value));
}

function selectedText(body, [start, end]) {
  const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  return lines.slice(start - 1, end).join('\n');
}

function validLineRange(range, lines) {
  return Array.isArray(range)
    && range.length === 2
    && range.every((value) => Number.isInteger(value) && value > 0)
    && range[0] <= range[1]
    && range[1] <= lines;
}

function supportsNumericProof(excerpt, token, context) {
  const wanted = normalizedNumber(token);
  const wantedContext = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped(context)}(?:$|[^\\p{L}\\p{N}_])`, 'iu');
  return excerpt.split('\n').some((line) => numericTokens(line).some((candidate) => normalizedNumber(candidate) === wanted)
    && wantedContext.test(line));
}

function wrappingRulesAreSafe(css, blocks) {
  if (/\b(?:word-break\s*:\s*(?:break-all|break-word)|word-wrap\s*:\s*(?:break-word|anywhere)|overflow-wrap\s*:\s*break-word|hyphens\s*:\s*auto)\b/i.test(css)) return false;
  const allowedAnywhere = new Set(['.artifact pre', '.command-card code', '.sources li', '.story-card p']);
  for (const block of blocks) {
    if (!/overflow-wrap\s*:\s*anywhere/i.test(block.body)) continue;
    const selectors = block.header.split(',').map((selector) => selector.trim());
    if (selectors.length === 0 || selectors.some((selector) => !allowedAnywhere.has(selector))) return false;
  }
  return true;
}

export function evaluateStoryCssPolicies(value) {
  const css = typeof value === 'string' ? value : '';
  const present = css.length > 0;
  const blocks = cssBlocks(css);
  const cssScanValid = blocks !== null;
  const policyBlocks = blocks ?? [];
  const focusBodies = focusRuleBodies(policyBlocks);
  const reducedMotion = cssBlock(policyBlocks, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/i);
  const reducedMotionTargets = /\*,\*:before,\*:after\s*\{([^{}]*)\}/i.exec(reducedMotion)?.[1] ?? '';
  const narrow = cssBlock(policyBlocks, /@media\s*\(max-width\s*:\s*720px\)/i);
  return {
    focus: present && cssScanValid && focusBodies.length > 0 && focusBodies.every(focusBodyRetainsOutline),
    reducedMotion: present && cssScanValid
      && /animation\s*:\s*none!important/i.test(reducedMotionTargets)
      && /transition\s*:\s*none!important/i.test(reducedMotionTargets),
    responsive: present && cssScanValid
      && /\.example-grid\s*\{[^}]*grid-template-columns\s*:\s*1fr/i.test(narrow)
      && /\.flow\s*\{[^}]*grid-template-columns\s*:\s*1fr/i.test(narrow)
      && !/\boverflow(?:-[xy])?\s*:\s*[^;}]*\b(?:hidden|clip)\b/i.test(css),
    wrapping: present && cssScanValid && wrappingRulesAreSafe(css, policyBlocks),
  };
}

function containedFile(packageRoot, relPath) {
  const root = realpathSync(resolve(packageRoot));
  const absolute = resolve(root, relPath);
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('path escapes package root');
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('source must be a regular non-symlink file');
  const real = realpathSync(absolute);
  const realRel = relative(root, real);
  if (realRel.startsWith('..') || isAbsolute(realRel)) throw new Error('source realpath escapes package root');
  return { root, real };
}

function verifyProvenance(brief, evidence, packageRoot, check) {
  const excerpts = new Map();
  const evidenceResult = validateEvidence(evidence);
  check('provenance.evidence-schema', evidenceResult.pass, evidenceResult.failures.join('; ') || 'evidence schema valid');
  if (!evidenceResult.pass || !packageRoot) {
    check('provenance.context', false, 'evidence JSON and package root are required');
    return excerpts;
  }

  let provenanceBytes = 0;
  let provenanceAggregateExceeded = false;
  const readProvenanceFile = (file) => {
    const remaining = Math.max(0, SOURCE_AGGREGATE_BYTE_LIMIT - provenanceBytes);
    const bounded = readDescriptorBounded(file.real, PROVENANCE_FILE_BYTE_LIMIT, remaining);
    if (bounded.kind === 'aggregate') {
      provenanceAggregateExceeded = true;
      throw new Error(`provenance aggregate exceeds ${SOURCE_AGGREGATE_BYTE_LIMIT} bytes before read`);
    }
    if (bounded.kind !== 'read') throw new Error(`source exceeds ${PROVENANCE_FILE_BYTE_LIMIT} bytes before read`);
    provenanceBytes += bounded.bytes;
    return bounded.body;
  };

  let root = null;
  try {
    root = realpathSync(resolve(packageRoot));
    check('provenance.generated-from', realpathSync(resolve(evidence.generatedFrom)) === root, 'evidence.generatedFrom must match --pkg');
  } catch (error) {
    check('provenance.generated-from', false, `unreadable package/evidence root: ${error.message}`);
  }
  check('provenance.package-name', brief?.package?.name === evidence?.package?.name, 'brief package name must equal package-evidence package name');
  check('provenance.package-version', brief?.package?.version === evidence?.package?.version, 'brief package version must equal package-evidence package version');
  const evidenceById = new Map(list(evidence?.sources).map((source) => [source?.id, source]));
  const briefSources = list(brief?.sources);
  const sourceCheckIds = uniqueDynamicCheckComponents(briefSources, 'id');
  for (const [index, rawSource] of briefSources.entries()) {
    const source = record(rawSource);
    if (!source) {
      check(`provenance.brief.sources.${index}.object`, false, `brief.sources[${index}] must be an object`);
      continue;
    }
    const sourceCheckId = sourceCheckIds[index];
    const recorded = evidenceById.get(source.id);
    check(`provenance.${sourceCheckId}.record`, Boolean(recorded), 'brief source must exist in the supplied package-evidence/1 artifact');
    if (!recorded) continue;
    if (source.path) {
      const rangeValid = validLineRange(source.lineRange, recorded.lines);
      check(`provenance.${sourceCheckId}.path`, recorded.path === source.path, 'brief path must equal extracted evidence path');
      check(`provenance.${sourceCheckId}.sha`, recorded.sha256 === source.sha256, 'brief SHA-256 must equal extracted evidence SHA-256');
      check(`provenance.${sourceCheckId}.range`, rangeValid, 'lineRange must be exactly two positive ordered integers inside extracted line count');
      if (root === null) continue;
      try {
        const file = containedFile(root, source.path);
        const body = readProvenanceFile(file);
        check(`provenance.${sourceCheckId}.file-sha`, sha(body) === source.sha256, 'current file bytes must match brief/evidence SHA-256');
        check(`provenance.${sourceCheckId}.line-count`, countSourceLines(body) === recorded.lines, 'current line count must match evidence');
        if (rangeValid) excerpts.set(source.id, selectedText(body, source.lineRange));
      } catch (error) {
        check(`provenance.${sourceCheckId}.file`, false, error.message);
      }
    } else {
      const rangeValid = validLineRange(source.lineRange, recorded.lines);
      check(`provenance.${sourceCheckId}.external`, recorded.url === source.url
        && recorded.checkedAt === source.checkedAt
        && recorded.receiptPath === source.receiptPath
        && recorded.sha256 === source.sha256,
      'external source must exactly match a supplied dated HTTPS record and local receipt');
      check(`provenance.${sourceCheckId}.range`, rangeValid,
        'external receipt lineRange must be exactly two positive ordered integers inside its recorded line count');
      if (root === null) continue;
      try {
        const file = containedFile(root, source.receiptPath);
        const body = readProvenanceFile(file);
        check(`provenance.${sourceCheckId}.file-sha`, sha(body) === source.sha256, 'current receipt bytes must match brief/evidence SHA-256');
        check(`provenance.${sourceCheckId}.line-count`, countSourceLines(body) === recorded.lines, 'current receipt line count must match evidence');
        if (rangeValid) {
          const excerpt = selectedText(body, source.lineRange);
          check(`provenance.${sourceCheckId}.receipt-url`, excerpt.includes(source.url), 'cited external receipt range must name the exact source URL');
          check(`provenance.${sourceCheckId}.receipt-date`, excerpt.includes(source.checkedAt), 'cited external receipt range must name the exact checkedAt date');
          excerpts.set(source.id, excerpt);
        }
      } catch (error) {
        check(`provenance.${sourceCheckId}.file`, false, error.message);
      }
    }
  }
  check('provenance.aggregate', !provenanceAggregateExceeded,
    `provenance files must total at most ${SOURCE_AGGREGATE_BYTE_LIMIT} bytes; observed ${provenanceBytes} accepted bytes`);

  const sourceById = new Map(briefSources.map((source) => [source?.id, source]));
  const briefClaims = list(brief?.claims);
  const claimCheckIds = uniqueDynamicCheckComponents(briefClaims, 'id');
  for (const [index, rawClaim] of briefClaims.entries()) {
    const claim = record(rawClaim);
    if (!claim) {
      check(`provenance.brief.claims.${index}.object`, false, `brief.claims[${index}] must be an object`);
      continue;
    }
    const claimCheckId = claimCheckIds[index];
    const claimSourceIds = list(claim?.sourceIds);
    const cited = claimSourceIds.map((id) => sourceById.get(id)).filter(Boolean);
    if (claim.status === 'evidenced') {
      check(`claim.${claimCheckId}.local-evidence`, cited.length > 0 && cited.every((source) => Boolean(source.path)), 'evidenced claim must cite local package evidence');
      for (const [proofIndex, proof] of list(claim?.numericEvidence).entries()) {
        const proofCheckId = `proof-${proofIndex}`;
        if (typeof proof?.token !== 'string' || typeof proof?.context !== 'string' || typeof proof?.sourceId !== 'string') {
          check(`claim.${claimCheckId}.number-proof.${proofIndex}`, false, 'numeric proof must contain token, context, and sourceId strings');
          continue;
        }
        const excerpt = excerpts.get(proof.sourceId) ?? '';
        const wanted = normalizedNumber(proof.token);
        const supported = numericTokens(excerpt).some((candidate) => normalizedNumber(candidate) === wanted);
        check(`claim.${claimCheckId}.number.${proofCheckId}`, supported, `exact numeric token ${proof.token} must occur inside its named local range`);
        check(`claim.${claimCheckId}.context.${proofCheckId}`, supportsNumericProof(excerpt, proof.token, proof.context),
          `numeric token ${proof.token} and context ${proof.context} must occur on the same line inside the named range`);
      }
    } else if (claim.status === 'external') {
      check(`claim.${claimCheckId}.external-evidence`, cited.length > 0 && cited.every((source) => Boolean(source.url) && Boolean(source.receiptPath)), 'external claim must cite supplied dated HTTPS evidence with a local receipt');
      check(`claim.${claimCheckId}.external-numeric`, numericTokens(claim.text).length === 0, 'numeric claims require current local evidence');
      check(`claim.${claimCheckId}.external-content`, claimSourceIds.some((id) => (excerpts.get(id) ?? '').includes(claim.text)), 'external claim text must occur verbatim inside a cited receipt range');
    }
  }
  return excerpts;
}

function shapeBudget(value, label) {
  let aggregate = 0;
  const failures = [];
  const boundedArray = /(?:^|\.)(?:sources|claims|mechanism|install|reuse|limits|process|sourceIds|numericEvidence)$/;
  const stack = [{ item: value, path: label, depth: 0 }];
  while (stack.length > 0) {
    const { item, path, depth } = stack.pop();
    if (depth > STRUCTURED_DEPTH_LIMIT) {
      failures.push(`${path}: nesting depth exceeds ${STRUCTURED_DEPTH_LIMIT}`);
      continue;
    }
    if (typeof item === 'string' && Buffer.byteLength(item, 'utf8') > 16_384) failures.push(`${path}: string exceeds 16384 UTF-8 bytes`);
    if (Array.isArray(item)) {
      if (boundedArray.test(path)) {
        aggregate += item.length;
        if (item.length > 200) failures.push(`${path}: array exceeds 200 members`);
      }
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ item: item[index], path: `${path}[${index}]`, depth: depth + 1 });
      }
    } else if (item !== null && typeof item === 'object') {
      const entries = Object.entries(item);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, child] = entries[index];
        stack.push({ item: child, path: `${path}.${key}`, depth: depth + 1 });
      }
    }
  }
  if (aggregate > 1_024) failures.push(`${label}: aggregate array members exceed 1024`);
  return failures;
}

export function verifyStoryPage(briefInput, html, context = {}) {
  const checks = [];
  const failures = [];
  const add = (id, pass, detail) => {
    checks.push({ id, pass, detail });
    if (!pass) failures.push(`${id}: ${detail}`);
  };
  const briefBudget = safeJsonBudget(briefInput, BRIEF_BYTE_LIMIT, 'brief.input');
  const evidenceBudget = safeJsonBudget(context.evidence, EVIDENCE_BYTE_LIMIT, 'evidence.input');
  const pageBytes = Buffer.byteLength(typeof html === 'string' ? html : '', 'utf8');
  add('brief.input', briefBudget.pass, briefBudget.detail);
  add('evidence.input', evidenceBudget.pass, evidenceBudget.detail);
  add('page.input', typeof html === 'string' && pageBytes <= PAGE_BYTE_LIMIT,
    typeof html !== 'string' ? 'page must be a string' : `page is ${pageBytes}/${PAGE_BYTE_LIMIT} UTF-8 bytes`);
  if (!briefBudget.pass || !evidenceBudget.pass || typeof html !== 'string' || pageBytes > PAGE_BYTE_LIMIT) {
    return { schema: 'package-story-page-verification/1', pass: false, checks, failures };
  }

  const parsedBrief = parseBudgetedJson(briefBudget, 'brief.input');
  const parsedEvidence = parseBudgetedJson(evidenceBudget, 'evidence.input');
  add('brief.parse', parsedBrief.pass, parsedBrief.detail);
  add('evidence.parse', parsedEvidence.pass, parsedEvidence.detail);
  if (!parsedBrief.pass || !parsedEvidence.pass) {
    return { schema: 'package-story-page-verification/1', pass: false, checks, failures };
  }
  const brief = parsedBrief.value;
  const evidence = parsedEvidence.value;
  const briefShape = shapeBudget(brief, 'brief');
  const evidenceShape = shapeBudget(evidence, 'evidence');
  add('brief.shape', briefShape.length === 0, briefShape.length === 0 ? 'brief shape is within declared ceilings' : briefShape.join('; '));
  add('evidence.shape', evidenceShape.length === 0, evidenceShape.length === 0 ? 'evidence shape is within declared ceilings' : evidenceShape.join('; '));
  if (briefShape.length > 0 || evidenceShape.length > 0) {
    return { schema: 'package-story-page-verification/1', pass: false, checks, failures };
  }

  const briefResult = validateBrief(brief);
  const evidenceResult = validateEvidence(evidence);
  add('brief.schema', briefResult.pass, briefResult.pass ? 'brief schema is valid' : briefResult.failures.join('; '));
  add('evidence.schema', evidenceResult.pass, evidenceResult.pass ? 'evidence schema is valid' : evidenceResult.failures.join('; '));

  try {
    verifyProvenance(brief, evidence, context.packageRoot, add);
  } catch (error) {
    add('provenance.input', false, `provenance verification threw: ${error?.message ?? String(error)}`);
  }

  // Invalid structured inputs are already fully described by schema and provenance
  // checks. Do not let renderer or DOM-query code inspect malformed members: totality
  // is public, while speculative page diagnostics for an invalid brief are misleading.
  if (!briefResult.pass || !evidenceResult.pass) {
    return { schema: 'package-story-page-verification/1', pass: false, checks, failures };
  }

  let canonical = null;
  try {
    canonical = renderStoryPage(brief);
    add('page.canonical-renderer-threw', true, 'canonical renderer returned');
  } catch (error) {
    add('page.canonical-renderer-threw', false, `canonical renderer threw: ${error?.message ?? String(error)}`);
  }
  add('page.canonical', canonical !== null && html === canonical,
    'the verified page must be byte-identical to the deterministic renderer output for this validated brief');

  let semantic = null;
  try {
    semantic = verifyStorySemantics(brief, html);
    if (semantic === null || typeof semantic !== 'object' || !Array.isArray(semantic.checks)
      || typeof semantic.styleText !== 'string' || !Array.isArray(semantic.nodes)) {
      throw new TypeError('semantic authority returned a malformed result');
    }
    const semanticCheckIds = semantic.checks.map((item) => item?.id);
    const expectedSemanticInventory = EXPECTED_SEMANTIC_CHECK_IDS;
    const semanticInventoryExact = semanticCheckIds.length === expectedSemanticInventory.length
      && semanticCheckIds.every((id, index) => id === expectedSemanticInventory[index]);
    if (!semanticInventoryExact) {
      throw new TypeError(`semantic authority returned an unexpected check inventory: ${semanticCheckIds.join(', ')}`);
    }
    for (const item of semantic.checks) {
      if (item === null || typeof item !== 'object' || typeof item.id !== 'string'
        || typeof item.pass !== 'boolean' || typeof item.detail !== 'string') {
        throw new TypeError('semantic authority returned a malformed check');
      }
      add(item.id, item.pass, item.detail);
    }
    for (const node of semantic.nodes) {
      if (node === null || typeof node !== 'object' || typeof node.tagName !== 'string'
        || !Array.isArray(node.attrs) || node.attrs.some((attr) => attr === null || typeof attr !== 'object'
          || typeof attr.name !== 'string' || typeof attr.value !== 'string')) {
        throw new TypeError('semantic authority returned a malformed node');
      }
    }
    add('page.semantic-authority-threw', true, 'semantic authority returned');
  } catch (error) {
    add('page.semantic-authority-threw', false, `semantic authority threw: ${error?.message ?? String(error)}`);
    return { schema: 'package-story-page-verification/1', pass: false, checks, failures };
  }
  const style = semantic.styleText ?? '';
  const stylePolicies = evaluateStoryCssPolicies(style);
  add('page.focus', stylePolicies.focus,
    'every focus and focus-visible rule retains only non-transparent nonzero outline declarations');
  add('page.reduced-motion', stylePolicies.reducedMotion,
    'the reduced-motion block disables motion on every element and pseudo-element');
  add('page.responsive', stylePolicies.responsive,
    'narrow grids reflow without masking page overflow anywhere');
  add('page.wrapping', stylePolicies.wrapping, 'approved CSS keeps prose wrapping safe');
  const nodes = semantic.nodes ?? [];
  const nodeAttr = (node, name) => node?.attrs?.find((item) => item.name === name)?.value ?? null;
  for (const [sourceIndex, source] of list(brief?.sources).entries()) {
    const sourceCheckId = dynamicCheckComponent(source?.id, `invalid-${sourceIndex}`);
    add(`source.rendered.${sourceCheckId}`,
      nodes.some((node) => nodeAttr(node, 'id') === `source-${source?.id}`), `source ${source?.id} must render`);
  }
  const limitCategories = ['safety', 'cost', 'freshness'];
  const limitNodes = nodes.filter((node) => nodeAttr(node, 'data-limit-category') !== null);
  const limitInventoryExact = limitNodes.length === list(brief?.limits).length
    && limitNodes.every((node) => limitCategories.includes(nodeAttr(node, 'data-limit-category')));
  for (const category of limitCategories) {
    const expectedCount = list(brief?.limits).filter((item) => item?.category === category).length;
    const actualCount = limitNodes.filter((node) => nodeAttr(node, 'data-limit-category') === category).length;
    add(`limit.${category}`, limitInventoryExact && expectedCount > 0 && actualCount === expectedCount,
      `${category} limitation count must match the brief and no unexpected limit surface may render`);
  }
  add('brief.digest', nodes.some((node) => node.tagName === 'meta' && nodeAttr(node, 'name') === 'package-story-brief-sha256'
    && nodeAttr(node, 'content') === sha256Text(canonicalJsonText(brief))), 'page must bind the supplied brief digest');
  return { schema: 'package-story-page-verification/1', pass: failures.length === 0, checks, failures };
}

export function main(argv = process.argv.slice(2)) {
  const options = args(argv);
  if (!options.brief || !options.site || !options.evidence || !options.packageRoot) {
    throw new Error('usage: verify-story-page --brief <brief.json> --site <index.html> --evidence <evidence.json> --pkg <package-root> [--json <report>]');
  }
  const readBounded = (path, limit, label) => {
    const bounded = readDescriptorBounded(resolve(path), limit);
    if (bounded.kind !== 'read') throw new Error(`${label} exceeds ${limit} bytes before read`);
    return bounded.body;
  };
  const brief = JSON.parse(readBounded(options.brief, BRIEF_BYTE_LIMIT, 'brief.input'));
  const evidence = JSON.parse(readBounded(options.evidence, EVIDENCE_BYTE_LIMIT, 'evidence.input'));
  const html = readBounded(options.site, PAGE_BYTE_LIMIT, 'page.input');
  const result = verifyStoryPage(brief, html, { evidence, packageRoot: options.packageRoot });
  if (options.json) writeFileSync(resolve(options.json), `${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) throw new Error(result.failures.join('; '));
  process.stdout.write(`PASS — ${result.checks.length} story-page checks hold.\n`);
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try { main(); } catch (error) { console.error(`verify-story-page: ${error.message}`); process.exit(1); }
}
