#!/usr/bin/env python3
"""Read one closed canonical book_knowledge slice without changing it."""
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

COLS = ('book', 'ku_id', 'corpus_version', 'type', 'name', 'problem',
        'content', 'chapter', 'pages', 'metadata')
CELL_LIMIT = 1024 * 1024
RESULT_LIMIT = 16 * 1024 * 1024


def fail(message):
    raise ValueError(message)


def main(path):
    p = Path(path)
    if p.is_symlink():
        fail('SQLite symlink unsupported; use a closed standalone file')
    for base in {str(p), str(p.resolve())}:
        for suffix in ('-wal', '-shm', '-journal'):
            if os.path.lexists(base + suffix):
                fail('active SQLite sidecar ' + suffix + '; finish export/checkpoint first')
    if not p.is_file():
        fail('SQLite file unavailable')
    with p.open('rb') as handle:
        if handle.read(16) != b'SQLite format 3\x00':
            fail('invalid SQLite header')
    uri = p.resolve().as_uri() + '?mode=ro&immutable=1'
    con = sqlite3.connect(uri, uri=True)
    try:
        schema = con.execute('PRAGMA table_info(book_knowledge)').fetchall()
        if not schema or tuple(row[1] for row in schema) != COLS:
            fail('book_knowledge canonical schema required')
        # FTS5 is required by canonical producer. A plain table with matching columns
        # would otherwise look plausible while failing the accepted slice contract.
        ddl = con.execute("SELECT sql FROM sqlite_master WHERE name='book_knowledge' AND type='table'").fetchone()
        if not ddl or not re.search(r'^\s*CREATE\s+VIRTUAL\s+TABLE\b.*\bUSING\s+fts5\s*\(', ddl[0], re.I | re.S):
            fail('book_knowledge FTS5 schema required')
        selectors = ', '.join('typeof("' + c + '"), length(CAST("' + c + '" AS BLOB))' for c in COLS)
        sizes = con.execute('SELECT rowid, ' + selectors + ' FROM book_knowledge ORDER BY rowid')
        values = con.cursor()
        segments = []
        count = 0
        retained = 256

        def append(rowid, ku_id, field, value):
            nonlocal retained
            item = {'rowid': rowid, 'ku_id': ku_id, 'field': field, 'text': value}
            n = len(json.dumps(item, ensure_ascii=False).encode('utf-8')) + 2
            if retained + n > RESULT_LIMIT:
                fail('SQLite segment result exceeds 16 MiB')
            retained += n
            segments.append(item)

        for info in sizes:
            rowid = info[0]
            for i, col in enumerate(COLS):
                kind, size = info[1 + 2*i:3 + 2*i]
                if kind not in ('text', 'null'):
                    fail(f'rowid {rowid} {col}: invalid SQL type {kind}')
                if kind == 'null' and col not in ('chapter', 'pages', 'metadata'):
                    fail(f'rowid {rowid} {col}: NULL required value')
                if size is not None and size > CELL_LIMIT:
                    fail(f'rowid {rowid} {col}: SQL cell exceeds 1 MiB')
            row = values.execute('SELECT ' + ', '.join('"' + c + '"' for c in COLS) +
                                 ' FROM book_knowledge WHERE rowid=?', (rowid,)).fetchone()
            if row is None:
                fail(f'rowid {rowid}: disappeared during read; use a closed export')
            ku_id = row[1]
            if not ku_id:
                fail(f'rowid {rowid}: empty ku_id')
            count += 1
            for col, value in zip(COLS, row):
                if value is None:
                    continue
                if col in ('pages', 'metadata'):
                    try:
                        obj = json.loads(value, parse_constant=lambda x: fail('non-JSON constant ' + x))
                    except (ValueError, RecursionError) as exc:
                        fail(f'rowid {rowid} {col}: invalid JSON: {exc}')
                    if col == 'metadata' and not isinstance(obj, dict):
                        fail(f'rowid {rowid} metadata: expected JSON object')
                    if col == 'pages' and (not isinstance(obj, list) or
                        any(isinstance(n, bool) or not isinstance(n, (int, float)) for n in obj)):
                        fail(f'rowid {rowid} pages: expected JSON number array')
                    nodes = 0
                    stack = [(obj, col, 0)]
                    while stack:
                        item, field, depth = stack.pop()
                        nodes += 1
                        if depth > 32 or nodes > 100000:
                            fail(f'rowid {rowid} {col}: JSON depth/node limit')
                        if isinstance(item, dict):
                            for key, child in reversed(list(item.items())):
                                append(rowid, ku_id, field + '.key', key)
                                stack.append((child, field + '.' + key, depth + 1))
                        elif isinstance(item, list):
                            for index in range(len(item) - 1, -1, -1):
                                stack.append((item[index], field + '[' + str(index) + ']', depth + 1))
                        elif isinstance(item, str):
                            append(rowid, ku_id, field, item)
                        elif item is not None and not isinstance(item, (bool, int, float)):
                            fail(f'rowid {rowid} {col}: invalid JSON value')
                else:
                    append(rowid, ku_id, col, value)
        if count == 0:
            fail('book_knowledge has zero KUs')
        result = json.dumps({'schema': 'book-sqlite-segments-1', 'kus': count,
                             'segments': segments}, ensure_ascii=False)
        if len(result.encode('utf-8')) + 1 > RESULT_LIMIT:
            fail('SQLite segment result exceeds 16 MiB')
        print(result)
    finally:
        con.close()


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            fail('expected one SQLite path')
        main(sys.argv[1])
    except (OSError, sqlite3.Error, ValueError, TypeError) as exc:
        print('shingling-sqlite: ' + str(exc), file=sys.stderr)
        sys.exit(2)
