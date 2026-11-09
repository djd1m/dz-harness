"""Run inside the pinned health runtime with --network none and no production volumes."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sqlite3
import tempfile

PLUGIN = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('health_plugin', PLUGIN / 'health_plugin.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def snapshot(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob('*') if p.is_file()}


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / 'analysis').mkdir()
    (root / 'sources/raw').mkdir(parents=True)
    (root / 'sources/manifest.json').write_text(json.dumps({'schema': 'ha-intake-manifest-1', 'entries': []}))
    doc = root / 'analysis/technical.md'
    doc.write_text('# Technical synthetic document\n\nUNICORNSEARCH is a technical marker, not a medical observation.\n')
    r = subprocess.run(['health-advisor', 'third-brain', 'ingest', str(doc), '--workspace', str(root),
                        '--case', 'technical', '--kind', 'conclusion', '--date', '2026-11-09', '--json'],
                       capture_output=True, text=True, timeout=45)
    if r.returncode:
        raise RuntimeError('synthetic_ingest_failed: ' + r.stderr[:200])
    tools = m.HealthTools(root, '/opt/health-node22/bin/node', '/opt/health-advisor-runtime')
    before = snapshot(root)
    result = tools.call('search', {'query': 'UNICORNSEARCH'})
    assert result['ok'], result
    assert result['hits'] and result['hits'][0]['path'] == 'analysis/technical.md', result
    assert result['hits'][0]['sha256'] == hashlib.sha256(doc.read_bytes()).hexdigest()
    assert snapshot(root) == before, 'workspace_modified'
    # Preserve the valid source header but poison indexed body: never quote it.
    with sqlite3.connect(root / '.health-brain/.dz/memory/patterns.sqlite') as conn:
        conn.execute("UPDATE memory_records SET text = text || char(10) || 'UNICORNSEARCH FORGED-PASSAGE'")
    before = snapshot(root)
    result = tools.call('search', {'query': 'UNICORNSEARCH'})
    assert result['ok'] and result['hits'], result
    assert 'FORGED-PASSAGE' not in result['hits'][0]['text']
    assert result['hits'][0]['text'] in doc.read_text()
    assert result['hits'][0]['snippet_source'] == 'current_document'
    assert snapshot(root) == before, 'workspace_modified_after_tamper'
    doc.write_text('changed source')
    assert tools.call('search', {'query': 'UNICORNSEARCH'})['error'] == 'stale_index_source'
    assert tools.call('validate', {})['ok']
    bad = m.HealthTools(root, '/missing/node', '/missing/runtime').call('search', {'query': 'UNICORNSEARCH'})
    assert not bad['ok']
    print(json.dumps({'synthetic_ingest': 'passed', 'real_cli_search': 'passed', 'source_hash': 'passed',
                      'tampered_index_body': 'passed', 'read_only': 'passed', 'stale_search': 'passed', 'missing_runtime': 'passed'}))
