#!/usr/bin/env node
// One parser for workflow and plain Step 7. Importing this module performs no IO.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'fa-coder-context-1';
const MAX_DOCUMENTS = 64;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_PROMPT_BYTES = 96 * 1024;
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const kindOf = (path) => path === '01_requirements.md' ? 'requirements'
  : path === '06_implementation_plan.md' ? 'plan'
    : /^03_adr\/[0-9]{3}-[^/\\\x00-\x1f]+\.md$/.test(path) ? 'adr' : null;
const diagnostic = (source, reason, section) => ({ source, reason, severity: 'error', ...(section ? { section } : {}) });

// One lexical pass recognizes comments only outside Markdown code/escapes, retaining offsets.
function markdown(text) {
  const headings = [];
  const visible = [];
  let fence = null;
  let comment = false;
  let inlineEnd = -1;
  let offset = 0;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const clean = line.replace(/\r?\n$/, '').replace(/^\uFEFF/, '');
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(clean);
    if (fence) {
      if (delimiter && delimiter[1][0] === fence.char && delimiter[1].length >= fence.length && delimiter[2].trim() === '') fence = null;
      else visible.push(line);
    } else if (!comment && inlineEnd <= offset && delimiter && !(delimiter[1][0] === '`' && delimiter[2].includes('`'))) {
      fence = { char: delimiter[1][0], length: delimiter[1].length };
    } else {
      const wasComment = comment;
      let masked = '';
      for (let i = 0; i < line.length;) {
        if (comment) {
          if (line.startsWith('-->', i)) { masked += '   '; i += 3; comment = false; }
          else { masked += /[\r\n]/.test(line[i]) ? line[i] : ' '; i++; }
          continue;
        }
        if (offset + i < inlineEnd) { masked += line[i++]; continue; }
        // An escaped '<' cannot start a comment; paired backslashes still allow the next opener.
        if (line[i] === '\\' && i + 1 < line.length && /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(line[i + 1])) {
          masked += line.slice(i, i + 2); i += 2; continue;
        }
        if (line[i] === '`') {
          const run = /^`+/.exec(line.slice(i))[0];
          const rest = text.slice(offset + i + run.length);
          // Code spans can wrap within a paragraph, but cannot hide a subsequent block heading/fence.
          const boundary = /\n[ \t]*(?:\r?\n|#{1,6}[ \t]|`{3,}|~{3,})/.exec(rest);
          const paragraph = boundary ? rest.slice(0, boundary.index) : rest;
          const close = [...paragraph.matchAll(/`+/g)].find((match) => match[0].length === run.length);
          if (close) inlineEnd = offset + i + run.length + close.index + run.length;
          masked += run; i += run.length; continue;
        }
        if (line.startsWith('<!--', i)) { comment = true; masked += '    '; i += 4; continue; }
        masked += line[i++];
      }
      const heading = !wasComment && /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/.exec(masked.replace(/\r?\n$/, '').replace(/^\uFEFF/, ''));
      if (heading) headings.push({ depth: heading[1].length, title: heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim(), start: offset, body: offset + line.length });
      else visible.push(masked);
    }
    offset += line.length;
  }
  return { headings, unclosed: fence !== null, unclosedComment: comment, substantive: visible.join('').trim() !== '' };
}

/** Pure: consumes already-read documents only, and hashes the same snapshot used for the block. */
export function buildCoderContext({ tier, documents }) {
  const diagnostics = [];
  const sources = [];
  const blocks = [];
  let bounded = true;
  if (!['S', 'M', 'L', 'XL'].includes(tier)) diagnostics.push(diagnostic('tier', 'invalid-tier'));
  if (!Array.isArray(documents)) documents = [];
  if (documents.length > MAX_DOCUMENTS) { diagnostics.push(diagnostic('documents', 'document-limit')); bounded = false; }
  const sorted = [...documents].sort((a, b) => String(a?.path).localeCompare(String(b?.path), 'en'));
  const seen = new Set();
  let total = 0;
  for (const doc of sorted.slice(0, MAX_DOCUMENTS)) {
    const path = doc?.path;
    const kind = typeof path === 'string' && path.length <= 512 ? kindOf(path) : null;
    if (!kind || typeof doc.text !== 'string') { diagnostics.push(diagnostic(String(path ?? 'documents'), 'invalid-source')); bounded = false; continue; }
    if (seen.has(path)) { diagnostics.push(diagnostic(path, 'duplicate-source')); bounded = false; continue; }
    seen.add(path);
    const bytes = Buffer.byteLength(doc.text, 'utf8'); total += bytes;
    const status = bytes > MAX_FILE_BYTES ? 'oversized' : 'read';
    sources.push({ path, kind, bytes, digest: status === 'read' ? sha(doc.text) : null, status });
    if (status !== 'read') { diagnostics.push(diagnostic(path, 'file-limit')); bounded = false; continue; }
    const parsed = markdown(doc.text);
    if (parsed.unclosed) diagnostics.push(diagnostic(path, 'unclosed-fence'));
    if (parsed.unclosedComment) diagnostics.push(diagnostic(path, 'unclosed-comment'));
    if (kind !== 'adr') {
      if (!parsed.substantive) diagnostics.push(diagnostic(path, 'empty-section', 'body'));
      blocks.push('\n\n### Source: ' + path + ' — body\n' + doc.text);
      continue;
    }
    for (const section of ['Decision', 'Confirmation']) {
      const matches = parsed.headings.filter((h) => h.depth >= 2 && h.title.toLowerCase() === section.toLowerCase());
      if (matches.length !== 1) { diagnostics.push(diagnostic(path, matches.length ? 'duplicate-section' : 'missing-section', section)); continue; }
      const heading = matches[0];
      const next = parsed.headings.find((h) => h.start > heading.start && h.depth <= heading.depth);
      const body = doc.text.slice(heading.body, next ? next.start : doc.text.length);
      if (!markdown(body).substantive) diagnostics.push(diagnostic(path, 'empty-section', section));
      blocks.push('\n\n### Source: ' + path + ' — ' + section + '\n' + body);
    }
  }
  if (total > MAX_TOTAL_BYTES) { diagnostics.push(diagnostic('documents', 'aggregate-limit')); bounded = false; }
  for (const path of ['01_requirements.md', '06_implementation_plan.md']) {
    if (!seen.has(path)) {
      sources.push({ path, kind: kindOf(path), bytes: 0, digest: null, status: 'missing' });
      diagnostics.push(diagnostic(path, 'missing-source'));
    }
  }
  if (tier !== 'S' && !sources.some((s) => s.kind === 'adr')) diagnostics.push(diagnostic('03_adr', 'missing-source'));
  let promptBlock = '\n\n## Current coder context (literal source snapshot)' + blocks.join('');
  if (tier === 'S' && !sources.some((s) => s.kind === 'adr')) promptBlock += '\n\nADR sources: none selected (tier S).';
  if (Buffer.byteLength(promptBlock, 'utf8') > MAX_PROMPT_BYTES) {
    diagnostics.push(diagnostic('promptBlock', 'prompt-limit')); promptBlock = '';
  }
  return { schema: SCHEMA, status: diagnostics.length ? 'incomplete' : 'complete', promptBlock,
    digest: bounded ? sha(JSON.stringify([SCHEMA, tier, sorted.map((d) => [d.path, d.text])])) : null,
    sources: sources.sort((a, b) => a.path.localeCompare(b.path, 'en')), diagnostics };
}

function hostContext(feature, tier) {
  const failures = [];
  const documents = [];
  const failedSources = [];
  let root;
  const fail = (path, reason, status = 'unreadable', bytes = 0) => {
    failures.push(diagnostic(path, reason));
    failedSources.push({ path, kind: kindOf(path) ?? 'adr', bytes, digest: null, status });
  };
  try {
    if (lstatSync(feature).isSymbolicLink() || !lstatSync(feature).isDirectory()) throw new Error('invalid-root');
    root = realpathSync(feature);
  } catch { return { schema: SCHEMA, status: 'unavailable', promptBlock: '', digest: null, sources: [], diagnostics: [diagnostic(feature, 'invalid-root')] }; }
  let paths = ['01_requirements.md', '06_implementation_plan.md'];
  const adrDir = join(root, '03_adr');
  try {
    const stat = lstatSync(adrDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('03_adr', 'invalid-file', 'invalid');
    else paths.push(...readdirSync(adrDir).filter((name) => /^[0-9]{3}-.+\.md$/.test(name)).sort().map((name) => '03_adr/' + name));
  } catch (error) { if (error.code !== 'ENOENT') fail('03_adr', 'read-failure'); }
  if (paths.length > MAX_DOCUMENTS) return { schema: SCHEMA, status: 'incomplete', promptBlock: '', digest: null, sources: [], diagnostics: [diagnostic('documents', 'document-limit')] };
  let total = 0;
  for (const path of paths) {
    let fd;
    try {
      const file = join(root, path);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile()) { fail(path, 'invalid-file', 'invalid'); continue; }
      const actual = realpathSync(file);
      const rel = relative(root, actual);
      if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) { fail(path, 'outside-root', 'invalid'); continue; }
      fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const opened = fstatSync(fd);
      // Compare the opened descriptor with the contained file checked before open.
      if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || realpathSync(file) !== actual) { fail(path, 'invalid-file', 'invalid'); continue; }
      const chunks = []; let bytes = 0;
      while (true) {
        const chunk = Buffer.alloc(Math.min(16384, MAX_FILE_BYTES + 1 - bytes));
        const count = readSync(fd, chunk, 0, chunk.length, null);
        if (count === 0) break;
        bytes += count; total += count; chunks.push(chunk.subarray(0, count));
        if (bytes > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) break;
      }
      if (bytes > MAX_FILE_BYTES) { fail(path, 'file-limit', 'oversized', bytes); continue; }
      if (total > MAX_TOTAL_BYTES) { fail(path, 'aggregate-limit', 'oversized', bytes); break; }
      try { documents.push({ path, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)) }); }
      catch { fail(path, 'invalid-utf8', 'invalid', bytes); }
    } catch (error) { fail(path, error.code === 'ENOENT' ? 'missing-source' : 'read-failure', error.code === 'ENOENT' ? 'missing' : 'unreadable'); }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  const result = buildCoderContext({ tier, documents });
  if (failures.length) {
    const failed = new Set(failedSources.map((s) => s.path));
    result.sources = result.sources.filter((s) => !failed.has(s.path)).concat(failedSources).sort((a, b) => a.path.localeCompare(b.path, 'en'));
    result.diagnostics = result.diagnostics.filter((d) => !(failed.has(d.source) && d.reason === 'missing-source')).concat(failures);
    result.status = failures.every((d) => ['file-limit', 'aggregate-limit'].includes(d.reason)) ? 'incomplete' : 'unavailable';
    result.digest = null;
  }
  return result;
}

function main(argv) {
  const feature = argv[0];
  const tier = argv.find((arg) => arg.startsWith('--tier='))?.slice(7);
  let result;
  if (!feature || !['S', 'M', 'L', 'XL'].includes(tier) || argv.some((arg, i) => i > 0 && arg !== '--tier=' + tier)) {
    result = { schema: SCHEMA, status: 'unavailable', promptBlock: '', digest: null, sources: [], diagnostics: [diagnostic('arguments', 'invalid-arguments')] };
  } else result = hostContext(resolve(feature), tier);
  console.log(JSON.stringify(result));
  return result.status === 'complete' ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2));
