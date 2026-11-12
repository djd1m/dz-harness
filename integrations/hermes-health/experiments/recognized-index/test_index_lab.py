import json
import os
import sqlite3
import unittest
import importlib.util
from pathlib import Path
from integration_smoke import Fixture


class IndexLabTests(unittest.TestCase):
    def setUp(self):
        self.f = Fixture()
        self.addCleanup(self.f.close)

    def test_plan_and_real_search(self):
        f = self.f
        before = f.protected()
        rc, plan = f.call('plan')
        self.assertEqual(rc, 0, plan)
        self.assertGreater(plan['expected_count'], 10)
        self.assertEqual(f.call('plan')[1]['plan_sha256'], plan['plan_sha256'])
        self.assertEqual(f.call('status')[1]['coverage'], 'none')
        rc, result = f.apply(plan['plan_sha256'])
        self.assertEqual(rc, 0, result)
        self.assertEqual(result['status'], 'indexed_unverified_at_check_time')
        self.assertEqual(f.apply()[1]['write_attempted'], False)
        rc, result = f.call('search-known', ['--query', f.term])
        self.assertEqual(rc, 0, result)
        self.assertEqual(result['label'], 'НЕПРОВЕРЕНО')
        self.assertNotIn(f.term, json.dumps(result))
        self.assertEqual(before, f.protected())

    def test_sentinel_refusal(self):
        f = self.f
        f.sentinel.chmod(0o644)
        self.assertEqual(f.call('plan')[1]['code'], 'synthetic_guard_refusal')
        f.sentinel.chmod(0o600)
        original = f.sentinel.read_text()
        f.sentinel.write_text(original.replace('{', '{"schema":"duplicate",', 1))
        self.assertEqual(f.call('plan')[1]['code'], 'synthetic_guard_refusal')
        f.sentinel.unlink()
        f.sentinel.symlink_to(f.artifact)
        self.assertEqual(f.call('plan')[1]['code'], 'synthetic_guard_refusal')
        f.sentinel.unlink()
        self.assertEqual(f.call('plan')[1]['code'], 'synthetic_guard_refusal')

    def test_explicit_flags(self):
        for args in [[], ['--execute'], ['--kind', 'consultation'],
                     ['--execute', '--synthetic-confirm', '--expect-plan-sha256', '0' * 64]]:
            rc, result = self.f.call('apply', args)
            self.assertNotEqual(rc, 0, result)
        self.assertEqual(self.f.call('status')[1]['coverage'], 'none')

    def test_backend_refusal(self):
        f = self.f
        f.mutate('PRAGMA user_version=99')
        self.assertEqual(f.apply()[1]['code'], 'readback_unproven')
        f.mutate('PRAGMA user_version=2')
        f.db.rename(f.db.with_suffix('.saved'))
        self.assertEqual(f.apply()[1]['code'], 'readback_unproven')
        self.assertFalse(f.db.exists())
        f.db.write_bytes(b'corrupt synthetic database')
        self.assertEqual(f.apply()[1]['code'], 'readback_unproven')

    def test_variants_conflict(self):
        f = self.f
        self.assertEqual(f.apply()[0], 0)
        with sqlite3.connect(f.db) as db:
            row = db.execute("SELECT id,metadata FROM memory_records WHERE text LIKE '%kind=machine-unverified%' LIMIT 1").fetchone()
        f.mutate('UPDATE memory_records SET metadata=? WHERE id=?', ('{"domain":"wrong","domain":"health-research"}', row[0]))
        self.assertEqual(f.call('reconcile')[1]['code'], 'readback_unproven')
        f.mutate('UPDATE memory_records SET metadata=? WHERE id=?', (row[1], row[0]))
        with sqlite3.connect(f.db) as db:
            original = db.execute('SELECT text,outcome,score,metadata FROM memory_records WHERE id=?', (row[0],)).fetchone()
        for column, value in [('text', original[0].replace('case=synthetic', 'case=other')),
                              ('text', original[0] + '\nvariant'), ('outcome', 'rule'),
                              ('metadata', '{"domain":"general"}')]:
            with self.subTest(column=column):
                f.mutate('UPDATE memory_records SET ' + column + '=? WHERE id=?', (value, row[0]))
                self.assertEqual(f.apply()[1]['coverage'], 'conflict')
                f.mutate('UPDATE memory_records SET text=?,outcome=?,score=?,metadata=? WHERE id=?', (*original, row[0]))
        f.mutate('UPDATE memory_records SET score=0.1 WHERE id=?', (row[0],))
        self.assertEqual(f.call('reconcile')[1]['coverage'], 'conflict')
        f.mutate('UPDATE memory_records SET score=0.8 WHERE id=?', (row[0],))
        f.mutate("INSERT INTO memory_records SELECT id || '-duplicate',skill_id,text,score,outcome,timestamp,metadata FROM memory_records WHERE id=?", (row[0],))
        self.assertEqual(f.apply()[1]['coverage'], 'conflict')

    def test_partial_retry(self):
        f = self.f
        before = f.protected()
        self.assertEqual(f.apply()[0], 0)
        f.mutate("DELETE FROM memory_records WHERE id IN (SELECT id FROM memory_records WHERE text LIKE '%kind=machine-unverified%' LIMIT 2)")
        partial = f.call('reconcile')[1]
        self.assertEqual(partial['coverage'], 'exact_subset')
        self.assertEqual(len(partial['missing_pattern_sha256']), 2)
        rc, result = f.apply()
        self.assertEqual(rc, 0, result)
        self.assertEqual(result['coverage'], 'complete')
        self.assertEqual(before, f.protected())

    def test_ambiguous_write_never_success(self):
        env = self.f.hook("w.ingest=async(o)=>{await original(o);throw Object.assign(new Error('synthetic timeout'),{code:'ETIMEDOUT'})};")
        rc, result = self.f.apply(env=env)
        self.assertNotEqual(rc, 0)
        self.assertEqual(result['status'], 'index_unknown')
        self.assertEqual(result['coverage'], 'complete')
        self.assertEqual(self.f.call('reconcile')[1]['status'], 'indexed_unverified_at_check_time')

    def test_source_drift(self):
        f = self.f
        source = f.ws / f.row['stored_at']
        source.chmod(0o600)
        source.write_bytes(b'X' * source.stat().st_size)
        self.assertEqual(f.call('plan')[1]['code'], 'source_drift')

    def test_hidden_path_stays_denied(self):
        p = Path(__file__).resolve().parents[2] / 'health_plugin.py'
        spec = importlib.util.spec_from_file_location('health_plugin', p)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        tools = module.HealthTools(str(self.f.ws), '/opt/health-node22/bin/node', '/opt/health-advisor-runtime')
        with self.assertRaisesRegex(module.Refusal, 'path_denied'):
            tools.read(self.f.saved['artifact_path'])

    def test_native_missing_and_no_ingest(self):
        env = self.f.hook("const M=require('module'),load=M._load; M._load=function(n,...args){if(n.endsWith('/better-sqlite3'))throw new Error('native missing');return load.call(this,n,...args)}; w.ingest=()=>{throw new Error('must not call')};")
        self.assertEqual(self.f.apply(env=env)[1]['code'], 'readback_unproven')
        self.assertEqual(self.f.call('status')[1]['coverage'], 'none')

    def test_limits_before_buffer(self):
        f = self.f
        f.mutate("INSERT INTO memory_records VALUES('large','',?,0.8,'lesson-learned','2026-11-09','{\"domain\":\"general\"}')", ('x' * (32 * 1024 * 1024 + 1),))
        self.assertEqual(f.apply()[1]['code'], 'readback_unproven')

    def test_artifact_drift(self):
        self.f.artifact.write_text('changed synthetic bytes')
        self.assertEqual(self.f.call('plan')[1]['code'], 'corrupt_refusal')

    def test_parent_alias_and_permission(self):
        f = self.f
        brain = f.ws / '.health-brain'
        brain.chmod(0o777)
        self.assertEqual(f.apply()[1]['code'], 'readback_unproven')
        brain.chmod(0o700)
        actual = f.ws / 'moved-brain'
        brain.rename(actual)
        brain.symlink_to(actual, target_is_directory=True)
        self.assertEqual(f.apply()[1]['code'], 'readback_unproven')

    def test_partial_exception(self):
        f = self.f
        env = f.hook("w.ingest=async(o)=>{await original(o);const D=require('/opt/health-advisor-runtime/node_modules/better-sqlite3');const db=new D(o.workspace+'/.health-brain/.dz/memory/patterns.sqlite');db.exec(\"DELETE FROM memory_records WHERE id IN (SELECT id FROM memory_records WHERE text LIKE '%kind=machine-unverified%' LIMIT 2)\");db.close();throw new Error('synthetic partial')};")
        f.backup()
        rc, result = f.apply(env=env)
        self.assertNotEqual(rc, 0)
        self.assertEqual(result['status'], 'index_unknown')
        self.assertEqual(result['coverage'], 'exact_subset')
        self.assertEqual(f.apply()[0], 0)

    def test_malformed_header_refusal(self):
        f = self.f
        f.mutate("UPDATE memory_records SET text='ha-doc-999 malformed' WHERE id=(SELECT id FROM memory_records LIMIT 1)")
        self.assertEqual(f.apply()[1]['code'], 'readback_unproven')


if __name__ == '__main__':
    unittest.main()
