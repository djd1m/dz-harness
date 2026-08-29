/**
 * Hash-chained, sequence-numbered learning-event logs (feature `event-chain`, ADR-001/ADR-002).
 *
 * `.dz/recall-usage.jsonl` and `.dz/guard-audit.jsonl` are the ENTIRE evidence base for every
 * `dz compounding` verdict and for `dz guard promote`. Before this module a record had no identity
 * and no link to its neighbour, so a defect in the code that REWRITES those files was invisible to
 * everything except a human noticing a wrong number — which is exactly how the 2 → 4 → 6
 * double-count in `compactRecallUsageLog` was found (fixed 2026-07-28, see `recall-usage.ts`).
 *
 * WHAT THIS IS. A corruption check for OUR OWN bugs: a buggy compaction, a torn write, two writers
 * racing. Each appended record carries `seq` (monotonic within its segment) and `prevHash` (FNV-1a
 * over the previous record's line, exactly as it sits on disk), and {@link verifyEventChain}
 * classifies what it finds.
 *
 * WHAT THIS IS NOT — read {@link EVENT_CHAIN_SCOPE} before describing it to anyone. FNV-1a is not
 * cryptography and the threat model has no adversary: anyone who can edit the log can recompute the
 * chain in one line of code. That is deliberate and sufficient, because the failures we actually
 * ship are our own. ruview's ADR-010 names a `TamperedEntry` class; this module does not, because a
 * defect class called "Tampered" IS the over-claim.
 *
 * FNV-1a collisions are CONSTRUCTIBLE — a 32-bit hash has none of the collision resistance a
 * cryptographic one does, and a reviewer demonstrated a pair (Codex QE LOW-8). That is a documented
 * property, not a surprise: the chain detects ACCIDENT classes (a compaction bug, a torn write, a
 * race), not chosen-input attacks, which is exactly the corruption-not-tamper scope above. Swapping
 * in sha256 would buy nothing this threat model needs and would invite the over-claim back.
 *
 * Everything here is PURE — no filesystem, no clock. Writers own their IO (the house pattern from
 * `recall-usage.ts`), which is what keeps the never-block discipline of the apply leg intact.
 *
 * @packageDocumentation
 */

/** The one sentence that states what the chain is and is not. Printed by every verify surface. */
export const EVENT_CHAIN_SCOPE =
  'corruption detection for our own bugs (compaction, torn writes, races) — FNV-1a is not cryptography, ' +
  'the threat model has no adversary, and anyone who can edit the log can recompute the chain';

/** `prevHash` of the first record of a chain segment. */
export const EVENT_CHAIN_GENESIS_HASH = '00000000';

/** How many bytes of a log's tail a writer needs to read to find the last line. */
export const EVENT_CHAIN_TAIL_BYTES = 65_536;

/**
 * Bytes charged per line for its chain fields when a rewriter budgets its output. Measured against
 * the widest realistic shape: `,"seq":<up to 15 digits>,"prevHash":"xxxxxxxx",` plus the reset
 * marker — deliberately generous, because under-charging would blow a byte cap.
 */
export const EVENT_CHAIN_FIELD_OVERHEAD_BYTES = 64;

/** Marker record a rewriter puts first so its output can be checked against its input (ADR-002). */
export const EVENT_CHAIN_LEDGER_KIND = 'chain-ledger';

const HEX8 = /^[0-9a-f]{8}$/;

export type EventChainDefectKind =
  /** A record's `prevHash` does not match the line before it — or a hole where a link should be. */
  | 'BrokenLink'
  /** The same `seq` appears twice in one segment — a rewrite duplicated a line, or two writers raced. */
  | 'DuplicateSeq'
  /** `seq` went backwards without a recorded segment restart. */
  | 'NonMonotonicSeq'
  /** A line that is not a readable record — the shape a partial write leaves. */
  | 'TornTail'
  /** A rewrite accounts for more events than it measured in its input (ADR-002 — the 2 → 4 → 6 class). */
  | 'DoubleCounted'
  /** A rewrite's own three numbers do not add up, or claim an impossible drop (ADR-002 AM-3). */
  | 'LedgerImbalance'
  /** A ledger line whose fields are missing, mistyped or non-finite — never silently ignored (AM-5). */
  | 'MalformedLedger'
  /** A rewrite's claim was never completed: the segment restarted or the file ended first (AM-4). */
  | 'ClaimInterrupted';

/**
 * The defect vocabulary, as data. ruview's ADR-010 names one more class that this list deliberately
 * omits — a class whose name would assert exactly the promise {@link EVENT_CHAIN_SCOPE} refuses —
 * and a test asserts no kind here ever grows that vocabulary.
 */
export const EVENT_CHAIN_DEFECT_KINDS: readonly EventChainDefectKind[] = [
  'BrokenLink',
  'DuplicateSeq',
  'NonMonotonicSeq',
  'TornTail',
  'DoubleCounted',
  'LedgerImbalance',
  'MalformedLedger',
  'ClaimInterrupted',
];

