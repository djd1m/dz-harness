"""Pinned-runtime integration experiment: synthetic data, no network/production mounts."""
from contextlib import closing
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile

PLUGIN = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('health_plugin', PLUGIN / 'health_plugin.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def ingest(root, doc):
    run = subprocess.run(['health-advisor', 'third-brain', 'ingest', str(doc), '--workspace', str(root),
                          '--case', 'technical', '--kind', 'conclusion', '--date', '2026-11-09', '--json'],
                         capture_output=True, text=True, timeout=90)
    if run.returncode:
        raise AssertionError('technical_ingest_failed_exit_' + str(run.returncode))


def rows(db):
    with closing(sqlite3.connect('file:' + str(db) + '?mode=ro', uri=True)) as connection:
        return sorted(r[0] for r in connection.execute('SELECT text FROM memory_records'))


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / 'recognized').mkdir()
    (root / 'sources/raw').mkdir(parents=True)
    (root / 'sources/manifest.json').write_text(json.dumps({'schema': 'ha-intake-manifest-1', 'entries': []}))
    doc = root / 'recognized/technical.md'
    body = '# UNVERIFIED TECHNICAL TEST\n\nhuman_verification: not_established\n\n' + '\n\n'.join(
        f'TESTINDEXALPHA section {i}. Technical synthetic routing text; no medical observations. ' * 3
        for i in range(20))
    doc.write_text(body)
    original_hash = hashlib.sha256(doc.read_bytes()).hexdigest()
    tools = m.HealthTools(root, '/opt/health-node22/bin/node', '/opt/health-advisor-runtime')
    db = root / '.health-brain/.dz/memory/patterns.sqlite'
    ingest(root, doc)
    baseline = rows(db)
    assert len(baseline) > 1, 'multi_chunk_fixture_required'
    hits = tools.call('search', {'query': 'TESTINDEXALPHA'})
    assert hits['ok'] and any(h['path'] == 'recognized/technical.md' and h['sha256'] == original_hash
                             for h in hits['hits']), 'known_source_not_found:' + str({k: hits.get(k) for k in ('ok', 'error', 'indexed_records')})
    ingest(root, doc)
    assert rows(db) == baseline, 'duplicate_ingest_changed_records'
    # Preserve the synthetic DB via Backup API before fault injection.
    backup = root / 'before-fault.sqlite'
    with closing(sqlite3.connect(db)) as source, closing(sqlite3.connect(backup)) as target:
        source.backup(target)
        assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert rows(backup) == baseline
    # Deliberate isolated partial-index fault; never target a real map.
    with closing(sqlite3.connect(db)) as connection:
        connection.execute('DELETE FROM memory_records WHERE text = ?', (baseline[0],))
        connection.commit()
    assert len(rows(db)) == len(baseline) - 1
    ingest(root, doc)
    assert rows(db) == baseline, 'partial_index_not_recovered'
    assert hashlib.sha256(doc.read_bytes()).hexdigest() == original_hash
    assert 'human_verification: not_established' in doc.read_text()
    doc.write_text('Technical source changed after indexing.\n')
    assert tools.call('search', {'query': 'TESTINDEXALPHA'}).get('error') == 'stale_index_source'
    hidden = root / 'recognized/.machine-unverified/operations/technical'
    hidden.mkdir(parents=True)
    hidden_doc = hidden / 'artifact.md'
    hidden_doc.write_text('UNVERIFIED TECHNICAL TEST HIDDENINDEXBETA. No medical observations.\n')
    ingest(root, hidden_doc)
    hidden_result = tools.call('search', {'query': 'HIDDENINDEXBETA'})
    assert hidden_result.get('error') == 'path_denied' and not hidden_result['ok'], 'hidden_namespace_policy_changed_review_required'
    print(json.dumps({'known_source_search': 'passed', 'baseline_chunks': len(baseline),
                      'repeat_exact_text_multiset': 'passed', 'partial_index_recovery': 'passed',
                      'source_unchanged_by_ingest': 'passed', 'stale_source_refusal': 'passed',
                      'hidden_namespace_search': 'unsupported', 'hidden_error': hidden_result.get('error'),
                      'scope': 'existing_runtime_synthetic_only'}))
