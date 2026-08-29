/**
 * `MemoryBridge` — import host memory files into canonical `MemoryRecord`s.
 *
 * The bridge is the anti-corruption layer between a host's memory format
 * (a Claude Code `MEMORY.md`, a memory note, …) and this package's records.
 *
 * @packageDocumentation
 */

import type { MemoryBackend, MemoryRecord } from './backend.js';

/** Monotonic counter for bridge-generated record ids. */
let sequence = 0;

/** Options for a bridge import. */
export interface BridgeOptions {
  /** A label for where the memory came from, e.g. `claude-code:MEMORY.md`. */
  readonly source: string;
  /** Skill id to associate the imported records with. Default `imported`. */
  readonly skillId?: string;
  /** Score for imported records, in `[0, 1]`. Default `0.5`. */
  readonly score?: number;
}

interface Section {
  readonly heading: string;
  readonly body: string;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'section'
  );
}

/** Split markdown into sections on `##` headings (whole doc if there are none). */
function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let heading = 'document';
  let body: string[] = [];
  const flush = (): void => {
    sections.push({ heading, body: body.join('\n') });
  };
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[1] ?? 'section';
      body = [];
    } else {
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
export function importMemoryMarkdown(markdown: string, options: BridgeOptions): MemoryRecord[] {
  const skillId = options.skillId ?? 'imported';
  const score = options.score ?? 0.5;
  const timestamp = new Date().toISOString();
  return splitSections(markdown)
    .map((section): MemoryRecord => {
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
  constructor(private readonly backend: MemoryBackend) {}

  /** Parse `markdown` and store each resulting record; returns the records. */
  async importMarkdown(markdown: string, options: BridgeOptions): Promise<MemoryRecord[]> {
    const records = importMemoryMarkdown(markdown, options);
    for (const record of records) {
      await this.backend.put(record);
    }
    return records;
  }
}
