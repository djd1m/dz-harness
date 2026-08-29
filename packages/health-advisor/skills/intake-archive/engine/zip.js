'use strict';

// zip.js — a PURE, plan-only central-directory reader. It refuses; it never writes (INV-4, INV-5a).
//
// WHY A HAND-WRITTEN READER AT ALL (ADR-002): NFR-4 forbids a new runtime dependency, and every
// general-purpose unzip is a much larger attack surface than the subset this feature needs — stored
// and deflate, regular files and directories, no encryption, no zip64. The cost is that this file is
// itself an attack surface, which is why it is (a) pure, (b) budget-bounded twice, (c) mutation-gated.
//
// THE CENTRAL DIRECTORY IS THE SOLE AUTHORITY on what an archive contains. The local file header is
// read for ONE thing — where an entry's compressed bytes start — and any disagreement with the
// central directory about a name or a size is a refusal (`HeaderNameMismatchError`), never a merge.
// A reader that prefers whichever header is convenient is a reader an attacker gets to choose for.
//
// EVERY REFUSAL IS NAMED, AND `LimitExceededError` NAMES WHICH LIMIT. "too big" sends an operator
// guessing; `limit: 'max_entry_bytes', actual: …, cap: …` sends them to the one number to change.
//
// MEMORY MODEL, STATED RATHER THAN DISCOVERED (P1-2): the verified blob is read from disk into ONE
// in-memory buffer. That is in-memory BY DESIGN — the alternative is a streaming-unzip dependency,
// which NFR-4 forbids — so peak RSS tracks archive size. That consequence is exactly why
// `max_download_bytes` defaults to 512 MiB and the 2 GiB ceiling needs an explicit `--limits`
// override (registry/limits.json, limits.js).
//
// IMPORT PIN: node:fs, node:zlib, node:crypto and the two local modules. Nothing else, ever — this
// file is on the intake egress surface and a network-capable import here is a scan violation.

const fs = require('node:fs');
const zlib = require('node:zlib');

const { assertVerifiedArchive } = require('./digest.js');
const {
  UnsupportedArchiveFormatError,
  MalformedArchiveError,
  PathEscapeError,
  UnsafeEntryTypeError,
  DuplicateEntryNameError,
  HeaderNameMismatchError,
  LimitExceededError,
} = require('./errors.js');

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const EOCD_MIN_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const CENTRAL_FIXED_BYTES = 46;
const LOCAL_FIXED_BYTES = 30;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

// UNIX file-type bits, as they appear in the high 16 bits of the central directory's external
// attributes when the entry was created on a unix host.
const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

const GP_ENCRYPTED = 0x0001;      // general-purpose flag bit 0
const GP_DATA_DESCRIPTOR = 0x0008; // bit 3 — local header sizes are zero and live after the data

// A NUL byte is BUILT, never spelled as a raw byte in this source file: a control character
// embedded in a guard's own text is invisible in every diff, grep and review that inspects it.
const NUL = String.fromCharCode(0);

