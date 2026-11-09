"""Private-copy acceptance. Never print document text, paths, IDs or query terms.

Run with HEALTH_WORKSPACE pointing to a read-only mounted COPY, offline.
Requires three distinct, current, indexed sources and a nonempty valid manifest.
This is a lookup integrity check, not a semantic relevance benchmark.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import sys

PLUGIN = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('health_plugin', PLUGIN / 'health_plugin.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def check():
    tools = m.HealthTools.configured()
    if not tools.call('validate', {}).get('ok'):
        raise RuntimeError('manifest_check_failed')
    rows = tools.catalog()
    if not rows:
        raise RuntimeError('manifest_empty')
    result = tools.call('source_get', {'entry_id': rows[0]['entry_id']})
    if not result.get('ok') or result.get('integrity') != 'manifest_match':
        raise RuntimeError('source_check_failed')
    # This is an operator-prepared SQLite Backup API copy, never an active live DB.
    # immutable=1 would ignore live WAL: refuse it rather than silently using older data.
    db = tools.workspace / '.health-brain/.dz/memory/patterns.sqlite'
    if Path(str(db) + '-wal').exists():
        raise RuntimeError('requires_checkpointed_test_copy')
    seen = set()
    with sqlite3.connect(db.as_uri() + '?mode=ro&immutable=1', uri=True) as conn:
        for (text,) in conn.execute('SELECT text FROM memory_records LIMIT 1000'):
            header = dict(re.findall(r'(\w+)=([^\s]+)', text.split('\n')[0]))
            if not {'doc_id', 'doc_path', 'doc_sha256'} <= header.keys():
                continue
            path = header['doc_path']
            if path in seen:
                continue
            try:
                content = tools.read(path)
            except (OSError, m.Refusal):
                continue
            if hashlib.sha256(content).hexdigest() != header['doc_sha256']:
                continue
            result = tools.call('search', {'query': header['doc_id'], 'limit': 10})
            if not result.get('ok') or not any(h['path'] == path for h in result.get('hits', [])):
                raise RuntimeError('known_source_search_failed')
            seen.add(path)
            if len(seen) == 3:
                break
    if len(seen) != 3:
        raise RuntimeError('insufficient_distinct_current_sources')
    return {'ok': True, 'manifest': 'passed', 'source_get': 'passed',
            'distinct_known_sources': len(seen), 'coverage': 'lookup_integrity_only'}


if __name__ == '__main__':
    try:
        print(json.dumps(check()))
    except Exception:
        # No exception text/traceback: an unexpected library error may include private data.
        print(json.dumps({'ok': False, 'error': 'acceptance_failed'}))
        sys.exit(1)