export interface EventChainDefect {
  readonly kind: EventChainDefectKind;
  /** 1-based index into the lines handed to the verifier. */
  readonly line: number;
  readonly detail: string;
  readonly seq?: number;
}

export interface EventChainVerification {
  readonly ok: boolean;
  /** Non-empty lines examined. */
  readonly lines: number;
  /** Lines carrying a well-formed `seq` + `prevHash`. */
  readonly chained: number;
  /**
   * Leading run of records written before chaining existed. LEGAL, never a defect — the chain is
   * allowed to start mid-file. Reported so the uncovered part is honest rather than invisible.
   */
  readonly preChainPrefix: number;
  /** Recorded discontinuities (`chainReset: true`) — a torn tail the writer refused to paper over. */
  readonly resets: number;
  /** Highest `seq` seen in the last segment, or null when nothing is chained. */
  readonly lastSeq: number | null;
  readonly defects: readonly EventChainDefect[];
  /** {@link EVENT_CHAIN_SCOPE}, carried in the result so no surface can print a verdict without it. */
  readonly scope: string;
}

export interface ChainFields {
  readonly seq: number;
  readonly prevHash: string;
  /** Present only when the writer had to start a fresh segment because the tail was unreadable. */
  readonly chainReset?: true;
}

export interface EventChainLedger {
  readonly kind: typeof EVENT_CHAIN_LEDGER_KIND;
  /** Event weight of the INPUT, measured before aggregation. */
  readonly sourceEvents: number;
  /** What a byte budget deliberately discarded — so trimming is not mistaken for loss. */
  readonly droppedEvents: number;
  /** Last `seq` this rewrite wrote. Records past it are outside the claim. */
  readonly throughSeq: number;
  readonly compactedAt: string;
}

/**
 * FNV-1a, 32 bits, over both UTF-16 bytes of every code unit in order.
 *
 * Both bytes, unconditionally: folding with `& 0xff` would make every Cyrillic pair that shares a
 * low byte collide, and these logs carry Russian prompts. 32 bits gives roughly a 1-in-4.3e9
 * accidental-collision chance per link, which is the right size for detecting a bug and the wrong
 * size for detecting an enemy — see {@link EVENT_CHAIN_SCOPE}.
 */
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((c >>> 8) & 0xff), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Strip the line terminator a reader may have left, so writer and verifier hash the same string. */
function stripEol(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/** The hash a record's successor must carry. Input is the line AS WRITTEN (ADR-001 decision 2). */
export function chainHashOf(line: string): string {
  return fnv1a32(stripEol(line));
}

/** Non-empty lines of a JSONL text, terminators stripped. The one splitter both sides use. */
export function chainLinesOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = stripEol(raw);
    if (line.trim() !== '') out.push(line);
  }
  return out;
}

/**
 * Last usable line of a log's TAIL chunk — all a writer needs to extend the chain (FR-2).
 *
 * When the chunk does not start at byte 0 its first line may be a fragment; with more than one line
 * present the fragment is simply not the last one, and with exactly one line the caller is looking
 * at a single record longer than {@link EVENT_CHAIN_TAIL_BYTES}, which no writer here produces —
 * that returns `undefined`, and the caller starts a marked segment rather than chaining onto a guess.
 */
export function lastChainLine(tailText: string, opts: { readonly partial?: boolean } = {}): string | undefined {
  if (typeof tailText !== 'string') return undefined;
  const lines = chainLinesOf(tailText);
  if (lines.length === 0) return undefined;
  if (opts.partial === true && !tailText.includes('\n')) return undefined;
  return lines[lines.length - 1];
}

/** What an appender needs to know about the file it is about to extend. */
export interface LogTail {
  readonly lastLine: string | undefined;
  /**
   * False when the file's final byte is not a newline — the shape a torn write leaves.
   *
   * LOAD-BEARING: appending straight onto a fragment GLUES the new record to it, so one torn write
   * silently eats the next one too. (Found by the CLI torn-tail test, 2026-07-29 — the first append
   * after a truncated line produced a single unreadable line instead of a marked restart.) The
   * appender emits a leading newline so the damage stays exactly one record wide.
   */
  readonly endsWithNewline: boolean;
  /**
   * True when the file is NOT empty but no complete record could be found in the tail window.
   *
   * AM-6 (Codex QE MED-6): without this, a torn record longer than {@link EVENT_CHAIN_TAIL_BYTES}
   * gave `lastLine: undefined`, which is indistinguishable from an EMPTY file — so the appender
   * started an UNMARKED genesis segment and quietly broke the marked-segment contract that ADR-001
   * D4 exists to enforce. "I saw nothing" and "there is nothing" are different facts.
   */
  readonly unreadable: boolean;
}

/** Read a tail chunk into the facts an appender needs. `partial` ⇒ the chunk starts mid-file. */
export function readTailInfo(tailText: string, opts: { readonly partial?: boolean } = {}): LogTail {
  const text = typeof tailText === 'string' ? tailText : '';
  const lastLine = lastChainLine(text, opts);
  return {
    lastLine,
    endsWithNewline: text === '' || text.endsWith('\n'),
    unreadable: lastLine === undefined && text.trim() !== '',
  };
}