// ── entry-name policy ────────────────────────────────────────────────────────────────────────────
//
// POSIX, relative, no traversal, no device prefix, no NUL, no empty or dot segments. Refusing the
// WHOLE hostile shape at PLAN time — before a single byte is written anywhere — is what makes
// "a failed intake is a no-op" cheap to guarantee.
function classifyName(rawName, limits) {
  const nameBytes = Buffer.byteLength(rawName, 'utf8');
  if (nameBytes === 0) {
    return { refusal: new PathEscapeError('an archive entry has an EMPTY name.', { reason: 'empty_name', entry: rawName }) };
  }
  if (nameBytes > limits.max_name_bytes) {
    return {
      refusal: new LimitExceededError(
        `entry name is ${nameBytes} bytes, over max_name_bytes=${limits.max_name_bytes}: ${JSON.stringify(rawName.slice(0, 80))}…`,
        { reason: 'max_name_bytes', limit: 'max_name_bytes', actual: nameBytes, cap: limits.max_name_bytes, entry: rawName }
      ),
    };
  }
  if (rawName.includes(NUL)) {
    return { refusal: new PathEscapeError(`entry name contains a NUL byte: ${JSON.stringify(rawName)}`, { reason: 'nul_byte', entry: rawName }) };
  }
  if (rawName.startsWith('/')) {
    return { refusal: new PathEscapeError(`entry name is absolute: ${JSON.stringify(rawName)}`, { reason: 'absolute_path', entry: rawName }) };
  }
  if (/^[A-Za-z]:/.test(rawName)) {
    return { refusal: new PathEscapeError(`entry name carries a drive letter: ${JSON.stringify(rawName)}`, { reason: 'drive_letter', entry: rawName }) };
  }
  // ORDER: the device-prefix checks run BEFORE the separator check, because `C:\evil` carries both and
  // "carries a drive letter" is the more specific — and more actionable — diagnosis of the two.
  if (rawName.includes('\\')) {
    // A backslash is a SEPARATOR on the platform that wrote it and an ordinary filename character
    // here — so `a\b` would land as one file named `a\b` on Linux and two levels deep on Windows.
    // One archive with two meanings is not something to normalise; it is something to refuse.
    return { refusal: new PathEscapeError(`entry name contains a backslash: ${JSON.stringify(rawName)}`, { reason: 'backslash_separator', entry: rawName }) };
  }

  const isDir = rawName.endsWith('/');
  const segments = (isDir ? rawName.slice(0, -1) : rawName).split('/');
  if (segments.length === 0) {
    return { refusal: new PathEscapeError(`entry name has no segments: ${JSON.stringify(rawName)}`, { reason: 'empty_name', entry: rawName }) };
  }
  for (const seg of segments) {
    if (seg === '') {
      return { refusal: new PathEscapeError(`entry name has an empty path segment: ${JSON.stringify(rawName)}`, { reason: 'empty_segment', entry: rawName }) };
    }
    if (seg === '..') {
      return { refusal: new PathEscapeError(`entry name escapes its destination: ${JSON.stringify(rawName)}`, { reason: 'parent_traversal', entry: rawName }) };
    }
    if (seg === '.') {
      return { refusal: new PathEscapeError(`entry name has a "." segment: ${JSON.stringify(rawName)}`, { reason: 'dot_segment', entry: rawName }) };
    }
    // F7 — TRAILING DOTS AND SPACES ARE REFUSED, same reasoning as the backslash above: Windows
    // strips them on creation, so `trail. ` is one name in the archive and a DIFFERENT name
    // (`trail`) on an ingesting laptop — one archive with two platform meanings (ADR-002 D5), and a
    // catalog row that can never re-verify against the file actually on disk. Refused, never
    // normalised: a normalisation is a second name policy an attacker gets to aim at.
    if (/[. ]$/.test(seg)) {
      return {
        refusal: new PathEscapeError(
          `entry name segment ${JSON.stringify(seg)} ends with a dot or space, which Windows strips on ` +
          `creation — the extracted name would differ by platform: ${JSON.stringify(rawName)}`,
          { reason: 'trailing_dot_or_space', entry: rawName }
        ),
      };
    }
  }
  if (segments.length > limits.max_path_depth) {
    return {
      refusal: new LimitExceededError(
        `entry path is ${segments.length} segments deep, over max_path_depth=${limits.max_path_depth}: ${JSON.stringify(rawName)}`,
        { reason: 'max_path_depth', limit: 'max_path_depth', actual: segments.length, cap: limits.max_path_depth, entry: rawName }
      ),
    };
  }
  return { path: segments.join('/'), isDir, depth: segments.length };
}

