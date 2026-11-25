// Narrow, bounded adapter for the Poppler pdf2xml outline subset. It never loads a DTD.
import { execFile } from 'node:child_process';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 4096;
const MAX_DEPTH = 32;
const MAX_TITLE = 1024;
const ARGS = ['-xml', '-stdout', '-i', '-enc', 'UTF-8', '-f', '1', '-l', '1'];
const XML_S = /[ \t\r\n]/;
const xmlChar = (n) => n === 9 || n === 10 || n === 13 || (n >= 0x20 && n <= 0xd7ff)
  || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);
const scalarCount = (s) => [...s].length;
const normalize = (s) => s.replace(/[\t\n\r]/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '')
  .replace(/\s+/gu, ' ').trim();

function decodeEntities(s) {
  let out = '';
  for (let i = 0; i < s.length;) {
    const cp = s.codePointAt(i);
    if (!xmlChar(cp)) throw new Error('invalid-character');
    if (cp === 38) {
      const end = s.indexOf(';', i + 1);
      if (end < 0 || end - i > 16) throw new Error('invalid-entity');
      const name = s.slice(i + 1, end);
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      let value = Object.hasOwn(named, name) ? named[name] : undefined;
      if (value === undefined) {
        const hex = /^#x([0-9a-fA-F]+)$/.exec(name);
        const dec = /^#([0-9]+)$/.exec(name);
        if (!hex && !dec) throw new Error('invalid-entity');
        const number = Number.parseInt(hex?.[1] ?? dec[1], hex ? 16 : 10);
        if (!xmlChar(number)) throw new Error('invalid-entity');
        value = String.fromCodePoint(number);
      }
      out += value;
      i = end + 1;
    } else {
      out += String.fromCodePoint(cp);
      i += cp > 0xffff ? 2 : 1;
    }
  }
  return out;
}

