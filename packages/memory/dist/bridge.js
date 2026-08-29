/**
 * `MemoryBridge` — import host memory files into canonical `MemoryRecord`s.
 *
 * The bridge is the anti-corruption layer between a host's memory format
 * (a Claude Code `MEMORY.md`, a memory note, …) and this package's records.
 *
 * @packageDocumentation
 */
/** Monotonic counter for bridge-generated record ids. */
let sequence = 0;
function slug(text) {
    return (text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'section');
}
/** Split markdown into sections on `##` headings (whole doc if there are none). */
function splitSections(markdown) {
    const sections = [];
    let heading = 'document';
    let body = [];
    const flush = () => {
        sections.push({ heading, body: body.join('\n') });
    };
    for (const line of markdown.split(/\r?\n/)) {
        const match = /^##\s+(.+?)\s*$/.exec(line);
        if (match) {
            flush();
            heading = match[1] ?? 'section';
            body = [];
        }
        else {
            body.push(line);
        }
    }
    flush();
    return sections;
}
/**
 * Parse a host memory markdown document into {@link MemoryRecord}s — one record
 * per `##` section (or one for the whole document if it has no headings).
 * Empty sections are dropped. Pure: it does not touch any backend.
 */
export function importMemoryMarkdown(markdown, options) {
    const skillId = options.skillId ?? 'imported';
    const score = options.score ?? 0.5;
    const timestamp = new Date().toISOString();
    return splitSections(markdown)
        .map((section) => {
        sequence += 1;
        return {
            id: `bridge:${slug(options.source)}:${slug(section.heading)}:${sequence}`,
            skillId,
            text: section.body.trim(),
            score,
            outcome: 'imported',
            timestamp,
            metadata: { source: options.source, heading: section.heading },
        };
    })
        .filter((record) => record.text.length > 0);
}
/** Imports host memory markdown into a {@link MemoryBackend}. */
export class MemoryBridge {
    backend;
    constructor(backend) {
        this.backend = backend;
    }
    /** Parse `markdown` and store each resulting record; returns the records. */
    async importMarkdown(markdown, options) {
        const records = importMemoryMarkdown(markdown, options);
        for (const record of records) {
            await this.backend.put(record);
        }
        return records;
    }
}
//# sourceMappingURL=bridge.js.map