import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep, isAbsolute, dirname, relative } from 'node:path';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const digest = value => createHash('sha256').update(value).digest('hex');
export const recordHash = record => digest(JSON.stringify(canonical(record)));
const text = value => typeof value === 'string' && value.trim().length > 0;
const texts = value => Array.isArray(value) && value.every(text);

function readInside(root, path) {
  if (!text(path) || isAbsolute(path) || path.split(/[\\/]/u).includes('..')) throw Error('Invalid source path');
  const base = realpathSync(root);
  const full = realpathSync(resolve(base, path));
  if (!full.startsWith(base + sep)) throw Error('Source outside repository');
  return readFileSync(full);
}

/** Local build-time verification, not proof of semantic entailment or reviewer identity. */
export function validateRecord(record, root) {
  if (!record || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.id)) throw Error('Invalid scenario ID');
  for (const field of ['title', 'intent', 'outcome']) if (!text(record[field])) throw Error(`Missing ${field}`);
  for (const field of ['skillIds', 'queries', 'whenToUse', 'whenNotToUse', 'prerequisites', 'steps', 'limitations']) {
    if (!texts(record[field])) throw Error(`Invalid ${field}`);
  }
  if (!record.queries.length || !record.skillIds.length || !record.whenToUse.length) throw Error('Empty scenario');
  if (record.courseUrl !== null) throw Error('Course links require a separate verified mapping');
  if (!text(record.package?.manifest) || !text(record.package?.name) || !text(record.package?.version)) throw Error('Missing package identity');
  const manifest = JSON.parse(readInside(root, record.package.manifest));
  if (manifest.name !== record.package.name || manifest.version !== record.package.version) throw Error('Package version/name changed');
  if (!Array.isArray(record.sources) || !record.sources.length) throw Error('Missing source snapshots');
  const sources = new Map();
  for (const source of record.sources) {
    if (!source || sources.has(source.path) || !/^[a-f0-9]{64}$/u.test(source.sha256)) throw Error('Invalid source snapshot');
    const bytes = readInside(root, source.path);
    if (digest(bytes) !== source.sha256) throw Error(`Stale source: ${source.path}`);
    sources.set(source.path, bytes.toString('utf8'));
  }
  if (!sources.has(record.package.manifest)) throw Error('Package manifest must be hashed');
  const packageRoot = realpathSync(resolve(root, dirname(record.package.manifest)));
  if (!texts(manifest.files)) throw Error('Explicit package files allowlist required for this pilot');
  const declaredSkills = [...sources.entries()].flatMap(([path, source]) => {
    const full = realpathSync(resolve(root, path));
    if (!full.startsWith(packageRoot + sep)) return [];
    const local = relative(packageRoot, full).split(sep).join('/');
    const shipped = manifest.files.some(entry => {
      // Pilot manifests use exact files or directories, not glob expressions.
      if (/[*?!{[]/u.test(entry)) return false;
      const prefix = entry.replace(/\/$/u, '');
      return local === prefix || local.startsWith(prefix + '/');
    });
    if (!shipped) return [];
    const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/u)?.[1];
    return frontmatter?.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/mu)?.[1] ?? [];
  });
  if (record.skillIds.some(id => !declaredSkills.includes(id))) throw Error('Selected skill missing from captured frontmatter');
  if (!Array.isArray(record.evidence) || !record.evidence.length) throw Error('Missing evidence');
  for (const evidence of record.evidence) {
    if (!text(evidence?.quote) || evidence.quote.trim().length < 16 || !sources.has(evidence.path) ||
        !sources.get(evidence.path).includes(evidence.quote)) throw Error('Unverified source quote');
  }
  return record;
}

/** Receipts are trusted host input. Hashes bind content; they do not authenticate a model. */
export function compileCatalog(records, receipts, root) {
  if (!Array.isArray(records) || !Array.isArray(receipts)) throw Error('Expected records and review receipts');
  const ids = new Set();
  const reviews = new Map();
  for (const receipt of receipts) {
    if (!text(receipt?.id) || reviews.has(receipt.id) || !text(receipt.reviewer) ||
        !text(receipt.reason) || !['approved', 'rejected'].includes(receipt.verdict) ||
        !/^[a-f0-9]{64}$/u.test(receipt.recordHash)) throw Error('Invalid/duplicate review receipt');
    reviews.set(receipt.id, receipt);
  }
  const accepted = [], excluded = [];
  for (const record of records) {
    if (!record || !text(record.id) || ids.has(record.id)) throw Error('Invalid/duplicate scenario ID');
    ids.add(record.id);
    try {
      validateRecord(record, root);
      const review = reviews.get(record.id);
      if (!review || review.recordHash !== recordHash(record)) throw Error('Missing or stale review');
      if (review.verdict !== 'approved') throw Error('Review rejected');
      accepted.push(structuredClone(record));
    } catch (error) {
      // Every excluded draft is observable; no last-good stale content is substituted.
      excluded.push({ id: record.id, reason: error.message });
    }
  }
  return { schema: 'dz-scenario-index/1', revision: recordHash(accepted), records: accepted, excluded };
}

const cell = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/\r?\n/gu, ' ');
export function catalogTable(catalog) {
  return '# Проверенные сценарии — пилот\n\nСгенерировано из канонического JSON. Подтверждение относится к документации, не к выполнению навыков.\n\n' +
    '| Сценарий | Пакет / навыки | Результат | Условия | Ограничения |\n|---|---|---|---|---|\n' +
    catalog.records.map(r => '| ' + [r.title, `${r.package.name}@${r.package.version}: ${r.skillIds.join(', ')}`, r.outcome,
      [...r.whenToUse, ...r.prerequisites].join('; '), [...r.whenNotToUse, ...r.limitations].join('; ')].map(cell).join(' | ') + ' |').join('\n') + '\n';
}