function tagAt(xml, start) {
  let end = start + 1, quote = '';
  for (; end < xml.length; end++) {
    const ch = xml[end];
    if (quote) { if (ch === quote) quote = ''; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') break;
  }
  if (end === xml.length || quote) throw new Error('unterminated-tag');
  return [xml.slice(start + 1, end), end + 1];
}

function parseTag(raw) {
  const close = raw.startsWith('/');
  const selfClosing = !close && raw.endsWith('/');
  const body = close ? raw.slice(1) : selfClosing ? raw.slice(0, -1) : raw;
  const head = /^([A-Za-z][A-Za-z0-9_.:-]*)/.exec(body);
  if (!head) throw new Error('bad-tag');
  const name = head[1];
  if (close) {
    if (/[^ \t\r\n]/.test(body.slice(head[0].length))) throw new Error('bad-close');
    return { name, close, selfClosing: false, attrs: {} };
  }
  const attrs = Object.create(null);
  let i = head[0].length;
  while (i < body.length) {
    if (!XML_S.test(body[i])) throw new Error('bad-attribute');
    while (i < body.length && XML_S.test(body[i])) i++;
    if (i === body.length) break;
    const key = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(body.slice(i));
    if (!key || Object.hasOwn(attrs, key[0])) throw new Error('bad-attribute');
    i += key[0].length;
    while (i < body.length && XML_S.test(body[i])) i++;
    if (body[i++] !== '=') throw new Error('bad-attribute');
    while (i < body.length && XML_S.test(body[i])) i++;
    const quote = body[i++];
    if (quote !== '"' && quote !== "'") throw new Error('bad-attribute');
    const end = body.indexOf(quote, i);
    if (end < 0 || body.slice(i, end).includes('<')) throw new Error('bad-attribute');
    attrs[key[0]] = decodeEntities(body.slice(i, end));
    i = end + 1;
  }
  return { name, close: false, selfClosing, attrs };
}

function parseOutline(xml) {
  let i = 0, declaration = false, doctype = false, rootSeen = false, rootClosed = false;
  let rootOutline = false, producerVersion = 'unknown', count = 0, unselected = 0;
  const roots = [], stack = [];
  const finish = () => {
    const node = stack.pop();
    if (node.name === 'item') {
      const title = normalize(node.title);
      if (scalarCount(title) > MAX_TITLE) throw new Error('invalid-title');
      if (node.rootItem) {
        if (!title) throw new Error('invalid-title');
        roots.push({ page: node.page, title });
      } else unselected++;
    }
    if (node.name === 'pdf2xml') rootClosed = true;
  };
  while (i < xml.length) {
    const next = xml.indexOf('<', i);
    const end = next < 0 ? xml.length : next;
    const rawText = xml.slice(i, end);
    if (rawText.includes(']]>')) throw new Error('unsupported-markup');
    if (!stack.length && /[^ \t\r\n]/.test(rawText)) throw new Error('unexpected-text');
    const text = decodeEntities(rawText);
    if (stack.at(-1)?.name === 'item') {
      stack.at(-1).title += text;
      if (scalarCount(stack.at(-1).title) > MAX_TITLE) throw new Error('title-limit');
    } else if (!stack.some((n) => n.name === 'page') && /[^ \t\r\n]/.test(text)) throw new Error('unexpected-text');
    i = end;
    if (i === xml.length) break;
    if (xml.startsWith('<![CDATA[', i) || xml.startsWith('<!--', i) || xml.startsWith('<!ENTITY', i)) throw new Error('unsupported-markup');
    if (xml.startsWith('<?', i)) {
      const stop = xml.indexOf('?>', i + 2);
      if (stop < 0 || declaration || rootSeen || i !== 0) throw new Error('invalid-declaration');
      if (!/^<\?xml[ \t\r\n]+version=(["'])1\.0\1(?:[ \t\r\n]+encoding=(["'])UTF-8\2)?[ \t\r\n]*\?>$/.test(xml.slice(i, stop + 2))) throw new Error('invalid-declaration');
      declaration = true; i = stop + 2; continue;
    }
    if (xml.startsWith('<!', i)) {
      const [raw, after] = tagAt(xml, i);
      if (doctype || rootSeen || !/^!DOCTYPE[ \t\r\n]+pdf2xml[ \t\r\n]+SYSTEM[ \t\r\n]+(["'])pdf2xml\.dtd\1[ \t\r\n]*$/.test(raw)) throw new Error('invalid-doctype');
      doctype = true; i = after; continue;
    }
    const [raw, after] = tagAt(xml, i);
    const tag = parseTag(raw);
    i = after;
    if (tag.close) {
      if (stack.at(-1)?.name !== tag.name) throw new Error('unbalanced');
      finish(); continue;
    }
    const parent = stack.at(-1);
    if (!parent) {
      if (rootSeen || tag.name !== 'pdf2xml' || tag.selfClosing) throw new Error('invalid-envelope');
      rootSeen = true;
      if (tag.attrs.producer !== 'poppler') throw new Error('unsupported-producer');
      if (tag.attrs.version && (tag.attrs.version.length > 64 || !/^\d+(?:\.\d+){1,3}$/.test(tag.attrs.version)))
        throw new Error('invalid-version');
      producerVersion = tag.attrs.version ?? 'unknown';
    } else if (parent.name === 'pdf2xml') {
      if (tag.name === 'outline') {
        if (rootOutline || tag.selfClosing) throw new Error('multiple-outline');
        rootOutline = true;
      } else if (tag.name !== 'page' || rootOutline) throw new Error('unsupported-root-child');
    } else if (parent.name === 'outline') {
      if (tag.name === 'item') {
        count++;
        if (count > MAX_ITEMS || tag.selfClosing) throw new Error('item-limit');
        parent.lastItem = true;
      } else if (tag.name === 'outline') {
        if (!parent.lastItem || tag.selfClosing) throw new Error('orphan-outline');
        parent.lastItem = false;
      } else throw new Error('unsupported-outline-markup');
    } else if (parent.name === 'item') throw new Error('unsupported-outline-markup');
    else if (stack.some((n) => n.name === 'page')) {
      if (tag.name === 'outline' || tag.name === 'item') throw new Error('outline-in-page');
    } else throw new Error('unsupported-markup');
    const node = { name: tag.name };
    if (tag.name === 'outline') node.lastItem = false;
    if (tag.name === 'item') {
      node.rootItem = stack.length === 2;
      node.title = '';
      if (node.rootItem) {
        if (!/^\d+$/.test(tag.attrs.page ?? '')) throw new Error('invalid-page');
        node.page = Number(tag.attrs.page);
      }
    }
    stack.push(node);
    if (stack.length > MAX_DEPTH) throw new Error('depth-limit');
    if (tag.selfClosing) finish();
  }
  if (!rootSeen || !rootClosed || stack.length) throw new Error('incomplete-envelope');
  if (!rootOutline) return { reason: 'no-outline', producerVersion, counts: { duplicate_starts: 0, unselected_items: 0 } };
  if (!roots.length) return { reason: 'no-roots', producerVersion, counts: { duplicate_starts: 0, unselected_items: unselected } };
  return { roots, producerVersion, counts: { duplicate_starts: 0, unselected_items: unselected } };
}

function failure(reason, producerVersion = 'unknown', counts = { duplicate_starts: 0, unselected_items: 0 }) {
  return { reason, producerVersion, counts };
}

export async function extractPdfOutline(snapshot, extractedPages, declaredPages) {
  const output = await new Promise((resolve) => {
    execFile('pdftohtml', [...ARGS, snapshot], {
      encoding: 'buffer', timeout: 30000, killSignal: 'SIGKILL', maxBuffer: MAX_BYTES,
    }, (error, stdout) => {
      if (!error) { resolve({ stdout }); return; }
      const reason = error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'output-limit'
        : error.code === 'ENOENT' ? 'unavailable'
          : error.killed && error.signal === 'SIGKILL' ? 'timeout' : 'nonzero';
      resolve({ reason });
    });
  });
  if (output.reason) return failure(output.reason);
  let parsed;
  try {
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(output.stdout);
    parsed = parseOutline(xml);
  } catch { return failure('invalid-outline'); }
  if (parsed.reason) return failure(parsed.reason, parsed.producerVersion, parsed.counts);
  if (!Number.isSafeInteger(extractedPages) || extractedPages < 1 || declaredPages !== extractedPages)
    return failure('page-count-mismatch', parsed.producerVersion, parsed.counts);
  const selected = [];
  for (const root of parsed.roots) {
    if (!Number.isSafeInteger(root.page) || root.page < 1 || root.page > extractedPages)
      return failure('invalid-outline', parsed.producerVersion, parsed.counts);
    if (selected.length && root.page < selected.at(-1).page)
      return failure('invalid-outline', parsed.producerVersion, parsed.counts);
    if (selected.length && root.page === selected.at(-1).page) { parsed.counts.duplicate_starts++; continue; }
    selected.push(root);
  }
  return { roots: selected, producerVersion: parsed.producerVersion, counts: parsed.counts };
}