/** An empty log — what an appender assumes when the file is absent. */
export const EMPTY_LOG_TAIL: LogTail = { lastLine: undefined, endsWithNewline: true, unreadable: false };

/**
 * The exact text to append for a run of records: chained, newline-terminated, and preceded by a
 * newline when the file ends mid-line. THE one place that knows how to extend one of these logs —
 * the recall hook and the guard audit must not each carry their own copy of this reasoning.
 */
export function appendChainedLines(records: readonly object[], tail: LogTail = EMPTY_LOG_TAIL): string {
  // AM-6: an unreadable tail is a TORN tail, never an empty one — it must produce a MARKED segment.
  const lines = chainRecordLines(records, tail.lastLine, { forceReset: tail.unreadable === true });
  if (lines.length === 0) return '';
  return `${tail.endsWithNewline === false ? '\n' : ''}${lines.join('\n')}\n`;
}

interface ParsedChainRecord {
  readonly record: Record<string, unknown>;
  readonly seq: number | undefined;
  readonly prevHash: string | undefined;
  readonly reset: boolean;
}

function parseLine(line: string): ParsedChainRecord | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const rawSeq = record['seq'];
  const rawPrev = record['prevHash'];
  const seq =
    typeof rawSeq === 'number' && Number.isSafeInteger(rawSeq) && rawSeq >= 1 ? rawSeq : undefined;
  const prevHash = typeof rawPrev === 'string' && HEX8.test(rawPrev) ? rawPrev : undefined;
  return { record, seq, prevHash, reset: record['chainReset'] === true };
}

/**
 * The chain fields the next appended record must carry, derived from the last line ALONE.
 *
 * TOTAL by construction — it cannot throw for any input, because the apply-leg hook's top safety
 * property is never-block (ADR-001 D2). Every unreadable shape resolves the same way: start a fresh
 * segment AND record the discontinuity, so a break is visible instead of silently healed (D4).
 *
 * - no last line (new/empty file)              → genesis, no marker: this is a chain START
 * - last line is an unchained record           → genesis, no marker: the chain starts mid-file (FR-5)
 * - last line is a chained record              → `seq + 1`, linked to that line's hash
 * - last line is unreadable / has a bad `seq`  → genesis + `chainReset: true` (FR-3)
 */
export function nextChainFields(
  lastLine: string | undefined,
  opts: { readonly forceReset?: boolean } = {},
): ChainFields {
  try {
    // AM-6: the caller saw a non-empty file it could not read a record from. That is a torn tail,
    // and a torn tail is ALWAYS a marked segment — never a silent genesis.
    if (opts.forceReset === true) {
      return { seq: 1, prevHash: EVENT_CHAIN_GENESIS_HASH, chainReset: true };
    }
    if (typeof lastLine !== 'string' || lastLine.trim() === '') {
      return { seq: 1, prevHash: EVENT_CHAIN_GENESIS_HASH };
    }
    const parsed = parseLine(stripEol(lastLine));
    if (parsed === undefined) {
      return { seq: 1, prevHash: EVENT_CHAIN_GENESIS_HASH, chainReset: true };
    }
    if (parsed.seq === undefined && parsed.prevHash === undefined) {
      // A pre-chain record: this append is the first link, not a break.
      return { seq: 1, prevHash: EVENT_CHAIN_GENESIS_HASH };
    }
    if (parsed.seq === undefined || parsed.prevHash === undefined || parsed.seq >= Number.MAX_SAFE_INTEGER) {
      // Half a chain header, a non-integer/overflowing counter: readable JSON, unusable link.
      return { seq: 1, prevHash: EVENT_CHAIN_GENESIS_HASH, chainReset: true };
    }
    return { seq: parsed.seq + 1, prevHash: chainHashOf(stripEol(lastLine)) };
  } catch {
    return { seq: 1, prevHash: EVENT_CHAIN_GENESIS_HASH, chainReset: true };
  }
}

/** Append the chain fields to a record. Fields go LAST so readers that whitelist keys are unaffected. */
export function withChainFields<T extends object>(record: T, fields: ChainFields): T & ChainFields {
  return {
    ...record,
    seq: fields.seq,
    prevHash: fields.prevHash,
    ...(fields.chainReset === true ? { chainReset: true as const } : {}),
  };
}

/**
 * Serialise a run of records into chained lines (no trailing newline on each), continuing from
 * `lastLine`. Used both by the appenders (1..3 records per prompt) and by the rewriters.
 */
export function chainRecordLines(
  records: readonly object[],
  lastLine: string | undefined,
  opts: { readonly forceReset?: boolean } = {},
): string[] {
  const out: string[] = [];
  let prev = lastLine;
  let force = opts.forceReset === true;
  for (const rec of records) {
    const line = JSON.stringify(withChainFields(rec, nextChainFields(prev, { forceReset: force })));
    force = false; // only the FIRST record of the run opens the new segment
    out.push(line);
    prev = line;
  }
  return out;
}

