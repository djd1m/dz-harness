// SPDX-License-Identifier: MIT
export const DEFAULT_SLOP_CONFIG = Object.freeze({
    schema: 'dz-slop-config/1',
    lexicalDensityPer100Words: Object.freeze({ en: 4, ru: 4 }),
    lexicalMinimumMarkers: 2,
    lexicalWordFloor: 25,
    bulletMinimumItems: 8,
    bulletMinimumLineRatio: 0.8,
    bulletMaximumMeanWords: 12,
    adjectiveStackSize: 3,
});
export const BUNDLED_SLOP_REGISTRY_URL = new URL('../src/slop-markers.json', import.meta.url);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
function finiteIn(value, min, max) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
export function validateSlopLintConfig(value) {
    const errors = [];
    const root = record(value);
    if (root === null)
        return { ok: false, errors: [{ field: '$', value, reason: 'must be an object' }] };
    const need = (field, valid, reason) => {
        if (!valid)
            errors.push({ field, value: root[field], reason });
    };
    need('schema', root.schema === 'dz-slop-config/1', 'must equal dz-slop-config/1');
    const density = record(root.lexicalDensityPer100Words);
    if (density === null) {
        errors.push({ field: 'lexicalDensityPer100Words', value: root.lexicalDensityPer100Words, reason: 'must contain complete en and ru thresholds' });
    }
    else {
        if (!finiteIn(density.en, 0.1, 100))
            errors.push({ field: 'lexicalDensityPer100Words.en', value: density.en, reason: 'must be finite in 0.1..100' });
        if (!finiteIn(density.ru, 0.1, 100))
            errors.push({ field: 'lexicalDensityPer100Words.ru', value: density.ru, reason: 'must be finite in 0.1..100' });
    }
    need('lexicalMinimumMarkers', finiteIn(root.lexicalMinimumMarkers, 2, 100), 'must be finite in 2..100');
    need('lexicalWordFloor', finiteIn(root.lexicalWordFloor, 1, 1_000), 'must be finite in 1..1000');
    need('bulletMinimumItems', finiteIn(root.bulletMinimumItems, 3, 100), 'must be finite in 3..100');
    need('bulletMinimumLineRatio', finiteIn(root.bulletMinimumLineRatio, 0.5, 1), 'must be finite in 0.5..1');
    need('bulletMaximumMeanWords', finiteIn(root.bulletMaximumMeanWords, 1, 100), 'must be finite in 1..100');
    need('adjectiveStackSize', root.adjectiveStackSize === 3, 'must equal 3');
    if (errors.length > 0)
        return { ok: false, errors };
    return { ok: true, value: value };
}
function validateRegistryEntry(value, field, seen, errors) {
    const entry = record(value);
    if (entry === null) {
        errors.push({ field, value, reason: 'must be an object' });
        return;
    }
    const id = entry.id;
    if (typeof id !== 'string' || !/^(?:en|ru)\.[a-z0-9.-]+$/.test(id)) {
        errors.push({ field: `${field}.id`, value: id, reason: 'must be a stable en.* or ru.* id' });
    }
    else if (seen.has(id)) {
        errors.push({ field: `${field}.id`, value: id, reason: 'duplicate registry id' });
    }
    else {
        seen.add(id);
    }
    if (entry.language !== 'en' && entry.language !== 'ru') {
        errors.push({ field: `${field}.language`, value: entry.language, reason: 'must be en or ru' });
    }
    else if (typeof id === 'string' && !id.startsWith(`${entry.language}.`)) {
        errors.push({ field: `${field}.language`, value: entry.language, reason: 'must match the id language prefix' });
    }
    const match = record(entry.match);
    if (match === null || !['form', 'stem', 'phrase'].includes(String(match.kind))) {
        errors.push({ field: `${field}.match`, value: entry.match, reason: 'must use form, stem, or phrase' });
    }
    else if (!Array.isArray(match.values) || match.values.length === 0 ||
        match.values.some((item) => typeof item !== 'string' || item.trim() === '')) {
        errors.push({ field: `${field}.match.values`, value: match.values, reason: 'must contain non-empty literal strings' });
    }
    if (typeof entry.rationale !== 'string' || entry.rationale.trim() === '') {
        errors.push({ field: `${field}.rationale`, value: entry.rationale, reason: 'must be non-empty' });
    }
    const provenance = record(entry.provenance);
    if (provenance === null || typeof provenance.source !== 'string' || provenance.source.trim() === '' ||
        provenance.license !== 'repository-authored') {
        errors.push({ field: `${field}.provenance`, value: entry.provenance, reason: 'must name a source and repository-authored license' });
    }
}
export function parseSlopRegistry(value) {
    try {
        const errors = [];
        const root = record(value);
        if (root === null)
            return { ok: false, errors: [{ field: '$', value, reason: 'must be an object' }] };
        if (root.schema !== 'dz-slop-registry/1') {
            errors.push({ field: 'schema', value: root.schema, reason: 'must equal dz-slop-registry/1' });
        }
        const metadata = record(root.metadata);
        const reference = metadata === null ? null : record(metadata.englishReference);
        if (metadata === null || typeof metadata.policyVersion !== 'string' || typeof metadata.owner !== 'string' ||
            typeof metadata.reviewCadence !== 'string' || reference === null ||
            reference.repository !== 'https://github.com/NousResearch/autonovel' ||
            typeof reference.commit !== 'string' || !/^[0-9a-f]{40}$/.test(reference.commit) ||
            reference.path !== 'ANTI-SLOP.md' || reference.license !== 'none-declared' ||
            typeof reference.retrieved !== 'string' || typeof reference.use !== 'string') {
            errors.push({ field: 'metadata', value: root.metadata, reason: 'must carry owner, cadence, and the pinned unlicensed reference record' });
        }
        const markers = root.markers;
        const adjectives = root.adjectives;
        if (!Array.isArray(markers) || markers.length === 0) {
            errors.push({ field: 'markers', value: markers, reason: 'must contain entries' });
        }
        if (!Array.isArray(adjectives) || adjectives.length === 0) {
            errors.push({ field: 'adjectives', value: adjectives, reason: 'must contain entries' });
        }
        const seen = new Set();
        if (Array.isArray(markers))
            markers.forEach((entry, index) => validateRegistryEntry(entry, `markers[${index}]`, seen, errors));
        if (Array.isArray(adjectives))
            adjectives.forEach((entry, index) => validateRegistryEntry(entry, `adjectives[${index}]`, seen, errors));
        if (Array.isArray(markers) && !markers.some((entry) => record(entry)?.language === 'en')) {
            errors.push({ field: 'markers', value: markers, reason: 'must contain EN markers' });
        }
        if (Array.isArray(markers) && !markers.some((entry) => record(entry)?.language === 'ru')) {
            errors.push({ field: 'markers', value: markers, reason: 'must contain RU markers' });
        }
        if (Array.isArray(adjectives) && !adjectives.some((entry) => record(entry)?.language === 'en')) {
            errors.push({ field: 'adjectives', value: adjectives, reason: 'must contain EN adjectives' });
        }
        if (Array.isArray(adjectives) && !adjectives.some((entry) => record(entry)?.language === 'ru')) {
            errors.push({ field: 'adjectives', value: adjectives, reason: 'must contain RU adjectives' });
        }
        if (errors.length > 0)
            return { ok: false, errors };
        return { ok: true, value: value };
    }
    catch (error) {
        return { ok: false, errors: [{ field: '$', value, reason: error instanceof Error ? error.message : 'registry validation failed' }] };
    }
}
function sourceLines(text) {
    const lines = [];
    let offset = 0;
    let line = 1;
    while (offset <= text.length) {
        let end = offset;
        while (end < text.length && text[end] !== '\n' && text[end] !== '\r')
            end += 1;
        lines.push({ raw: text.slice(offset, end), line, offset });
        if (end >= text.length)
            break;
        if (text[end] === '\r' && text[end + 1] === '\n')
            end += 1;
        offset = end + 1;
        line += 1;
    }
    return lines;
}
function maskRange(chars, start, end) {
    for (let i = Math.max(0, start); i < Math.min(chars.length, end); i += 1)
        chars[i] = ' ';
}
function visibleMarkdown(raw) {
    // RegExp match offsets are UTF-16 code-unit offsets, so keep the projection in
    // code units too. Spreading would turn astral characters into one array slot
    // and shift every later source location.
    const chars = raw.split('');
    const maskMatches = (regex, keep = 0) => {
        regex.lastIndex = 0;
        for (let match = regex.exec(raw); match !== null; match = regex.exec(raw)) {
            maskRange(chars, match.index + keep, match.index + match[0].length);
            if (match[0].length === 0)
                regex.lastIndex += 1;
        }
    };
    maskMatches(/`+[^`]*`+/g);
    maskMatches(/\]\([^)]*\)/g, 1);
    maskMatches(/<[^>]*>/g);
    const heading = /^\s{0,3}#{1,6}\s+/.exec(raw);
    if (heading !== null)
        maskRange(chars, 0, heading[0].length);
    const bullet = /^\s{0,3}(?:[-+*]|\d+[.)])\s+/.exec(raw);
    if (bullet !== null)
        maskRange(chars, 0, bullet[0].length);
    for (let i = 0; i < chars.length; i += 1) {
        if ('*_~[]'.includes(chars[i] ?? ''))
            chars[i] = ' ';
    }
    return chars.join('');
}
function projectUnits(text) {
    const units = [];
    const diagnostics = [];
    let prose = [];
    let list = [];
    let fence = null;
    let inExample = false;
    let exampleStartLine = 1;
    let frontmatter = false;
    let frontmatterEligible = true;
    const flushProse = () => {
        if (prose.length > 0)
            units.push({ kind: 'prose', lines: prose });
        prose = [];
    };
    const flushList = () => {
        if (list.length > 0)
            units.push({ kind: 'list', lines: list });
        list = [];
    };
    const boundary = () => { flushProse(); flushList(); };
    for (const source of sourceLines(text)) {
        const trimmed = source.raw.trim();
        if (frontmatterEligible && source.line === 1 && trimmed === '---') {
            frontmatter = true;
            continue;
        }
        frontmatterEligible = false;
        if (frontmatter) {
            if (trimmed === '---')
                frontmatter = false;
            continue;
        }
        if (trimmed === '<!-- slop-lint:example:start -->') {
            boundary();
            if (!inExample)
                exampleStartLine = source.line;
            inExample = true;
            continue;
        }
        if (trimmed === '<!-- slop-lint:example:end -->') {
            boundary();
            inExample = false;
            continue;
        }
        if (inExample)
            continue;
        const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(source.raw);
        if (fenceMatch !== null) {
            boundary();
            const marker = fenceMatch[1][0];
            if (fence === null)
                fence = marker;
            else if (fence === marker)
                fence = null;
            continue;
        }
        if (fence !== null)
            continue;
        if (trimmed === '' || /^\s*>/.test(source.raw)) {
            boundary();
            continue;
        }
        const projected = { ...source, visible: visibleMarkdown(source.raw) };
        if (/^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(source.raw)) {
            flushProse();
            list.push(projected);
            continue;
        }
        if (/^\s{0,3}#{1,6}\s+/.test(source.raw) || /^\s*\|.*\|\s*$/.test(source.raw)) {
            boundary();
            units.push({ kind: 'prose', lines: [projected] });
            continue;
        }
        // A nonblank continuation remains part of the contiguous list section. This makes the
        // configured line ratio meaningful and prevents prose-heavy interrupted lists from being
        // treated as six adjacent one-line bullets.
        if (list.length > 0) {
            list.push(projected);
            continue;
        }
        prose.push(projected);
    }
    boundary();
    if (inExample) {
        diagnostics.push({ code: 'unclosed-example-block', line: exampleStartLine, message: 'slop-lint example block is not closed' });
    }
    return { units: units.filter((unit) => tokensFor(unit).length > 0), diagnostics };
}
function tokensFor(unit) {
    const tokens = [];
    const word = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
    for (const source of unit.lines) {
        word.lastIndex = 0;
        for (let match = word.exec(source.visible); match !== null; match = word.exec(source.visible)) {
            const value = match[0];
            tokens.push({
                normalized: value.normalize('NFC').toLocaleLowerCase('und'),
                text: source.raw.slice(match.index, match.index + value.length),
                line: source.line,
                columnStart: match.index + 1,
                columnEnd: match.index + value.length + 1,
                startOffset: source.offset + match.index,
                endOffset: source.offset + match.index + value.length,
                visibleLine: source.visible,
            });
        }
    }
    return tokens;
}
function valueTokens(value) {
    return (value.normalize('NFC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []);
}
function compile(entries) {
    return entries.map((entry) => ({
        id: entry.id,
        language: entry.language,
        kind: entry.match.kind,
        values: entry.match.values.map(valueTokens).filter((value) => value.length > 0),
    }));
}
function tokenMatches(token, expected, kind) {
    return kind === 'stem' ? token.startsWith(expected) : token === expected;
}
function candidatesFor(tokens, entries) {
    const hasLatin = tokens.some((token) => /\p{Script=Latin}/u.test(token.normalized));
    const hasCyrillic = tokens.some((token) => /\p{Script=Cyrillic}/u.test(token.normalized));
    const candidates = [];
    for (let index = 0; index < tokens.length; index += 1) {
        for (const entry of entries) {
            if ((entry.language === 'en' && !hasLatin) || (entry.language === 'ru' && !hasCyrillic))
                continue;
            for (const value of entry.values) {
                if (index + value.length > tokens.length)
                    continue;
                let matches = true;
                for (let part = 0; part < value.length; part += 1) {
                    const actual = tokens[index + part]?.normalized ?? '';
                    const expected = value[part] ?? '';
                    if (!tokenMatches(actual, expected, entry.kind)) {
                        matches = false;
                        break;
                    }
                }
                if (matches)
                    candidates.push({ entry, first: index, last: index + value.length - 1 });
            }
        }
    }
    return candidates;
}
function nonOverlapping(candidates) {
    const selected = [];
    const occupied = new Set();
    for (const candidate of [...candidates].sort((a, b) => (b.last - b.first) - (a.last - a.first) || a.entry.id.localeCompare(b.entry.id) || a.first - b.first)) {
        let overlap = false;
        for (let index = candidate.first; index <= candidate.last; index += 1)
            if (occupied.has(index))
                overlap = true;
        if (overlap)
            continue;
        selected.push(candidate);
        for (let index = candidate.first; index <= candidate.last; index += 1)
            occupied.add(index);
    }
    return selected.sort((a, b) => a.first - b.first || compareText(a.entry.id, b.entry.id));
}
function compareText(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function thresholds(config, density = 0) {
    return {
        densityPer100Words: density,
        minimumMarkers: config.lexicalMinimumMarkers,
        wordFloor: config.lexicalWordFloor,
        bulletMinimumItems: config.bulletMinimumItems,
        bulletMinimumLineRatio: config.bulletMinimumLineRatio,
        bulletMaximumMeanWords: config.bulletMaximumMeanWords,
        adjectiveStackSize: config.adjectiveStackSize,
    };
}
function metrics(overrides = {}) {
    return {
        markerCount: 0,
        distinctMarkers: 0,
        visibleWords: 0,
        densityPer100Words: 0,
        listItems: 0,
        listLineRatio: 0,
        listMeanWords: 0,
        adjectiveCount: 0,
        ...overrides,
    };
}
function clip(value, limit = 160) {
    const compact = value.replace(/\s+/gu, ' ').trim();
    return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}
function evidenceFor(text, tokens, match) {
    const first = tokens[match.first];
    const last = tokens[match.last];
    return {
        id: match.entry.id,
        language: match.entry.language,
        normalizedSpan: tokens.slice(match.first, match.last + 1).map((token) => token.normalized).join(' '),
        text: text.slice(first.startOffset, last.endOffset),
        lineStart: first.line,
        columnStart: first.columnStart,
        lineEnd: last.line,
        columnEnd: last.columnEnd,
        startOffset: first.startOffset,
        endOffset: last.endOffset,
        count: 1,
    };
}
function unitExcerpt(unit) {
    return clip(unit.lines.map((line) => line.raw).join('\n'));
}
function lexicalFinding(text, unit, paragraph, tokens, entries, config) {
    const selected = nonOverlapping(candidatesFor(tokens, entries));
    const distinctMarkers = new Set(selected.map((match) => match.entry.id)).size;
    if (distinctMarkers < config.lexicalMinimumMarkers)
        return null;
    const languages = new Set(selected.map((match) => match.entry.language));
    const language = languages.size === 2 ? 'mixed' : selected[0].entry.language;
    const densityThreshold = language === 'mixed'
        ? Math.max(config.lexicalDensityPer100Words.en, config.lexicalDensityPer100Words.ru)
        : config.lexicalDensityPer100Words[language];
    // The default policy intentionally has two regimes. The distinct-ID floor owns W <= 50;
    // density is a dilution cap that can reject the same two-hit cluster from W = 51 onward.
    const exactDensity = 100 * selected.length / Math.max(tokens.length, config.lexicalWordFloor);
    if (exactDensity < densityThreshold)
        return null;
    const evidence = selected.map((match) => evidenceFor(text, tokens, match));
    const first = evidence[0];
    const last = evidence[evidence.length - 1];
    return {
        ruleId: 'lexical-density',
        severity: 'advisory',
        paragraph,
        lineStart: first.lineStart,
        columnStart: first.columnStart,
        lineEnd: last.lineEnd,
        columnEnd: last.columnEnd,
        language,
        excerpt: unitExcerpt(unit),
        evidence,
        metrics: metrics({ markerCount: selected.length, distinctMarkers, visibleWords: tokens.length, densityPer100Words: Math.round(exactDensity * 100) / 100 }),
        thresholds: thresholds(config, densityThreshold),
        suggestion: 'Replace repeated stock wording with concrete facts, or keep the terms and document why the cluster is necessary.',
    };
}
function stockAdjectiveLeadCount(unit, entries) {
    let count = 0;
    for (const line of unit.lines) {
        if (!/^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(line.raw))
            continue;
        const lineTokens = tokensFor({ kind: 'list', lines: [line] });
        if (candidatesFor(lineTokens, entries).some((candidate) => candidate.first === 0))
            count += 1;
    }
    return count;
}
function bulletFinding(unit, paragraph, adjectiveEntries, config) {
    if (unit.kind !== 'list')
        return null;
    const itemCount = unit.lines.filter((line) => /^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(line.raw)).length;
    const lineRatio = unit.lines.length === 0 ? 0 : itemCount / unit.lines.length;
    const visibleWords = tokensFor(unit).length;
    const meanWords = itemCount === 0 ? 0 : visibleWords / itemCount;
    if (itemCount < config.bulletMinimumItems || lineRatio < config.bulletMinimumLineRatio ||
        meanWords > config.bulletMaximumMeanWords)
        return null;
    // Short reference tables, TOCs, procedures, and file inventories occupy the same numeric range
    // as synthetic bullet walls. Require the wall to repeat a closed-registry stock-adjective lead;
    // the configured item floor is also the minimum number of qualifying leads.
    const adjectiveLeadCount = stockAdjectiveLeadCount(unit, adjectiveEntries);
    if (adjectiveLeadCount < config.bulletMinimumItems)
        return null;
    const first = unit.lines[0];
    const last = unit.lines[unit.lines.length - 1];
    return {
        ruleId: 'bullet-wall',
        severity: 'advisory',
        paragraph,
        lineStart: first.line,
        columnStart: 1,
        lineEnd: last.line,
        columnEnd: last.raw.length + 1,
        language: 'structural',
        excerpt: unitExcerpt(unit),
        evidence: [],
        metrics: metrics({
            visibleWords,
            listItems: itemCount,
            listLineRatio: Math.round(lineRatio * 100) / 100,
            listMeanWords: Math.round(meanWords * 100) / 100,
            adjectiveCount: adjectiveLeadCount,
        }),
        thresholds: thresholds(config),
        suggestion: 'Replace repeated stock-adjective leads with concrete, non-redundant claims; keep a reference list when its structure is essential.',
    };
}
function gapAllowsStack(first, second) {
    if (first.line !== second.line)
        return false;
    const gap = first.visibleLine.slice(first.columnEnd - 1, second.columnStart - 1)
        .replace(/[\s,*_~[\]()]+/gu, ' ')
        .trim()
        .toLowerCase();
    return gap === '';
}
function adjectiveFinding(text, unit, paragraph, tokens, entries, config) {
    const matches = tokens.map((_, index) => nonOverlapping(candidatesFor(tokens.slice(index, index + 1), entries))[0] ?? null);
    for (let index = 0; index + config.adjectiveStackSize <= tokens.length; index += 1) {
        if (matches[index] === null || matches[index + 1] === null)
            continue;
        if (index > 0 && matches[index - 1] !== null)
            continue;
        const conjunctionIndex = index + 2;
        const hasConjunction = tokens[conjunctionIndex]?.normalized === 'and' || tokens[conjunctionIndex]?.normalized === 'и';
        const thirdIndex = hasConjunction ? index + 3 : index + 2;
        const third = matches[thirdIndex];
        if (third === null || third === undefined)
            continue;
        const next = matches[thirdIndex + 1];
        if (tokens[thirdIndex + 1] === undefined)
            continue;
        if (next !== null && next !== undefined)
            continue;
        const indices = [index, index + 1, thirdIndex];
        if (!gapAllowsStack(tokens[index], tokens[index + 1]))
            continue;
        if (hasConjunction) {
            if (!gapAllowsStack(tokens[index + 1], tokens[conjunctionIndex]) ||
                !gapAllowsStack(tokens[conjunctionIndex], tokens[thirdIndex]))
                continue;
        }
        else if (!gapAllowsStack(tokens[index + 1], tokens[thirdIndex]))
            continue;
        const typed = indices.map((tokenIndex) => matches[tokenIndex]);
        if (new Set(typed.map((match) => match.entry.id)).size !== config.adjectiveStackSize)
            continue;
        const evidence = typed.map((match, part) => evidenceFor(text, tokens, { ...match, first: indices[part], last: indices[part] }));
        return {
            ruleId: 'triple-adjective-stack',
            severity: 'advisory',
            paragraph,
            lineStart: evidence[0].lineStart,
            columnStart: evidence[0].columnStart,
            lineEnd: evidence[evidence.length - 1].lineEnd,
            columnEnd: evidence[evidence.length - 1].columnEnd,
            language: new Set(evidence.map((item) => item.language)).size === 2 ? 'mixed' : evidence[0].language,
            excerpt: unitExcerpt(unit),
            evidence,
            metrics: metrics({ visibleWords: tokens.length, adjectiveCount: config.adjectiveStackSize }),
            thresholds: thresholds(config),
            suggestion: 'Keep only qualifiers that add distinct, testable information.',
        };
    }
    return null;
}
/**
 * Pure deterministic style analysis. The caller supplies already-loaded policy data; this function
 * performs no file, network, database, clock, locale, or process I/O and never throws.
 */
export function slopLint(text, input) {
    try {
        if (typeof text !== 'string') {
            return { paragraphCount: 0, findings: [], diagnostics: [{ code: 'analysis-error', line: 1, message: 'text must be a string' }] };
        }
        if (text.length > 2 * 1024 * 1024) {
            return { paragraphCount: 0, findings: [], diagnostics: [{ code: 'input-limit-exceeded', line: 1, message: 'input exceeds the 2 MiB core limit' }] };
        }
        const configResult = validateSlopLintConfig(input?.config);
        if (!configResult.ok) {
            return { paragraphCount: 0, findings: [], diagnostics: [{ code: 'analysis-error', line: 1, message: configResult.errors.map((error) => `${error.field}: ${error.reason}`).join('; ') }] };
        }
        const registryResult = parseSlopRegistry(input?.registry);
        if (!registryResult.ok) {
            return { paragraphCount: 0, findings: [], diagnostics: [{ code: 'analysis-error', line: 1, message: registryResult.errors.map((error) => `${error.field}: ${error.reason}`).join('; ') }] };
        }
        const projected = projectUnits(text);
        const markerEntries = compile(registryResult.value.markers);
        const adjectiveEntries = compile(registryResult.value.adjectives);
        const findings = [];
        for (let index = 0; index < projected.units.length; index += 1) {
            const unit = projected.units[index];
            const tokens = tokensFor(unit);
            const paragraph = index + 1;
            const lexical = lexicalFinding(text, unit, paragraph, tokens, markerEntries, configResult.value);
            const bullet = bulletFinding(unit, paragraph, adjectiveEntries, configResult.value);
            const adjectives = adjectiveFinding(text, unit, paragraph, tokens, adjectiveEntries, configResult.value);
            if (lexical !== null)
                findings.push(lexical);
            if (bullet !== null)
                findings.push(bullet);
            if (adjectives !== null)
                findings.push(adjectives);
            if (findings.length > 1_000) {
                return {
                    paragraphCount: projected.units.length,
                    findings: [],
                    diagnostics: [...projected.diagnostics, { code: 'input-limit-exceeded', line: unit.lines[0]?.line ?? 1, message: 'finding cap exceeded; no partial clean result was returned' }],
                };
            }
        }
        findings.sort((a, b) => a.lineStart - b.lineStart || a.columnStart - b.columnStart || compareText(a.ruleId, b.ruleId) ||
            compareText(a.evidence[0]?.id ?? '', b.evidence[0]?.id ?? ''));
        return { paragraphCount: projected.units.length, findings, diagnostics: projected.diagnostics };
    }
    catch (error) {
        return {
            paragraphCount: 0,
            findings: [],
            diagnostics: [{ code: 'analysis-error', line: 1, message: error instanceof Error ? error.message : 'analysis failed' }],
        };
    }
}
//# sourceMappingURL=slop-lint.js.map