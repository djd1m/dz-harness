import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('health_plugin', ROOT / 'health_plugin.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class HealthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'sources/raw/test').mkdir(parents=True)
        self.data = b'TECHNICAL DOCUMENT. No medical measurements.\n'
        (self.root / 'sources/raw/test/example.txt').write_bytes(self.data)
        self.row = {'entry_id': 'technical-1', 'stored_at': 'sources/raw/test/example.txt',
                    'bytes': len(self.data), 'sha256': hashlib.sha256(self.data).hexdigest()}
        (self.root / 'sources/manifest.json').write_text(json.dumps({'schema': 'ha-intake-manifest-1', 'entries': [self.row]}))
        self.tools = m.HealthTools(self.root, '/missing/node', '/missing/runtime')

    def tearDown(self):
        self.tmp.cleanup()

    def test_source_integrity_and_unknown_verification(self):
        r = self.tools.call('source_get', {'entry_id': 'technical-1'})
        self.assertTrue(r['ok'])
        self.assertEqual(r['human_verification'], 'not_established')
        self.assertEqual(r['sha256'], self.row['sha256'])
        self.assertEqual(r['content_trust'], 'untrusted_document')

    def test_stale_source(self):
        (self.root / self.row['stored_at']).write_bytes(b'changed')
        self.assertEqual(self.tools.call('source_get', {'entry_id': 'technical-1'})['error'], 'source_integrity_mismatch')
        self.assertFalse(self.tools.call('validate', {})['ok'])

    def test_symlink_escape(self):
        (self.root / 'analysis').symlink_to('/tmp', target_is_directory=True)
        self.assertFalse(self.tools.call('source_get', {'path': 'analysis/anything.md'})['ok'])
        (self.root / 'sources/raw/test/link.txt').symlink_to('/etc/passwd')
        self.assertFalse(self.tools.call('source_get', {'path': 'sources/raw/test/link.txt'})['ok'])

    def test_traversal_and_hidden_paths(self):
        for path in ['/etc/passwd', '../etc/passwd', 'sources/../../etc/passwd', 'sources/.env', '.git/config']:
            with self.subTest(path=path):
                self.assertFalse(self.tools.call('source_get', {'path': path})['ok'])

    def test_manifest_shape_and_duplicates(self):
        p = self.root / 'sources/manifest.json'
        for value in [{}, {'schema': 'ha-intake-manifest-1', 'entries': [self.row, self.row]}, {'schema': 'ha-intake-manifest-1', 'entries': 'bad'}]:
            p.write_text(json.dumps(value))
            self.assertFalse(self.tools.call('validate', {})['ok'])

    def test_deep_json_is_sanitized(self):
        (self.root / 'sources/manifest.json').write_text('[' * 10000 + '0' + ']' * 10000)
        result = self.tools.call('validate', {})
        self.assertFalse(result['ok'])
        # Python 3.14 may parse deeper JSON than 3.12: either sanitized refusal is valid.
        self.assertIn(result['error'], {'unavailable_or_invalid_source', 'manifest_schema'})

    def test_index_view_is_refused(self):
        db = self.root / '.health-brain/.dz/memory/patterns.sqlite'
        db.parent.mkdir(parents=True)
        with sqlite3.connect(db) as conn:
            conn.execute('CREATE VIEW memory_records AS WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x) SELECT n FROM x')
        self.assertEqual(self.tools.call('search', {'query': 'technical'})['error'], 'index_schema_invalid')

    def test_read_only(self):
        before = {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertTrue(self.tools.call('validate', {})['ok'])
        self.tools.call('source_get', {'entry_id': 'technical-1'})
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_file_size_limit(self):
        with self.assertRaises(m.Refusal):
            self.tools.read(self.row['stored_at'], limit=4)

    def test_query_validation(self):
        for args in [{'query': ''}, {'query': 'x', 'limit': True}, {'query': 'x', 'limit': 100}]:
            self.assertFalse(self.tools.call('search', args)['ok'])

    def test_missing_index_is_error(self):
        self.assertFalse(self.tools.call('search', {'query': 'technical'})['ok'])

    def test_index_symlink_is_refused(self):
        (self.root / '.health-brain').symlink_to('/tmp', target_is_directory=True)
        self.assertFalse(self.tools.call('search', {'query': 'technical'})['ok'])

    def test_changed_snapshot_is_refused(self):
        calls = iter([b'db1', b'wal1', b'db2', b'wal1'])
        with patch.object(self.tools, 'read', side_effect=lambda *a, **k: next(calls)):
            self.assertEqual(self.tools.call('search', {'query': 'technical'})['error'], 'index_busy_retry')

    def test_plugin_registration_and_handlers(self):
        package_spec = importlib.util.spec_from_file_location('hermes_health_fixture', ROOT / '__init__.py', submodule_search_locations=[str(ROOT)])
        package = importlib.util.module_from_spec(package_spec)
        sys.modules[package_spec.name] = package
        package_spec.loader.exec_module(package)
        class Context:
            tools = {}
            skills = {}
            def register_tool(self, **kwargs):
                self.tools[kwargs['name']] = kwargs
            def register_skill(self, **kwargs):
                self.skills[kwargs['name']] = kwargs
        ctx = Context()
        package.register(ctx)
        self.assertEqual(set(ctx.tools), {'health_search', 'health_source_get', 'health_validate', 'health_intake_preview'})
        self.assertIn('health-read', ctx.skills)
        with patch.dict(os.environ, {'HEALTH_WORKSPACE': str(self.root)}):
            result = json.loads(ctx.tools['health_source_get']['handler']({'entry_id': 'technical-1'}))
        self.assertTrue(result['ok'])
        self.assertEqual(result['human_verification'], 'not_established')

    def test_subprocess_bounds(self):
        env = {'PATH': '/usr/bin:/bin'}
        with self.assertRaisesRegex(m.Refusal, 'runtime_timeout'):
            m.bounded_run([sys.executable, '-c', 'import time; time.sleep(10)'], env=env, timeout=.1)
        with self.assertRaisesRegex(m.Refusal, 'runtime_output_limit'):
            m.bounded_run([sys.executable, '-c', 'print("x"*10000)'], env=env, limit=100)
        with self.assertRaisesRegex(m.Refusal, 'runtime_failed'):
            m.bounded_run([sys.executable, '-c', 'import sys; sys.stderr.write("SECRET"); sys.exit(1)'], env=env)
        result = m.bounded_run([sys.executable, '-c', 'import os; print(os.getenv("NODE_OPTIONS", "absent"))'], env=env)
        self.assertEqual(result.strip(), b'absent')


if __name__ == '__main__':
    unittest.main()