/**
 * Default event weight of a line (ADR-002 decision 4): the ledger itself weighs nothing, an
 * aggregate weighs the reads it folded, anything else is one event.
 */
export function defaultEventWeight(record: Record<string, unknown>): number {
  if (record['kind'] === EVENT_CHAIN_LEDGER_KIND) return 0;
  if (record['kind'] === 'aggregate') {
    const reads = record['reads'];
    return typeof reads === 'number' && Number.isFinite(reads) && reads > 0 ? Math.floor(reads) : 0;
  }
  return 1;
}

/**
 * Build the chained lines of a full rewrite: a {@link EventChainLedger} first, then the records.
 *
 * `sourceEvents` must be measured from the INPUT, before aggregation — a number derived from the
 * output can never disagree with it, which is the whole point (ADR-002).
 */
export function chainRewrite(
  records: readonly object[],
  opts: {
    readonly sourceEvents: number;
    readonly droppedEvents?: number;
    readonly compactedAt: string;
  },
): string[] {
  const sourceEvents = clampCount(opts.sourceEvents);
  const droppedEvents = clampCount(opts.droppedEvents ?? 0);
  const ledger: EventChainLedger = {
    kind: EVENT_CHAIN_LEDGER_KIND,
    sourceEvents,
    droppedEvents,
    throughSeq: records.length + 1,
    compactedAt: opts.compactedAt,
  };
  return chainRecordLines([ledger, ...records], undefined);
}

function clampCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Total event weight of a JSONL text — the measurement a rewriter records as `sourceEvents`. */
export function eventWeightOfText(
  text: string,
  weightOf: (record: Record<string, unknown>) => number = defaultEventWeight,
): number {
  let total = 0;
  for (const line of chainLinesOf(text)) {
    const parsed = parseLine(line);
    if (parsed === undefined) continue;
    const w = weightOf(parsed.record);
    if (Number.isFinite(w) && w > 0) total += Math.floor(w);
  }
  return total;
}

export interface VerifyEventChainOptions {
  readonly eventWeight?: (record: Record<string, unknown>) => number;
}

interface LedgerClaim {
  readonly line: number;
  readonly segment: number;
  readonly fromSeq: number;
  readonly throughSeq: number;
  readonly sourceEvents: number;
  readonly droppedEvents: number;
  accounted: number;
  /** Still awaiting the chained evidence up to `throughSeq`. */
  open: boolean;
  /** Set when the segment restarted (or the file ended) before the claim was satisfied. */
  interruptedAtLine: number | null;
}

/**
 * Verify a chained log. PURE: hand it the lines, get back every defect it can name.
 *
 * A file that has never been chained verifies OK with `preChainPrefix === lines` — records written
 * before chaining existed are legal, and the uncovered prefix is reported as a count rather than
 * flagged (FR-5). Once the chain starts, an unchained record after it is a hole (`BrokenLink`).
 */