function findEocd(buf) {
  const from = Math.max(0, buf.length - (EOCD_MIN_BYTES + MAX_COMMENT_BYTES));
  for (let i = buf.length - EOCD_MIN_BYTES; i >= from; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/**
 * readArchive(verified, limits) -> ExtractionPlan
 *
 * ExtractionPlan: `{ archiveId, buffer, entries[], totals }` where every entry is
 * `{ path, kind: 'file'|'dir', method, declaredBytes, compressedBytes, crc32, dataOffset, mode }`.
 * A plan is a DECISION, not an effect: extract.js turns it into writes, and nothing here can.
 */
function readArchive(verified, limits) {
  assertVerifiedArchive(verified, 'zip.readArchive');
  if (limits === null || typeof limits !== 'object') {
    throw new TypeError('zip.readArchive(verified, limits): limits is required — an unbounded reader is not a hardened one');
  }

  // F3 BELT — THE READ ITSELF CAN FAIL, AND A FAILURE HERE MUST STAY INSIDE THE CLOSED ENUM. The
  // common trigger (an oversized local file) is refused by NAME before this line ever runs (AM-10's
  // stat-first check in run.js), but Node's Buffer ceiling (~2 GiB, ERR_FS_FILE_TOO_LARGE), ENOMEM,
  // and a blob that vanished between verify() and here are all still reachable in principle — and an
  // unguarded throw escapes as a raw RangeError stack, which is exactly the "loud and anonymous"
  // failure driver D3 forbids (MEASURED in the QE report's F3 reproducer). Size/memory-class
  // failures map to LimitExceededError; anything else is MalformedArchiveError — sixteen classes,
  // no seventeenth.
  let buf;
  try {
    buf = fs.readFileSync(verified.blobPath);
  } catch (err) {
    const code = err && err.code;
    if (err instanceof RangeError || code === 'ERR_FS_FILE_TOO_LARGE' || code === 'ENOMEM' || code === 'ERR_OUT_OF_MEMORY') {
      throw new LimitExceededError(
        `${verified.blobPath} cannot be buffered for parsing (${code || err.message}): the archive is over ` +
        'what this process can hold in one buffer. The zip reader is in-memory by design (P1-2) — re-pack ' +
        'the archive under max_download_bytes. Nothing was parsed or written.',
        { reason: 'max_download_bytes', limit: 'max_download_bytes', actual: null, cap: null }
      );
    }
    throw new MalformedArchiveError(
      `${verified.blobPath} could not be read for parsing (${code || err.message}). Nothing was parsed or written.`,
      { reason: 'blob_unreadable' }
    );
  }

  const eocd = findEocd(buf);
  if (eocd === -1) {
    throw new UnsupportedArchiveFormatError(
      `${verified.blobPath} has no zip end-of-central-directory record — it is not a zip archive this ` +
      'reader can read. Only zip (stored/deflate) is supported; tar, 7z, rar and encrypted zips are ' +
      'refused by name rather than half-parsed.',
      { reason: 'no_end_of_central_directory' }
    );
  }

  // ZIP64 IS REFUSED, NOT GUESSED AT. The locator sits immediately before the EOCD when present, and
  // the 0xFFFF/0xFFFFFFFF sentinels in the EOCD mean "the real value is in the zip64 record". Reading
  // the sentinel as a literal count/offset is how a zip64 archive becomes a malformed parse.
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_EOCD64_LOCATOR) {
    throw new UnsupportedArchiveFormatError(
      `${verified.blobPath} carries a zip64 end-of-central-directory locator. zip64 is deliberately not ` +
      'implemented (ADR-002 scope); re-pack the archive as a plain zip under the size budgets.',
      { reason: 'zip64_locator' }
    );
  }

  const totalEntries = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new UnsupportedArchiveFormatError(
      `${verified.blobPath} uses zip64 sentinel values in its end-of-central-directory record.`,
      { reason: 'zip64_sentinel' }
    );
  }
  if (totalEntries > limits.max_entries) {
    throw new LimitExceededError(
      `archive declares ${totalEntries} entries, over max_entries=${limits.max_entries}.`,
      { reason: 'max_entries', limit: 'max_entries', actual: totalEntries, cap: limits.max_entries }
    );
  }
  if (centralOffset + centralSize > buf.length) {
    throw new MalformedArchiveError(
      `${verified.blobPath}: the central directory (offset ${centralOffset}, size ${centralSize}) runs past ` +
      `the end of the ${buf.length}-byte archive.`,
      { reason: 'central_directory_out_of_range' }
    );
  }

  const entries = [];
  const seen = new Map();
  // F7 — a SECOND duplicate detector, keyed on the CASE-FOLDED, Windows-normalised name (lowercase,
  // trailing dots/spaces stripped per segment). `labs/report.pdf` and `labs/REPORT.PDF` are two rows
  // to this reader but ONE file on the case-insensitive filesystems macOS and Windows default to —
  // so one of the two catalog rows could never re-verify there, and a corpus ingested on Linux would
  // report drift that is not drift (ADR-002 D5). The check runs over every PREFIX of every entry
  // path, not just the full name: `Labs/a.pdf` + `labs/b.pdf` is two directories on Linux and one on
  // macOS, which is exactly the "same archive, two extraction results" D5 forbids. One folded prefix
  // with TWO raw spellings is the refusal; the same spelling repeated (every archive's normal shape)
  // is not. Exact full-path duplicates are caught by `seen` above. Folding is ASCII-simple
  // `toLowerCase()` by intent: matching each host's exact collation table is not a promise a
  // deterministic reader can keep, and folding MORE aggressively than any real filesystem only ever
  // refuses more, never accepts more.
  const seenFolded = new Map(); // folded prefix -> { raw prefix, first entry index }
  const foldSeg = (seg) => seg.replace(/[. ]+$/, '').toLowerCase();
  let declaredTotal = 0;
  let compressedTotal = 0;
  let cursor = centralOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + CENTRAL_FIXED_BYTES > buf.length) {
      throw new MalformedArchiveError(
        `${verified.blobPath}: central directory record ${i} is truncated.`,
        { reason: 'central_record_truncated', index: i }
      );
    }
    if (buf.readUInt32LE(cursor) !== SIG_CENTRAL) {
      throw new MalformedArchiveError(
        `${verified.blobPath}: expected a central-directory signature at offset ${cursor} for record ${i}.`,
        { reason: 'central_signature', index: i }
      );
    }
    const gpFlags = buf.readUInt16LE(cursor + 8);
    const method = buf.readUInt16LE(cursor + 10);
    const crc32 = buf.readUInt32LE(cursor + 16);
    const compressedBytes = buf.readUInt32LE(cursor + 20);
    const declaredBytes = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const externalAttrs = buf.readUInt32LE(cursor + 38);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const nameStart = cursor + CENTRAL_FIXED_BYTES;
    const nameEnd = nameStart + nameLen;
    if (nameEnd + extraLen + commentLen > buf.length) {
      throw new MalformedArchiveError(
        `${verified.blobPath}: central directory record ${i} declares a name/extra/comment run past the archive end.`,
        { reason: 'central_record_truncated', index: i }
      );
    }
    const rawName = buf.subarray(nameStart, nameEnd).toString('utf8');

    if ((gpFlags & GP_ENCRYPTED) !== 0) {
      throw new UnsupportedArchiveFormatError(
        `entry ${JSON.stringify(rawName)} is ENCRYPTED (general-purpose flag bit 0). Encrypted archives are ` +
        'refused: this reader has no password path, and half-reading an encrypted entry would produce ' +
        'garbage bytes indistinguishable from a real document.',
        { reason: 'encrypted_entry', entry: rawName }
      );
    }
    if (declaredBytes === 0xffffffff || compressedBytes === 0xffffffff) {
      throw new UnsupportedArchiveFormatError(
        `entry ${JSON.stringify(rawName)} uses zip64 size sentinels (>= 4 GiB).`,
        { reason: 'zip64_entry_size', entry: rawName }
      );
    }

    const named = classifyName(rawName, limits);
    if (named.refusal) throw named.refusal;

    // ENTRY TYPE. Only regular files and directories are ingestable. A symlink entry is the classic
    // extraction escape (a link to /etc, then a write "inside" the destination that lands outside it),
    // and a device/fifo/socket entry in a patient's document archive has no benign reading at all.
    const unixMode = (externalAttrs >>> 16) & 0xffff;
    const fileType = unixMode & S_IFMT;
    if (fileType === S_IFLNK) {
      throw new UnsafeEntryTypeError(
        `entry ${JSON.stringify(rawName)} is a SYMLINK. Symlink entries are refused: a link is an instruction ` +
        'about where a later write should land, and honouring it is how an extraction escapes its own ' +
        'destination. Nothing was written.',
        { reason: 'symlink', entry: rawName }
      );
    }
    if (fileType !== 0 && fileType !== S_IFREG && fileType !== S_IFDIR) {
      throw new UnsafeEntryTypeError(
        `entry ${JSON.stringify(rawName)} is not a regular file or directory (unix mode 0o${unixMode.toString(8)}).`,
        { reason: 'special_file', entry: rawName, unixMode }
      );
    }

    const isDir = named.isDir || fileType === S_IFDIR;
    if (seen.has(named.path)) {
      throw new DuplicateEntryNameError(
        `entries ${seen.get(named.path)} and ${i} both name ${JSON.stringify(named.path)}. Which one is the ` +
        'primary source is not a question this tool guesses at.',
        { reason: 'duplicate_name', entry: named.path }
      );
    }
    seen.set(named.path, i);
    {
      const segs = named.path.split('/');
      let rawPrefix = '';
      let foldedPrefix = '';
      for (let s = 0; s < segs.length; s += 1) {
        rawPrefix = s === 0 ? segs[s] : `${rawPrefix}/${segs[s]}`;
        foldedPrefix = s === 0 ? foldSeg(segs[s]) : `${foldedPrefix}/${foldSeg(segs[s])}`;
        const prior = seenFolded.get(foldedPrefix);
        if (prior === undefined) {
          seenFolded.set(foldedPrefix, { raw: rawPrefix, index: i });
        } else if (prior.raw !== rawPrefix) {
          throw new DuplicateEntryNameError(
            `entries ${JSON.stringify(prior.raw)} (record ${prior.index}) and ${JSON.stringify(rawPrefix)} ` +
            `(record ${i}) fold to one name on a case-insensitive filesystem. macOS and Windows would extract ` +
            'them onto one path, and a catalog row could then never re-verify there — which spelling wins is ' +
            'not a question this tool guesses at (ADR-002 D5).',
            { reason: 'case_fold_collision', entry: named.path, collidesWith: prior.raw }
          );
        }
      }
    }

    if (!isDir) {
      if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
        throw new UnsupportedArchiveFormatError(
          `entry ${JSON.stringify(named.path)} uses compression method ${method}; only stored (0) and deflate (8) ` +
          'are implemented.',
          { reason: `unsupported_compression_method_${method}`, entry: named.path }
        );
      }
      if (declaredBytes > limits.max_entry_bytes) {
        throw new LimitExceededError(
          `entry ${JSON.stringify(named.path)} declares ${declaredBytes} bytes, over max_entry_bytes=${limits.max_entry_bytes}.`,
          { reason: 'max_entry_bytes', limit: 'max_entry_bytes', actual: declaredBytes, cap: limits.max_entry_bytes, entry: named.path }
        );
      }
      declaredTotal += declaredBytes;
      compressedTotal += compressedBytes;
      if (declaredTotal > limits.max_total_bytes) {
        throw new LimitExceededError(
          `archive declares ${declaredTotal} uncompressed bytes so far, over max_total_bytes=${limits.max_total_bytes}.`,
          { reason: 'max_total_bytes', limit: 'max_total_bytes', actual: declaredTotal, cap: limits.max_total_bytes, entry: named.path }
        );
      }
      // RATIO BUDGETS — the zip-bomb shape a size cap alone misses: a 1 KB archive that declares
      // 100 MB is refused here rather than at the 128 MiB entry cap, and a compressed-size of zero
      // (which no honest deflate stream has) is treated as the worst case rather than as a division
      // by zero that yields Infinity and slips past a `>` comparison.
      if (compressedBytes > 0) {
        const ratio = declaredBytes / compressedBytes;
        if (ratio > limits.max_entry_ratio) {
          throw new LimitExceededError(
            `entry ${JSON.stringify(named.path)} has an expansion ratio of ${ratio.toFixed(1)}:1 ` +
            `(${compressedBytes} -> ${declaredBytes}), over max_entry_ratio=${limits.max_entry_ratio}.`,
            { reason: 'max_entry_ratio', limit: 'max_entry_ratio', actual: Math.round(ratio), cap: limits.max_entry_ratio, entry: named.path }
          );
        }
      } else if (declaredBytes > 0) {
        throw new MalformedArchiveError(
          `entry ${JSON.stringify(named.path)} declares ${declaredBytes} uncompressed bytes from 0 compressed bytes.`,
          { reason: 'zero_compressed_nonzero_declared', entry: named.path }
        );
      }
    }

    entries.push({
      index: i,
      path: named.path,
      kind: isDir ? 'dir' : 'file',
      method,
      declaredBytes: isDir ? 0 : declaredBytes,
      compressedBytes: isDir ? 0 : compressedBytes,
      crc32,
      localOffset,
      unixMode,
      gpFlags,
      depth: named.depth,
    });

    cursor = nameEnd + extraLen + commentLen;
  }

  if (compressedTotal > 0) {
    const totalRatio = declaredTotal / compressedTotal;
    if (totalRatio > limits.max_total_ratio) {
      throw new LimitExceededError(
        `archive expands ${compressedTotal} compressed bytes into ${declaredTotal} declared bytes ` +
        `(${totalRatio.toFixed(1)}:1), over max_total_ratio=${limits.max_total_ratio}.`,
        { reason: 'max_total_ratio', limit: 'max_total_ratio', actual: Math.round(totalRatio), cap: limits.max_total_ratio }
      );
    }
  }

  // LOCAL HEADERS, read ONLY for the data offset — and cross-checked against the central directory
  // while we are there. This is the pass that turns "the central directory is the authority" from a
  // sentence in a comment into a refusal an attacker cannot route around.
  for (const entry of entries) {
    const off = entry.localOffset;
    if (off + LOCAL_FIXED_BYTES > buf.length || buf.readUInt32LE(off) !== SIG_LOCAL) {
      throw new MalformedArchiveError(
        `entry ${JSON.stringify(entry.path)}: no local file header at offset ${off}.`,
        { reason: 'local_signature', entry: entry.path }
      );
    }
    const localFlags = buf.readUInt16LE(off + 6);
    const localMethod = buf.readUInt16LE(off + 8);
    const localCompressed = buf.readUInt32LE(off + 18);
    const localDeclared = buf.readUInt32LE(off + 22);
    const localNameLen = buf.readUInt16LE(off + 26);
    const localExtraLen = buf.readUInt16LE(off + 28);
    const localNameStart = off + LOCAL_FIXED_BYTES;
    const localName = buf.subarray(localNameStart, localNameStart + localNameLen).toString('utf8');
    const centralRawName = entry.kind === 'dir' && !entry.path.endsWith('/') ? `${entry.path}/` : entry.path;
    if (localName !== centralRawName) {
      throw new HeaderNameMismatchError(
        `entry ${entry.index}: the local file header names ${JSON.stringify(localName)} while the central ` +
        `directory names ${JSON.stringify(centralRawName)}. The central directory is the sole authority and a ` +
        'disagreement is a refusal, never a merge — two names for one blob of bytes is how an ' +
        'extractor is made to write a file the index does not describe.',
        { reason: 'name_disagreement', entry: entry.path, localName, centralName: centralRawName }
      );
    }
    // Sizes: a streamed entry (bit 3) legitimately carries zeros in the local header, so only a
    // NON-ZERO local size may be compared. This distinction is the difference between a real
    // discrimination and a false alarm on every archive a streaming writer produced.
    const streamed = (localFlags & GP_DATA_DESCRIPTOR) !== 0;
    if (!streamed && entry.kind === 'file') {
      if (localCompressed !== entry.compressedBytes || localDeclared !== entry.declaredBytes) {
        throw new HeaderNameMismatchError(
          `entry ${JSON.stringify(entry.path)}: the local file header declares ${localCompressed}/${localDeclared} ` +
          `(compressed/uncompressed) while the central directory declares ${entry.compressedBytes}/${entry.declaredBytes}.`,
          { reason: 'size_disagreement', entry: entry.path }
        );
      }
      if (localMethod !== entry.method) {
        throw new HeaderNameMismatchError(
          `entry ${JSON.stringify(entry.path)}: the local file header declares compression method ${localMethod} ` +
          `while the central directory declares ${entry.method}.`,
          { reason: 'method_disagreement', entry: entry.path }
        );
      }
    }
    entry.dataOffset = localNameStart + localNameLen + localExtraLen;
    if (entry.dataOffset + entry.compressedBytes > buf.length) {
      throw new MalformedArchiveError(
        `entry ${JSON.stringify(entry.path)}: its ${entry.compressedBytes} compressed bytes at offset ` +
        `${entry.dataOffset} run past the end of the ${buf.length}-byte archive.`,
        { reason: 'entry_data_out_of_range', entry: entry.path }
      );
    }
  }

  return Object.freeze({
    archiveId: verified.sha256hex,
    blobPath: verified.blobPath,
    buffer: buf,
    entries: Object.freeze(entries),
    totals: Object.freeze({
      entries: entries.length,
      files: entries.filter((e) => e.kind === 'file').length,
      dirs: entries.filter((e) => e.kind === 'dir').length,
      declaredBytes: declaredTotal,
      compressedBytes: compressedTotal,
    }),
  });
}

