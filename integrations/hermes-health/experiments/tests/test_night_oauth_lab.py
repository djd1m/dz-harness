import concurrent.futures
import contextlib
import importlib.util
import io
import json
import multiprocessing as mp
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'night_oauth_lab.py'
spec = importlib.util.spec_from_file_location('night_oauth_lab', MODULE)
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)


def access_process(owner, provider, barrier, queue):
    barrier.wait(10)
    try:
        r = m.OfflineOwner(owner, m.FakeProvider(provider)).get_access()
        queue.put(('ok', r['generation']))
    except Exception as e:
        queue.put(('error', type(e).__name__))


def crash_process(owner, provider, point):
    def crash(p):
        if p == point:
            os._exit(17)
    m.OfflineOwner(owner, m.FakeProvider(provider), hook=crash).get_access()
    os._exit(18)


class OAuthLabTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='offline-oauth-', dir='/var/tmp')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.od = self.root / 'owner'; self.od.mkdir(mode=0o700)
        self.pd = self.root / 'provider'; self.pd.mkdir(mode=0o700)
        self.provider = m.FakeProvider(self.pd)
        self.grant = self.provider.create()
        self.owner = m.OfflineOwner(self.od, self.provider)
        self.owner.initialize(self.grant)

    def assert_refusal(self, call, code):
        with self.assertRaises(m.LabRefusal) as c:
            call()
        self.assertEqual(str(c.exception), code)

    def test_copied_grant_conflicts(self):
        self.provider.refresh(self.grant['refresh'])
        self.assert_refusal(lambda: self.provider.refresh(self.grant['refresh']), 'provider_rejected')
        self.assertEqual(self.provider.calls(), 2)

    def test_processes_refresh_once(self):
        ctx = mp.get_context('fork'); barrier = ctx.Barrier(4); q = ctx.Queue()
        ps = [ctx.Process(target=access_process, args=(self.od, self.pd, barrier, q)) for _ in range(4)]
        for p in ps:p.start()
        for p in ps:
            p.join(15)
            if p.is_alive():p.kill();p.join();self.fail('worker_timeout')
            self.assertEqual(p.exitcode, 0)
        self.assertEqual([q.get(timeout=2) for _ in ps], [('ok', 1)] * 4)
        self.assertEqual(self.provider.calls(), 1)
        q.close();q.join_thread()

    def test_threads_shared_and_independent_objects(self):
        barrier = threading.Barrier(4)
        def call(i):
            barrier.wait(10)
            owner = self.owner if i % 2 else m.OfflineOwner(self.od, m.FakeProvider(self.pd))
            return owner.get_access()['generation']
        with concurrent.futures.ThreadPoolExecutor(4) as ex:
            self.assertEqual(list(ex.map(call, range(4))), [1] * 4)
        self.assertEqual(self.provider.calls(), 1)

    def test_ambiguous_is_not_retried(self):
        self.provider.behavior = 'ambiguous'
        self.assert_refusal(self.owner.get_access, 'uncertain_new_grant_required')
        restored = m.OfflineOwner(self.od, m.FakeProvider(self.pd))
        self.assert_refusal(restored.get_access, 'uncertain_new_grant_required')
        self.assertEqual(self.provider.calls(), 1)

    def test_revoke_and_timeout_fail_closed(self):
        self.provider.behavior = 'revoke'
        self.assert_refusal(self.owner.get_access, 'uncertain_new_grant_required')
        self.provider.behavior = 'ok'
        self.assert_refusal(self.owner.get_access, 'uncertain_new_grant_required')
        self.assertEqual(self.provider.calls(), 1)

    def test_timeout_before_mutation_still_requires_new_grant(self):
        self.provider.behavior = 'timeout'
        self.assert_refusal(self.owner.get_access, 'uncertain_new_grant_required')
        self.provider.behavior = 'ok'
        self.assert_refusal(self.owner.get_access, 'uncertain_new_grant_required')
        self.assertEqual(self.provider.calls(), 1)

    def test_result_commit_failure_blocks_after_restart(self):
        def fault(point):
            if point == 'state.json:replaced':raise OSError('synthetic disk failure')
        self.owner.store.hook = fault
        self.assert_refusal(self.owner.get_access, 'storage_or_durability_unknown')
        # Ready is visible, but pending forbids release in a new object/process.
        ctx = mp.get_context('fork');q=ctx.Queue();barrier=ctx.Barrier(1)
        p=ctx.Process(target=access_process,args=(self.od,self.pd,barrier,q));p.start();p.join(15)
        self.assertEqual(p.exitcode,0);self.assertEqual(q.get(timeout=2),('error','LabRefusal'))
        q.close();q.join_thread();self.assertEqual(self.provider.calls(),1)
        self.assertTrue((self.od/'pending.json').exists())

    def test_intent_failure_does_not_call_provider(self):
        def fault(point):
            if point == 'pending.json:before':raise OSError('unavailable')
        self.owner.store.hook=fault
        self.assert_refusal(self.owner.get_access,'storage_or_durability_unknown')
        self.assertEqual(self.provider.calls(),0)
        self.owner.store.hook=lambda _:None
        self.assertEqual(self.owner.get_access()['generation'],1)

    def test_real_process_death_boundaries(self):
        points=('pending.json:directory_synced','after_provider','state.json:replaced',
                'state.json:directory_synced','committed')
        for i,point in enumerate(points):
            with self.subTest(point=point):
                od=self.root/f'o{i}';pd=self.root/f'p{i}';od.mkdir(mode=0o700);pd.mkdir(mode=0o700)
                provider=m.FakeProvider(pd);owner=m.OfflineOwner(od,provider);owner.initialize(provider.create())
                p=mp.get_context('fork').Process(target=crash_process,args=(od,pd,point));p.start();p.join(15)
                if p.is_alive():p.kill();p.join();self.fail('crash_worker_timeout')
                self.assertEqual(p.exitcode,17)
                if point=='committed':self.assertEqual(owner.get_access()['generation'],1)
                else:self.assert_refusal(owner.get_access,'uncertain_new_grant_required')
                self.assertEqual(provider.calls(),0 if point=='pending.json:directory_synced' else 1)

    def test_unlink_durability_limit_is_explicit(self):
        def fault(point):
            if point=='pending:unlinked':raise OSError('simulated directory fsync failure')
        self.owner.store.hook=fault
        self.assert_refusal(self.owner.get_access,'storage_or_durability_unknown')
        # Documented limit: successor committed before marker removal; no old-token replay.
        restored=m.OfflineOwner(self.od,self.provider)
        self.assertEqual(restored.get_access()['generation'],1)
        self.assertEqual(self.provider.calls(),1)

    def test_private_state_and_sanitized_errors(self):
        out=io.StringIO()
        with contextlib.redirect_stdout(out),contextlib.redirect_stderr(out):
            self.provider.behavior='ambiguous'
            try:self.owner.get_access()
            except m.LabRefusal as e:print(repr(e))
        self.assertFalse(self.grant['access'] in out.getvalue())
        self.assertFalse(self.grant['refresh'] in out.getvalue())
        for p in self.od.iterdir():self.assertEqual(p.stat().st_mode&0o777,0o600)
        self.assertEqual(self.od.stat().st_mode&0o777,0o700)

    def test_access_only_and_no_reset(self):
        r=self.owner.get_access();self.assertEqual(set(r),{'access_token','expires_at','generation'})
        self.assertFalse(hasattr(self.owner,'reset'))
        self.assert_refusal(lambda:self.owner.initialize(self.grant),'already_initialized')

    def test_symlink_alias_and_lock_refused(self):
        link=self.root/'alias';link.symlink_to(self.od,target_is_directory=True)
        self.assert_refusal(lambda:m.OfflineOwner(link,self.provider),'directory_invalid')
        (self.od/'lock').unlink();(self.od/'lock').symlink_to(self.pd/'lock')
        self.assert_refusal(self.owner.get_access,'storage_or_durability_unknown')
        self.assertEqual(self.provider.calls(),0)

    def test_invalid_state_is_not_refreshed(self):
        p=self.od/'state.json';good=p.read_bytes()
        cases=[b'{"schema":1,"schema":1}',b'[]',b'{bad',b'{'*17000]
        original=json.loads(good)
        for field,value in [('generation',True),('expires',10**1000),('expires',float('inf')),('refresh','real-token-is-refused'),('schema',2)]:
            changed={**original,field:value};cases.append(json.dumps(changed).encode())
        for data in cases:
            p.write_bytes(data);self.assert_refusal(self.owner.get_access,'state_invalid')
        self.assertEqual(self.provider.calls(),0)

    def test_clock_boundary_and_expiry_during_response(self):
        self.owner.clock=lambda:self.grant['expires']-31
        self.assertEqual(self.owner.get_access()['generation'],0)
        self.assertEqual(self.provider.calls(),0)
        self.owner.clock=lambda:self.grant['expires']-30
        self.assertEqual(self.owner.get_access()['generation'],1)
        self.assertEqual(self.provider.calls(),1)
        self.owner.clock=lambda:float('nan')
        self.assert_refusal(self.owner.get_access,'clock_invalid')

    def test_huge_clock_and_margin_are_sanitized(self):
        self.owner.clock=lambda:10**1000
        self.assert_refusal(self.owner.get_access,'clock_invalid')
        self.assert_refusal(lambda:m.OfflineOwner(self.od,self.provider,margin=10**1000),'clock_invalid')
        self.assertEqual(self.provider.calls(),0)

    def test_successor_already_expired_is_not_returned(self):
        self.provider.clock=lambda:0
        self.assert_refusal(self.owner.get_access,'access_expired')


if __name__=='__main__':unittest.main()