export function verifyEventChain(
  lines: readonly string[],
  opts: VerifyEventChainOptions = {},
): EventChainVerification {
  const weightOf = typeof opts.eventWeight === 'function' ? opts.eventWeight : defaultEventWeight;
  const defects: EventChainDefect[] = [];
  const claims: LedgerClaim[] = [];

  // Index of the last non-empty line, so "torn TAIL" can be told from a torn record mid-file.
  let lastNonEmpty = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (stripEol(lines[i] ?? '').trim() !== '') lastNonEmpty = i;
  }

  let examined = 0;
  let chained = 0;
  let preChainPrefix = 0;
  let resets = 0;
  let chainStarted = false;
  let segment = 0;
  let prevLine: string | undefined;
  let prevSeq: number | undefined;
  let seen = new Set<number>();
  // CROSS-SEGMENT duplicate CONTENT (Codex re-QE MED): the per-segment `seen` set resets on every
  // re-anchor, so a whole duplicated `seq 1..N` segment produced only the one BrokenLink and the
  // copies hid behind the restart. `(seq, line-hash)` pairs are tracked GLOBALLY: identical content
  // repeating under the same seq is named wherever it lands — while AM-9's healthy-successor case
  // (same seqs, DIFFERENT records) stays cascade-free.
  const seenPairs = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const line = stripEol(lines[i] ?? '');
    if (line.trim() === '') continue;
    examined += 1;
    const lineNo = i + 1;
    const parsed = parseLine(line);

    if (parsed === undefined) {
      defects.push({
        kind: 'TornTail',
        line: lineNo,
        detail:
          i === lastNonEmpty
            ? 'the last line is not a readable record — a partial write; the next append starts a marked segment'
            : 'unreadable record mid-file (a torn write that was later appended past) — its content is lost',
      });
      prevLine = line; // its raw bytes are still what the next record hashed
      continue;
    }

    if (parsed.seq === undefined || parsed.prevHash === undefined) {
      if (chainStarted) {
        defects.push({
          kind: 'BrokenLink',
          line: lineNo,
          detail: 'record has no chain fields but the chain already started — a hole in the chain',
        });
      } else {
        preChainPrefix += 1;
      }
      prevLine = line;
      continue;
    }

    chained += 1;
    const isSegmentStart = parsed.prevHash === EVENT_CHAIN_GENESIS_HASH && parsed.seq === 1;

    if (!chainStarted) {
      chainStarted = true;
      segment = 1;
      seen = new Set<number>();
      prevSeq = undefined;
      if (!isSegmentStart) {
        // The chain's very first link must anchor to genesis; anything else lost its predecessors.
        defects.push({
          kind: 'BrokenLink',
          line: lineNo,
          seq: parsed.seq,
          detail: `the first chained record does not start a segment (seq ${parsed.seq}, prevHash ${parsed.prevHash}) — earlier chained records were lost`,
        });
      } else if (parsed.reset) {
        // The chain's first link is itself a recorded discontinuity (the writer met a torn tail
        // before any chained record existed). Still a restart, still counted.
        resets += 1;
      }
    } else if (parsed.reset) {
      if (!isSegmentStart) {
        defects.push({
          kind: 'BrokenLink',
          line: lineNo,
          seq: parsed.seq,
          detail: 'record is marked chainReset but does not start a segment (needs seq 1 and the genesis prevHash)',
        });
      } else {
        // AM-4 (Codex QE HIGH-4): a marked restart does NOT absolve an unfinished claim. A rewrite
        // could emit `ledger, two records, RESET, an aggregate of 100` and have the 100 fall outside
        // every claim's segment — laundering events through a legal-looking discontinuity. Two
        // independent lines close it: this one, which names the restart as the cause, and the
        // end-of-file sweep below, which reports any claim left open however the segment ended.
        // Each has its own test; removing either one turns a report RED.
        for (const c of claims) {
          if (c.open && c.segment === segment && c.interruptedAtLine === null) c.interruptedAtLine = lineNo;
        }
        resets += 1;
        segment += 1;
        seen = new Set<number>();
        prevSeq = undefined;
      }
    } else {
      // A normal link: its prevHash must be the hash of the line above it.
      const expected = prevLine === undefined ? EVENT_CHAIN_GENESIS_HASH : chainHashOf(prevLine);
      const unmarkedRestart = isSegmentStart && parsed.prevHash !== expected;
      if (parsed.prevHash !== expected) {
        defects.push({
          kind: 'BrokenLink',
          line: lineNo,
          seq: parsed.seq,
          detail: unmarkedRestart
            ? 'segment restart without a chainReset marker — a break the writer did not record'
            : `prevHash ${parsed.prevHash} does not match the preceding line (${expected})`,
        });
      }
      if (unmarkedRestart) {
        // RE-ANCHOR. Observed live 2026-07-29: one incident (a single unchained record slipped in
        // from the hook's degraded fallback path) produced FIVE defects — the break itself plus a
        // DuplicateSeq for every healthy record that followed, because the new segment's seq 1,2,3
        // collided with the old segment's. A cascade buries the incident it is reporting. The break
        // is named once, above; from here the records are judged on their own segment.
        //
        // An unmarked restart interrupts open claims exactly as a marked one does. Honest scope of
        // that line: DETECTION already comes from the end-of-file sweep (a claim left open is
        // reported however the segment ended), so this is what makes the report name the CAUSE and
        // its line rather than saying only "the chain ends before it".
        for (const c of claims) {
          if (c.open && c.segment === segment && c.interruptedAtLine === null) c.interruptedAtLine = lineNo;
        }
        segment += 1;
        seen = new Set<number>();
        prevSeq = undefined;
      } else if (prevSeq !== undefined) {
        // ORDER IS LOAD-BEARING. Equality first: two writers that read the same tail both mint
        // `prevSeq + 1`, and calling that "non-monotonic" would bury the race under the wrong name.
        // Below-previous is the restart shape, which deserves the name that says a step went
        // backwards. A repeat that is neither adjacent nor below can only follow an earlier break.
        if (parsed.seq === prevSeq) {
          defects.push({
            kind: 'DuplicateSeq',
            line: lineNo,
            seq: parsed.seq,
            detail: `seq ${parsed.seq} repeats the previous record — a duplicated record, or two writers racing on the same tail`,
          });
        } else if (parsed.seq < prevSeq) {
          defects.push({
            kind: 'NonMonotonicSeq',
            line: lineNo,
            seq: parsed.seq,
            detail: `seq ${parsed.seq} follows ${prevSeq} without a recorded chainReset`,
          });
        } else if (seen.has(parsed.seq)) {
          defects.push({
            kind: 'DuplicateSeq',
            line: lineNo,
            seq: parsed.seq,
            detail: `seq ${parsed.seq} already appears in this segment`,
          });
        }
      }
    }

    const contentPair = `${parsed.seq}|${chainHashOf(line)}`;
    if (seenPairs.has(contentPair)) {
      defects.push({
        kind: 'DuplicateSeq',
        line: lineNo,
        seq: parsed.seq,
        detail: 'cross-segment duplicate content — the same seq with an identical record appeared earlier (a re-anchored restart does not absolve copies)',
      });
    }
    seenPairs.add(contentPair);
    seen.add(parsed.seq);
    prevSeq = parsed.seq;
    prevLine = line;

    // Accounting FIRST, then registration: a ledger never counts itself.
    for (const c of claims) {
      if (c.segment === segment && parsed.seq > c.fromSeq && parsed.seq <= c.throughSeq) {
        const w = weightOf(parsed.record);
        if (Number.isFinite(w) && w > 0) c.accounted += Math.floor(w);
      }
      if (c.open && c.segment === segment && parsed.seq >= c.throughSeq) c.open = false;
    }
    const ledger = readLedgerClaim(parsed.record, lineNo, segment, parsed.seq);
    if (ledger !== undefined) {
      if ('defect' in ledger) defects.push(ledger.defect);
      else claims.push(ledger.claim);
    }
  }

  for (const c of claims) {
    if (c.open && c.interruptedAtLine === null) c.interruptedAtLine = -1; // ran out of file
    if (c.interruptedAtLine !== null) {
      defects.push({
        kind: 'ClaimInterrupted',
        line: c.line,
        detail:
          c.interruptedAtLine === -1
            ? `the rewrite claimed to write through seq ${c.throughSeq}, but the chain ends before it — the evidence it accounts for is not in the file`
            : `the rewrite claimed to write through seq ${c.throughSeq}, but the segment restarted at line ${c.interruptedAtLine} first — a marked reset does not satisfy a claim`,
      });
      continue; // an unfinished claim has no arithmetic to check; reporting both would be noise
    }
    // AM-3: the raw equality, no clamps. `droppedEvents` is what the budget deliberately discarded,
    // so a rewrite must account for exactly what it did not drop.
    if (c.droppedEvents < 0 || c.droppedEvents > c.sourceEvents) {
      defects.push({
        kind: 'LedgerImbalance',
        line: c.line,
        detail: `droppedEvents ${c.droppedEvents} is outside [0, sourceEvents=${c.sourceEvents}] — a rewrite cannot discard events it never read`,
      });
      continue;
    }
    const total = c.accounted + c.droppedEvents;
    if (total > c.sourceEvents) {
      defects.push({
        kind: 'DoubleCounted',
        line: c.line,
        detail: `the rewrite accounts for ${c.accounted} event(s) + ${c.droppedEvents} dropped = ${total}, but measured ${c.sourceEvents} in its input — an event is counted more than once (the 2 → 4 → 6 class)`,
      });
    } else if (total < c.sourceEvents) {
      defects.push({
        kind: 'LedgerImbalance',
        line: c.line,
        detail: `the rewrite accounts for ${c.accounted} event(s) + ${c.droppedEvents} dropped = ${total}, but claimed ${c.sourceEvents} — records it carried are unaccounted for`,
      });
    }
  }

  defects.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));

  return {
    ok: defects.length === 0,
    lines: examined,
    chained,
    preChainPrefix,
    resets,
    lastSeq: prevSeq ?? null,
    defects,
    scope: EVENT_CHAIN_SCOPE,
  };
}