/** Exported for extract.js: one decompressor, one place the actual-byte cap is applied. */
function inflateEntry(plan, entry, maxOutputLength) {
  const raw = plan.buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedBytes);
  if (entry.method === METHOD_STORED) {
    if (raw.length > maxOutputLength) {
      throw new LimitExceededError(
        `entry ${JSON.stringify(entry.path)} stores ${raw.length} actual bytes, over the remaining budget ${maxOutputLength}.`,
        { reason: 'actual_bytes', limit: 'max_total_bytes', actual: raw.length, cap: maxOutputLength, entry: entry.path }
      );
    }
    return Buffer.from(raw);
  }
  try {
    // INV-5(b): `maxOutputLength` is the ACTUAL-byte cap. A central directory that UNDER-declares its
    // expansion sails through the plan-phase budgets — that archive is exactly the one this parameter
    // exists for, and it is the case test/intake-zip-hardening.test.js drives.
    return zlib.inflateRawSync(raw, { maxOutputLength });
  } catch (err) {
    if (err && (err.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength/i.test(String(err.message)))) {
      throw new LimitExceededError(
        `entry ${JSON.stringify(entry.path)} inflated past the ACTUAL-byte budget of ${maxOutputLength} bytes ` +
        `while its central directory declared only ${entry.declaredBytes}. A declared size is a claim; this ` +
        'cap is the enforcement (INV-5b).',
        { reason: 'actual_bytes', limit: 'max_total_bytes', actual: null, cap: maxOutputLength, entry: entry.path }
      );
    }
    throw new MalformedArchiveError(
      `entry ${JSON.stringify(entry.path)} could not be inflated: ${err.message}`,
      { reason: 'inflate_failed', entry: entry.path }
    );
  }
}

// CRC-32 (IEEE 802.3), table built once. The archive's own integrity claim per entry: if the bytes we
// inflated do not match the CRC the central directory recorded, the archive is malformed — and saying
// so is much better than committing a silently corrupted lab report into a patient's raw zone.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

module.exports = {
  readArchive,
  inflateEntry,
  crc32,
  classifyName,
  METHOD_STORED,
  METHOD_DEFLATE,
};
