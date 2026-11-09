"""Synthetic-only authority, privacy and bounded process contracts."""
import concurrent.futures
import threading
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('recognized_fixture', ROOT / '__init__.py', submodule_search_locations=[str(ROOT)])
pkg = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pkg
spec.loader.exec_module(pkg)
from recognized_fixture import recognized_confirm as m
from recognized_fixture.health_plugin import HealthTools, Refusal

class RunnerTests(unittest.TestCase):
    def run_child(self, code, data=b'x' * 100000, **kw):
        return m.bounded_input_run([sys.executable, '-c', code], data, timeout=.5, **kw)

    def test_runner_backpressure(self):
        started = time.monotonic()
        for code in ['import time; time.sleep(30)',
                     'import sys; sys.stderr.write("z"*1000000); sys.stderr.flush(); sys.stdin.buffer.read()',
                     'import os,time; os.fork(); time.sleep(30)']:
            with self.assertRaises(Refusal):
                self.run_child(code)
        self.assertLess(time.monotonic()-started, 3)

    def test_runner_privacy(self):
        with self.assertRaises(Refusal) as caught:
            self.run_child('import sys; sys.stderr.write("SENTINEL"); sys.exit(1)')
        self.assertNotIn('SENTINEL', str(caught.exception))

    def test_runner_full_duplex(self):
        value = self.run_child('import sys; sys.stderr.write("e"*1000); sys.stderr.flush(); x=sys.stdin.buffer.read(); print(len(x))')
        self.assertEqual(value, b'100000\n')

    def test_core_contract_strict(self):
        for raw in [b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":1e999}', b'{"x":"\\u0000"}', b'[]', b'{"text":"\\ud800"}']:
            with self.assertRaises(Refusal):
                m.strict_json(raw)

    def test_text_boundaries(self):
        request = {'operation_id':'rc-'+'a'*32,'entry_id':'b'*32,'source_sha256':'c'*64,
                   'source_bytes':1,'engine':{'name':'pypdf','version':'7.0.0'},'text':'Ω'*(m.MAX_TEXT//2)}
        tools = HealthTools('/tmp','/unused','/unused')
        with patch.object(m,'bounded_input_run',return_value=b'{}') as runner:
            m.core_run(tools,'save',request)
            self.assertTrue(runner.called)
            for text in ['Ω'*(m.MAX_TEXT//2+1), '\ud800', '\x00', '']:
                with self.subTest(length=len(text)):
                    with self.assertRaises(Refusal):
                        m.core_run(tools,'save',{**request,'text':text})

    def test_model_cannot_confirm(self):
        with tempfile.TemporaryDirectory() as root:
            tools = HealthTools(root, '/unused', '/unused')
            for name in ('recognized_confirm', 'recognized_cancel', 'recognized_status'):
                self.assertFalse(tools.call(name, {})['ok'])

    def test_no_index(self):
        with self.assertRaises(Refusal):
            m.core_run(None, 'read', {})
        with self.assertRaises(Refusal):
            m.core_run(None, 'ingest', {})

class StateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.map = self.root / 'map'
        self.map.mkdir()
        for name in ('drafts', 'intake'):
            (self.root / name).mkdir(mode=0o700)
        self.env = patch.dict(os.environ, HEALTH_DRAFTS=str(self.root/'drafts'),
                              HEALTH_INTAKE_STATE=str(self.root/'intake'),
                              HEALTH_RECOGNIZED_STATE=str(self.root/'recognized'),
                              HEALTH_RECOGNIZED_SYNTHETIC_WRITE='1')
        self.env.start()
        self.addCleanup(self.env.stop)
        self.tools = HealthTools(self.map, '/unused', '/unused')
        self.owner = {'platform':'mattermost', 'user_id':'owner', 'chat_id':'chat', 'profile':'test'}
        self.side = {'schema':'draft-provenance-1', 'draft_id':'pdf-'+'b'*32,
                     'workspace':m.workspace_identity(self.tools),
                     'source':{'entry_id':'a'*32,'path':'sources/raw/synthetic.pdf','logical_path':'synthetic.pdf','sha256':'c'*64,'bytes':12},
                     'draft':{'sha256':m.digest(b'SENTINEL'),'bytes':8},
                     'engine':{'name':'pypdf','version':'7.0.0'}, 'parser_status':'partial_text'}
        self.identity = patch.object(m, 'gateway_identity', return_value=self.owner)
        self.identity.start()
        self.addCleanup(self.identity.stop)
        self.snap = patch.object(m, 'snapshot', return_value=(self.side, 'SENTINEL'))
        self.snap.start()
        self.addCleanup(self.snap.stop)
        self.pin = patch.object(m, 'runtime_identity', return_value='d'*64)
        self.pin.start()
        self.addCleanup(self.pin.stop)
        self.ident = m.prepare(self.tools, {'draft_id': self.side['draft_id'], 'entry_id':'a'*32,
                                           'expected_draft_sha256':self.side['draft']['sha256']})['proposal_id']

    def command(self, action='confirm'):
        return m.command(action, self.ident, self.tools, _authority=m._COMMAND_AUTHORITY)

    def core(self, tools, action, request):
        if action == 'save':
            return {'ok':True}
        with m.state_store(self.tools):
            pass

    def test_store_isolation(self):
        for root in ('map', 'intake', 'drafts'):
            with patch.dict(os.environ, HEALTH_RECOGNIZED_STATE=str(self.root/root)):
                with self.assertRaises(Refusal):
                    m.RecognizedStore(self.tools)
        alias = self.root/'alias'
        alias.symlink_to(self.root/'intake')
        with patch.dict(os.environ, HEALTH_RECOGNIZED_STATE=str(alias)):
            with self.assertRaises(Refusal):
                m.RecognizedStore(self.tools)

    def test_receipt_tamper(self):
        path = self.root/'recognized'/(self.ident+'.recognized.json')
        raw = json.loads(path.read_bytes())
        raw['payload']['owner']['user_id'] = 'attacker'
        path.write_bytes(m.encode(raw))
        with self.assertRaises(Refusal):
            self.command('status')

    def test_owner_mismatch(self):
        with patch.object(m, 'gateway_identity', return_value={**self.owner,'chat_id':'other'}):
            with self.assertRaises(Refusal):
                self.command('status')
            with self.assertRaises(Refusal):
                self.command('cancel')

    def test_command_boundary(self):
        with self.assertRaises(Refusal):
            m.command('confirm', self.ident, self.tools)

    def test_write_disabled(self):
        with patch.dict(os.environ, HEALTH_RECOGNIZED_SYNTHETIC_WRITE='0'), patch.object(m,'core_run') as core:
            with self.assertRaises(Refusal):
                self.command()
            core.assert_not_called()

    def test_expiry_cancel(self):
        with patch.object(m.time, 'time', return_value=time.time()+2000), patch.object(m,'core_run') as core:
            self.assertEqual(self.command()['state'], 'expired')
            core.assert_not_called()

    def test_concurrent_confirm(self):
        entered, release = threading.Event(), threading.Event()
        def blocked(tools, action, request):
            self.assertEqual(action, 'save')
            entered.set()
            self.assertTrue(release.wait(2))
            raise Refusal('synthetic_uncertain')
        with patch.object(m,'core_run',side_effect=blocked) as core, concurrent.futures.ThreadPoolExecutor(1) as pool:
            pending = pool.submit(self.command)
            self.assertTrue(entered.wait(2))
            try:
                for action in ('confirm', 'cancel', 'status'):
                    with self.assertRaisesRegex(Refusal,'busy'):
                        self.command(action)
            finally:
                release.set()
            self.assertEqual(pending.result()['state'],'reconciliation_required')
            self.assertEqual(core.call_count,1)

    def test_timeout_replay_no_write(self):
        with patch.object(m,'core_run',side_effect=Refusal('timeout')) as core:
            self.assertEqual(self.command()['state'], 'reconciliation_required')
            self.assertEqual(core.call_count,1)
            self.assertEqual(self.command()['state'], 'reconciliation_required')
            self.assertEqual(core.call_args.args[1], 'status')
        with self.assertRaises(Refusal):
            self.command('cancel')

    def test_handler_errors(self):
        with patch.object(m, 'command', side_effect=OSError('SENTINEL')):
            result = m.command_handler('confirm')(self.ident)
            self.assertNotIn('SENTINEL',result)
            self.assertFalse(json.loads(result)['ok'])

    def test_receipt_failure(self):
        original = m.RecognizedStore.save
        def fail_after_intent(store, receipt):
            if receipt['state'] != 'committing':
                raise OSError('SENTINEL')
            original(store, receipt)
        with patch.object(m.RecognizedStore,'save',fail_after_intent), patch.object(m,'core_run',side_effect=Refusal('timeout')):
            result = self.command()
            self.assertEqual(result['state'],'reconciliation_required')
            self.assertNotIn('SENTINEL',json.dumps(result))
        with m.state_store(self.tools) as store:
            self.assertEqual(store.load(self.ident)['state'],'committing')

    def test_unsafe_files(self):
        path = self.root/'recognized'/(self.ident+'.recognized.json')
        link = self.root/'copy'
        os.link(path,link)
        with self.assertRaises(Refusal):
            self.command('status')
        link.unlink()
        path.chmod(0o644)
        with self.assertRaises(Refusal):
            self.command('status')
        path.chmod(0o600)
        path.unlink()
        os.mkfifo(path,0o600)
        with self.assertRaises(Refusal):
            self.command('status')

    def test_state_quota(self):
        for n in range(128):
            path = self.root/'recognized'/('abandoned-'+str(n))
            path.touch(mode=0o600)
        with self.assertRaisesRegex(Refusal,'quota'):
            self.command('status')

    def test_runtime_drift(self):
        with patch.object(m,'runtime_identity',return_value='e'*64), patch.object(m,'core_run') as core:
            with self.assertRaisesRegex(Refusal,'prepare_again'):
                self.command()
            core.assert_not_called()

    def test_snapshot_continuity(self):
        self.snap.stop()
        raw = b'synthetic source'
        source = self.map/'sources/raw/synthetic.pdf'
        source.parent.mkdir(parents=True)
        source.write_bytes(raw)
        side = json.loads(json.dumps(self.side))
        side['source']['sha256']=m.digest(raw)
        side['source']['bytes']=len(raw)
        row = {'entry_id':'a'*32,'stored_at':side['source']['path'],'path':'synthetic.pdf',
               'sha256':m.digest(raw),'bytes':len(raw)}
        (self.map/'sources/manifest.json').write_bytes(m.encode({'schema':'ha-intake-manifest-1','entries':[row]}))
        folder = self.root/'drafts'/side['draft_id']
        folder.mkdir(mode=0o700)
        for name, raw in [('provenance.json',m.encode(side)),('draft.md',b'SENTINEL')]:
            path=folder/name
            path.write_bytes(raw)
            path.chmod(0o600)
        original = m.private_read
        def overwrite_after_read(fd,name,limit):
            raw=original(fd,name,limit)
            if name == 'draft.md':
                (folder/name).write_bytes(b'CHANGED!')
            return raw
        with patch.object(m,'private_read',overwrite_after_read):
            _,text=m.snapshot(self.tools,side['draft_id'])
        self.assertEqual(text,'SENTINEL')
        with self.assertRaises(Refusal):
            m.snapshot(self.tools,side['draft_id'])

    def test_sidecar_schema(self):
        for mutate in [lambda x:x.update(extra=1), lambda x:x['draft'].update(bytes=True),
                       lambda x:x['workspace'].update(ino=True), lambda x:x['source'].update(sha256='x'),
                       lambda x:x.update(parser_status='no_text'), lambda x:x['source'].update(path=''),
                       lambda x:x['source'].update(logical_path=5), lambda x:x['workspace'].update(path='relative')]:
            side = json.loads(json.dumps(self.side))
            mutate(side)
            with self.assertRaises(Refusal):
                m.validate_sidecar(side)

    def test_fsync_intent_failure_does_not_save(self):
        with patch.object(m.os,'fsync',side_effect=OSError('failed')), patch.object(m,'core_run') as core:
            with self.assertRaises(OSError):
                self.command()
            core.assert_not_called()

    def test_reconcile_without_draft(self):
        with m.state_store(self.tools) as store:
            r = store.load(self.ident)
            r['state']='committing'
            r['expires']=0
            store.save(r)
        with patch.object(m,'snapshot',side_effect=AssertionError('must not reopen draft')), patch.object(m,'core_run',return_value={'status':'absent_at_read_time'}):
            self.assertEqual(self.command()['state'], 'reconciliation_required')

    def test_prepare_refuses_unbound_source_without_receipt(self):
        args = {'draft_id':self.side['draft_id'],'entry_id':'a'*32,
                'expected_draft_sha256':self.side['draft']['sha256']}
        before = sorted((self.root/'recognized').iterdir())
        with patch.object(m,'core_run') as core:
            for changed in ({'entry_id':'e'*32}, {'expected_draft_sha256':'f'*64}):
                with self.assertRaisesRegex(Refusal,'prepare_binding'):
                    m.prepare(self.tools,{**args,**changed})
            with patch.dict(self.side['source'],entry_id='invalid-id'):
                with self.assertRaisesRegex(Refusal,'entry_id_invalid'):
                    m.prepare(self.tools,{**args,'entry_id':'invalid-id'})
            with patch.dict(self.side['source'],logical_path=None):
                with self.assertRaisesRegex(Refusal,'logical_source_required'):
                    m.prepare(self.tools,args)
            with patch.object(m.time,'time',return_value=float('inf')):
                with self.assertRaisesRegex(Refusal,'clock_invalid'):
                    m.prepare(self.tools,args)
            core.assert_not_called()
        self.assertEqual(before,sorted((self.root/'recognized').iterdir()))

    def test_owner_cancel_is_terminal_without_core(self):
        with patch.object(m,'core_run') as core:
            cancelled=self.command('cancel')
            self.assertEqual(cancelled['state'],'cancelled')
            self.assertEqual(self.command()['state'],'cancelled')
            self.assertEqual(self.command('status')['operation_id'],self.ident)
            self.assertNotIn('SENTINEL',json.dumps(cancelled))
            core.assert_not_called()

    def test_invalid_command_and_clock_cannot_commit(self):
        with patch.object(m,'core_run') as core:
            for action,ident in [('save',self.ident),('confirm','../outside'),('status',None)]:
                with self.assertRaisesRegex(Refusal,'command_invalid'):
                    m.command(action,ident,self.tools,_authority=m._COMMAND_AUTHORITY)
            with patch.object(m.time,'time',return_value=float('nan')):
                with self.assertRaisesRegex(Refusal,'clock_invalid'):
                    self.command()
            core.assert_not_called()
        with m.state_store(self.tools) as store:
            self.assertEqual(store.load(self.ident)['state'],'prepared')

    def test_reconcile_pin_drift_and_receipt_failure_stay_uncertain(self):
        with m.state_store(self.tools) as store:
            receipt=store.load(self.ident)
            receipt.update(state='committing',artifact_observed=True)
            store.save(receipt)
        with patch.object(m,'runtime_identity',return_value='e'*64), patch.object(m,'core_run') as core:
            result=self.command('status')
            self.assertEqual(result['state'],'reconciliation_required')
            self.assertEqual(result['artifact_presence'],'previously_observed_unverified')
            core.assert_not_called()
        with patch.object(m.RecognizedStore,'save',side_effect=OSError('SENTINEL')), patch.object(m,'core_run',side_effect=Refusal('unavailable')) as core:
            result=self.command()
            self.assertEqual(result['state'],'reconciliation_required')
            self.assertEqual(core.call_args.args[1],'status')
            self.assertNotIn('SENTINEL',json.dumps(result))
            self.assertEqual(result['operation_id'],self.ident)

    def _snapshot_fixture(self):
        self.snap.stop()
        source=self.map/'sources/raw/synthetic.pdf'
        source.parent.mkdir(parents=True)
        raw=b'SYNTHETIC-SOURCE'
        source.write_bytes(raw)
        side=json.loads(json.dumps(self.side))
        side['source'].update(sha256=m.digest(raw),bytes=len(raw))
        row={'entry_id':'a'*32,'stored_at':side['source']['path'],'path':'synthetic.pdf',
             'sha256':m.digest(raw),'bytes':len(raw)}
        manifest=self.map/'sources/manifest.json'
        manifest.write_bytes(m.encode({'schema':'ha-intake-manifest-1','entries':[row]}))
        folder=self.root/'drafts'/side['draft_id']
        folder.mkdir(mode=0o700)
        for name,body in [('provenance.json',m.encode(side)),('draft.md',b'SENTINEL')]:
            (folder/name).write_bytes(body)
            (folder/name).chmod(0o600)
        self.assertEqual(m.snapshot(self.tools,side['draft_id'])[1],'SENTINEL')
        return folder,side,source,manifest

    def test_snapshot_rejects_source_and_workspace_drift(self):
        folder,side,source,manifest=self._snapshot_fixture()
        original_manifest=manifest.read_bytes()
        original_source=source.read_bytes()
        with patch.object(m,'core_run') as core:
            for mutation,error in [
                (lambda: source.write_bytes(b'DRIFT-SAME-SIZE!'),'source_drift'),
                (lambda: manifest.write_bytes(m.encode({'schema':'ha-intake-manifest-1','entries':[]})),'source_drift'),
                (lambda: (folder/'provenance.json').write_bytes(m.encode({**side,'workspace':{**side['workspace'],'ino':side['workspace']['ino']+1}})),'binding_invalid'),
                (lambda: folder.chmod(0o755),'draft_permissions')]:
                with self.subTest(error=error):
                    mutation()
                    with self.assertRaisesRegex(Refusal,error):
                        m.snapshot(self.tools,side['draft_id'])
                    folder.chmod(0o700)
                    manifest.write_bytes(original_manifest)
                    source.write_bytes(original_source)
                    (folder/'provenance.json').write_bytes(m.encode(side))
            for ident in ('../../outside',None):
                with self.assertRaisesRegex(Refusal,'draft_id_invalid'):
                    m.snapshot(self.tools,ident)
            with self.assertRaises(FileNotFoundError):
                m.snapshot(self.tools,'pdf-'+'f'*32)
            core.assert_not_called()

    def test_snapshot_refuses_private_file_and_invalid_text(self):
        folder,side,_,_=self._snapshot_fixture()
        draft=folder/'draft.md'
        for body in (b'',b'\x00',b'\xff'):
            draft.write_bytes(body)
            side['draft']={'sha256':m.digest(body),'bytes':len(body)}
            (folder/'provenance.json').write_bytes(m.encode(side))
            with self.assertRaises((Refusal,UnicodeError)):
                m.snapshot(self.tools,side['draft_id'])
        draft.write_bytes(b'SENTINEL')
        side['draft']={'sha256':m.digest(b'SENTINEL'),'bytes':8}
        (folder/'provenance.json').write_bytes(m.encode(side))
        for filename in ('draft.md','provenance.json'):
            path=folder/filename
            path.chmod(0o644)
            with self.assertRaisesRegex(Refusal,'private_file_invalid'):
                m.snapshot(self.tools,side['draft_id'])
            path.chmod(0o600)
        with draft.open('wb') as stream:
            stream.truncate(m.MAX_TEXT+1)
        with self.assertRaisesRegex(Refusal,'private_file_invalid'):
            m.snapshot(self.tools,side['draft_id'])

    def test_signed_invalid_receipt_is_not_authority(self):
        with m.state_store(self.tools) as store:
            original=store.load(self.ident)
            mutations=[lambda r:r.update(schema='hermes-health-intake-1'),
                       lambda r:r.update(artifact_observed='yes'),
                       lambda r:r['owner'].update(user_id=5),
                       lambda r:r.update(created='yesterday')]
            for mutate in mutations:
                receipt=json.loads(json.dumps(original))
                mutate(receipt)
                store.save(receipt)
                with self.assertRaises(Refusal):
                    store.load(self.ident)
            store.save(original)

    def test_store_missing_key_and_invalid_key_refuse_reinitialization(self):
        key=self.root/'recognized/.recognized.key'
        original=key.read_bytes()
        key.unlink()
        with self.assertRaisesRegex(Refusal,'key_missing'):
            self.command('status')
        self.assertFalse(key.exists())
        key.write_bytes(b'short')
        key.chmod(0o600)
        with self.assertRaisesRegex(Refusal,'key_invalid'):
            self.command('status')
        key.write_bytes(original)
        self.assertEqual(self.command('status')['state'],'prepared')

    def test_store_bad_configuration_lock_and_byte_quota_refuse(self):
        for changes,error in [({'HEALTH_RECOGNIZED_STATE':''},'not_configured'),
                              ({'HEALTH_DRAFTS':'relative'},'isolation_roots_required')]:
            with patch.dict(os.environ,changes):
                with self.assertRaisesRegex(Refusal,error):
                    self.command('status')
        git=self.root/'.git'
        git.mkdir()
        with self.assertRaisesRegex(Refusal,'inside_git'):
            self.command('status')
        git.rmdir()
        lock=self.root/'recognized/.recognized.lock'
        lock.chmod(0o644)
        with self.assertRaisesRegex(Refusal,'lock_invalid'):
            self.command('status')
        lock.chmod(0o600)
        abandoned=self.root/'recognized/.recognized-pending-abandoned'
        with abandoned.open('wb') as stream:
            stream.truncate(16*1024*1024+1)
        abandoned.chmod(0o600)
        with self.assertRaisesRegex(Refusal,'state_quota'):
            self.command('status')


class RuntimeIdentityTests(unittest.TestCase):
    """Broken installed-code fixtures must fail before any subprocess is allowed."""
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.runtime=self.root/'runtime'
        self.modules=self.runtime/'node_modules'
        self.modules.mkdir(parents=True)
        self.node=self.root/'node'
        self.node.write_bytes(b'synthetic-executable-never-launched')
        self.names=('@dzhechkov/health-advisor/lib/recognized-cli.js',
                    '@dzhechkov/health-advisor/lib/recognized-store.js',
                    '@dzhechkov/harness-core/package.json')
        for name in self.names:
            path=self.modules/name
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(b'{}' if path.suffix == '.json' else b'// synthetic fixture\n')
        self.tools=HealthTools(self.root,self.node,self.runtime)
        # Prove this fixture can pass the byte pin before selectively breaking it.
        with patch.object(m,'core_run',return_value=m.CAPABILITY):
            self.assertRegex(m.runtime_identity(self.tools),r'^[a-f0-9]{64}$')

    def test_runtime_rejects_missing_or_linked_code(self):
        with patch.object(m,'core_run') as core:
            missing=HealthTools(self.root,self.node,self.root/'missing')
            with self.assertRaisesRegex(Refusal,'runtime_unavailable'):
                m.runtime_identity(missing)
            alias=self.root/'aliased-runtime'
            alias.mkdir()
            (alias/'node_modules').symlink_to(self.modules)
            with self.assertRaisesRegex(Refusal,'runtime_unavailable'):
                m.runtime_identity(HealthTools(self.root,self.node,alias))
            link=self.modules/'external.js'
            link.symlink_to(self.node)
            with self.assertRaisesRegex(Refusal,'runtime_symlink'):
                m.runtime_identity(self.tools)
            link.unlink()
            (self.modules/self.names[0]).unlink()
            with self.assertRaisesRegex(Refusal,'runtime_unavailable'):
                m.runtime_identity(self.tools)
            core.assert_not_called()

    def test_runtime_rejects_oversized_node_without_reading_it(self):
        with self.node.open('wb') as stream:
            stream.truncate(256*1024*1024+1)
        with patch.object(m,'core_run') as core:
            with self.assertRaisesRegex(Refusal,'node_invalid'):
                m.runtime_identity(self.tools)
            core.assert_not_called()

    def test_runtime_requires_exact_capability_and_tracks_dependency_drift(self):
        with patch.object(m,'core_run',return_value=m.CAPABILITY):
            original=m.runtime_identity(self.tools)
            dependency=self.modules/'transitive-lock.js'
            dependency.write_text('// first version\n')
            changed=m.runtime_identity(self.tools)
            self.assertNotEqual(original,changed)
            dependency.write_text('// changed version\n')
            self.assertNotEqual(changed,m.runtime_identity(self.tools))
        with patch.object(m,'core_run',return_value={**m.CAPABILITY,'version':2}) as core:
            with self.assertRaisesRegex(Refusal,'capability_required'):
                m.runtime_identity(self.tools)
            self.assertEqual(core.call_args.args[1:3],('capabilities',{}))

    def test_runtime_aggregate_byte_budget_blocks_execution(self):
        # Sparse real files exercise real bounded reads without allocating disk payload.
        for number in range(9):
            with (self.modules/('bulk-'+str(number)+'.js')).open('wb') as stream:
                stream.truncate(16*1024*1024)
        with patch.object(m,'core_run') as core:
            with self.assertRaisesRegex(Refusal,'runtime_limit'):
                m.runtime_identity(self.tools)
            core.assert_not_called()

    def test_runtime_file_count_budget_blocks_execution(self):
        # Real distinct empty JS modules; no fabricated repeated iterator entries.
        folder=self.modules/'bulk'
        folder.mkdir()
        for number in range(32769):
            (folder/(str(number)+'.js')).touch()
        with patch.object(m,'core_run') as core:
            with self.assertRaisesRegex(Refusal,'runtime_limit'):
                m.runtime_identity(self.tools)
            core.assert_not_called()

if __name__ == '__main__':
    unittest.main()