/**
 * Read a ledger line into a CLAIM, or into a named defect. Nothing in between.
 *
 * AM-5 (Codex QE HIGH-5): the previous version returned `undefined` for a malformed ledger, which
 * meant a hand-edited or truncated ledger DISABLED the accounting check in silence — the strongest
 * check in the module, switched off by damaging the very line that carries it. An invalid ledger in
 * the chained region is now `MalformedLedger`.
 *
 * AM-3 (Codex QE HIGH-3): NO CLAMPS HERE. `Math.max(0, source - dropped)` accepted `dropped > source`
 * and quietly turned an impossible claim into a satisfiable one. The verifier enforces the raw
 * equality; the clamp belongs in the WRITER, which must never emit a negative in the first place.
 */
function readLedgerClaim(
  record: Record<string, unknown>,
  line: number,
  segment: number,
  seq: number,
): { claim: LedgerClaim } | { defect: EventChainDefect } | undefined {
  if (record['kind'] !== EVENT_CHAIN_LEDGER_KIND) return undefined;
  const source = record['sourceEvents'];
  const dropped = record['droppedEvents'];
  const through = record['throughSeq'];
  const bad = (detail: string): { defect: EventChainDefect } => ({
    defect: { kind: 'MalformedLedger', line, seq, detail },
  });
  // Every numeric read from a log gets a finite/integer check: a `1e400` in a hand-edited file
  // parses to Infinity, and an Infinity ceiling silently disables the check it is supposed to be.
  if (typeof source !== 'number' || !Number.isSafeInteger(source) || source < 0) {
    return bad(`sourceEvents is not a non-negative integer (${describe(source)}) — the accounting claim is unusable`);
  }
  if (typeof through !== 'number' || !Number.isSafeInteger(through) || through < seq) {
    return bad(`throughSeq is not an integer >= this record's own seq (${describe(through)}) — the claim covers no readable range`);
  }
  if (dropped !== undefined && (typeof dropped !== 'number' || !Number.isSafeInteger(dropped))) {
    return bad(`droppedEvents is not an integer (${describe(dropped)})`);
  }
  const droppedEvents = typeof dropped === 'number' ? dropped : 0;
  return {
    claim: {
      line,
      segment,
      fromSeq: seq,
      throughSeq: through,
      sourceEvents: source,
      droppedEvents,
      accounted: 0,
      open: through > seq,
      interruptedAtLine: null,
    },
  };
}

function describe(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'non-finite';
  return value === undefined ? 'absent' : typeof value;
}

// ── Guarded rewrite (AM-1 · Codex QE CRITICAL-1) ────────────────────────────────────────────────

/**
 * What a rewriter must observe about the live file to know nobody appended behind its back.
 *
 * A read → compute → temp → rename rewrite has a window: an append landing after the read is
 * OVERWRITTEN by the rename, and — because it was never in the input the ledger measured — verify
 * reports the result as perfectly clean. Silent loss, invisible to the very check built to see it.
 */
export interface RewriteSnapshot {
  readonly bytes: number;
  readonly lines: number;
  readonly lastLine: string | undefined;
  /** FNV over the WHOLE text: bytes+lines+lastLine miss an equal-length edit to a non-tail line
   *  (Codex re-QE HIGH) — only a full-content hash makes "unchanged" mean unchanged. */
  readonly textHash: string;
}

export function rewriteSnapshot(text: string): RewriteSnapshot {
  const safe = typeof text === 'string' ? text : '';
  const lines = chainLinesOf(safe);
  return { bytes: safe.length, lines: lines.length, lastLine: lines[lines.length - 1], textHash: chainHashOf(safe) };
}

/** True when the live file is byte-for-byte where the snapshot left it. */
export function rewriteSnapshotUnchanged(a: RewriteSnapshot, b: RewriteSnapshot): boolean {
  return a.textHash === b.textHash && a.bytes === b.bytes && a.lines === b.lines && a.lastLine === b.lastLine;
}

export type GuardedRewriteStatus =
  /** The rewrite landed. */
  | 'rewritten'
  /** Another rewriter holds the lock — this one did nothing, which is correct. */
  | 'locked'
  /** Appends kept landing mid-rewrite; nothing was renamed. NO DATA WAS LOST. */
  | 'raced'
  /** The input's chain is already defective; laundering it into a clean rewrite is refused (AM-2). */
  | 'refused-dirty'
  /** The file could not be read. */
  | 'unreadable'
  /** The rewrite produced nothing usable; the file is left alone. */
  | 'empty';

export interface GuardedRewriteResult {
  readonly status: GuardedRewriteStatus;
  readonly attempts: number;
  /** Populated for `refused-dirty` so the caller can say WHY, loudly. */
  readonly defects: readonly EventChainDefect[];
}

export interface GuardedRewriteIo {
  /** Read the whole live log. `undefined` ⇒ unreadable. */
  readonly read: () => string | undefined;
  /** Write to a temp file and atomically rename it over the log. */
  readonly replace: (text: string) => void;
  /** Take the rewrite lock. `false` ⇒ someone else owns it. */
  readonly acquireLock: () => boolean;
  readonly releaseLock: () => void;
}

/** A rewrite proposal: the new text, plus whatever made the rewriter refuse. */
export interface RewriteProposal {
  readonly text: string;
  readonly refusedDirty?: boolean;
  readonly defects?: readonly EventChainDefect[];
}

export const DEFAULT_REWRITE_ATTEMPTS = 3;

/**
 * Run a whole-file rewrite so that a concurrent append can never be silently overwritten.
 *
 * Three guards, in order:
 *  1. an exclusive lock, so two rewriters cannot interleave at all;
 *  2. a re-read of the live file after computing the new text and BEFORE the rename — if it moved,
 *     the attempt is ABANDONED and retried against the newer file, so the append is folded in
 *     rather than lost;
 *  3. a bounded attempt count — a log under constant append is left alone, never truncated.
 *
 * HONEST RESIDUAL (state it, do not paper over it): the re-read narrows the window to the interval
 * between the final read and the `rename` syscall; it does not close it, because a conditional
 * rename is not an operation the filesystem offers. What it removes is the wide window (the whole
 * parse + compact + write) that made loss likely rather than rare.
 *
 * Pure orchestration — all IO is injected, which is what makes the race testable deterministically.
 */
export function guardedRewrite(
  io: GuardedRewriteIo,
  propose: (text: string) => RewriteProposal,
  opts: { readonly attempts?: number } = {},
): GuardedRewriteResult {
  const max =
    typeof opts.attempts === 'number' && Number.isFinite(opts.attempts) && opts.attempts >= 1
      ? Math.floor(opts.attempts)
      : DEFAULT_REWRITE_ATTEMPTS;
  if (!io.acquireLock()) return { status: 'locked', attempts: 0, defects: [] };
  let attempts = 0;
  try {
    for (let i = 0; i < max; i += 1) {
      attempts += 1;
      const before = io.read();
      if (typeof before !== 'string') return { status: 'unreadable', attempts, defects: [] };
      const snapshot = rewriteSnapshot(before);
      const proposal = propose(before);
      if (proposal.refusedDirty === true) {
        return { status: 'refused-dirty', attempts, defects: proposal.defects ?? [] };
      }
      if (typeof proposal.text !== 'string' || proposal.text === '') {
        return { status: 'empty', attempts, defects: [] };
      }
      const after = io.read();
      if (typeof after !== 'string') return { status: 'unreadable', attempts, defects: [] };
      if (!rewriteSnapshotUnchanged(snapshot, rewriteSnapshot(after))) continue; // someone appended
      io.replace(proposal.text);
      return { status: 'rewritten', attempts, defects: [] };
    }
    return { status: 'raced', attempts, defects: [] };
  } finally {
    io.releaseLock();
  }
}

/** Convenience wrapper for callers holding the whole file. */
export function verifyEventChainText(text: string, opts: VerifyEventChainOptions = {}): EventChainVerification {
  return verifyEventChain(chainLinesOf(typeof text === 'string' ? text : ''), opts);
}

/**
 * One line an operator can read. Always carries {@link EVENT_CHAIN_SCOPE} so no surface can print a
 * chain verdict without also printing what it does and does not mean.
 */
export function renderEventChainVerification(v: EventChainVerification, label: string): string {
  const head = v.ok ? 'chain OK' : `chain FAILED (${v.defects.length} defect(s))`;
  const parts = [
    `${label}: ${head}`,
    `${v.chained} chained`,
    `${v.preChainPrefix} pre-chain (uncovered)`,
  ];
  if (v.resets > 0) parts.push(`${v.resets} recorded restart(s)`);
  const kinds = [...new Set(v.defects.map((d) => d.kind))];
  if (kinds.length > 0) parts.push(kinds.join('/'));
  return `${parts.join(' · ')} — ${v.scope}`;
}

/**
 * How old a defect is relative to the log's CURRENT unbroken run.
 *
 * `historical` — the break happened, and an unbroken segment has run since. It cannot be un-happened
 * and it does not make today's records suspect. `live` — the break is inside the segment we are
 * still appending to, so records after it are the ones a verdict would rest on.
 */
/**
 * Where a defect sits relative to the log's current unbroken run.
 *
 * Deliberately NOT called "historical". A break followed by ONE record is not a healed log, and a
 * name that implies healing would let a caller skip the count — the reviewer's exact objection
 * (codex `gpt-5.6-sol`, 2026-08-24: a defect at line 2 of 3 was filed as historical because line 3
 * existed). These names state a position; the COUNT states how much evidence stands behind it, and
 * the count is what a caller must show.
 */
export type ChainDefectAge = 'before-run' | 'in-run';

/**
 * The line where the log's current unbroken run begins: one past the last defect, or 1 when there
 * are none.
 *
 * Why this exists: `dz doctor` reported "learning verdicts computed from this log are unsafe" for
 * both `.dz` event logs, flatly, for four weeks. MEASURED 2026-08-24 — every defect in both files
 * precedes an unbroken run of 998 of 1138 rows in one and 88 of 426 in the other. The verdict was
 * true of the file and false of those runs, and a permanent red about something nobody can change is
 * a red that stops being read.
 */
export function liveSegmentStart(verification: EventChainVerification): number {
  let last = 0;
  for (const d of verification.defects) if (d.line > last) last = d.line;
  return last + 1;
}

export interface ChainDefectAges {
  /** Defects that an unbroken run has followed. How MUCH of a run is `runRecords`, never implied. */
  readonly beforeRun: readonly EventChainDefect[];
  /** Defects with nothing sound after them — the strong verdict is earned here. */
  readonly inRun: readonly EventChainDefect[];
  /** First line of the current unbroken run. */
  readonly runFrom: number;
  /**
   * Records in that run. THE NUMBER IS THE EVIDENCE: 998 sound records after a break say something a
   * caller may relax on; 1 says almost nothing, and a caller that prints "sound" without printing
   * this number is overclaiming on its behalf.
   */
  readonly runRecords: number;
}

/**
 * Split defects by whether an unbroken run followed them, and say how long that run is.
 *
 * `runFrom` is computed from the defects themselves, so a defect can never classify itself: the run
 * only begins after the LAST of them. A log whose newest defect is its final record therefore has an
 * empty `beforeRun` and a `runRecords` of zero.
 */
export function classifyChainDefects(verification: EventChainVerification, totalRecords: number): ChainDefectAges {
  const runFrom = liveSegmentStart(verification);
  const runRecords = Math.max(0, totalRecords - runFrom + 1);
  const beforeRun = runRecords > 0 ? verification.defects : [];
  const inRun = runRecords > 0 ? [] : verification.defects;
  return { beforeRun, inRun, runFrom, runRecords };
}
