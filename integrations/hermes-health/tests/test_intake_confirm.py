"""Synthetic confirmed intake against real core and real Hermes ContextVars; offline only."""
import concurrent.futures
from contextvars import copy_context
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('confirm_fixture', ROOT / '__init__.py', submodule_search_locations=[str(ROOT)])
pkg = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pkg
spec.loader.exec_module(pkg)
from confirm_fixture.health_plugin import HealthTools
from confirm_fixture import intake_confirm as m
from test_intake_preview import synthetic_pdf

try:
    from gateway import session_context as context
except ImportError:
    context = None


@unittest.skipUnless(context and Path('/opt/health-node22/bin/node').is_file(), 'requires pinned Hermes/core runtime')
class ConfirmTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.map = self.root / 'medical'
        (self.map / 'sources/raw').mkdir(parents=True)
        self.manifest = self.map / 'sources/manifest.json'
        self.manifest.write_text(json.dumps({'schema': 'ha-intake-manifest-1', 'entries': []}))
        self.original_manifest = self.manifest.read_bytes()
        self.inbox = self.root / 'inbox'; self.inbox.mkdir()
        self.pdf = synthetic_pdf()
        (self.inbox / 'technical.pdf').write_bytes(self.pdf)
        self.state = self.root / 'state'
        self.env = patch.dict(os.environ, {'HEALTH_WORKSPACE': str(self.map), 'HEALTH_INBOX': str(self.inbox),
                              'HEALTH_INTAKE_STATE': str(self.state), 'HEALTH_INTAKE_WRITE_ENABLED': '1',
                              'HEALTH_NODE': '/opt/health-node22/bin/node', 'HEALTH_RUNTIME': '/opt/health-advisor-runtime'})
        self.env.start()
        self.bind()
        self.tools = HealthTools.configured()

    def tearDown(self):
        context.reset_session_vars()
        self.env.stop(); self.tmp.cleanup()

    def bind(self, **kwargs):
        values = {'platform': 'mattermost', 'user_id': 'synthetic-user', 'chat_id': 'synthetic-chat', 'profile': 'synthetic-health'}
        values.update(kwargs)
        context.set_session_vars(**values)

    def prepare(self, name='technical.pdf', **kwargs):
        return self.tools.call('intake_prepare', {'attachment': name, **kwargs})

    def receipt(self):
        result = self.prepare()
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['mode'], 'prepared_not_committed')
        return result['receipt_id']

    def command(self, ident, action='confirm'):
        return json.loads(m.command_handler(action)(ident))

    def test_real_confirm_replay_and_persistent_state(self):
        ident = self.receipt()
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)
        result = self.command(ident)
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['state'], 'committed')
        self.assertFalse(result['ocr_performed']); self.assertFalse(result['index_updated'])
        self.assertEqual(len(self.tools.catalog()), 1)
        self.assertEqual(self.tools.read(result['sources'][0]['stored_at']), self.pdf)
        manifest = self.manifest.read_bytes()
        # New Store object each time: only persisted receipt is authoritative.
        self.assertTrue(self.command(ident)['replayed'])
        self.assertEqual(self.manifest.read_bytes(), manifest)
        self.assertEqual(self.command(ident, 'status')['state'], 'committed')
        self.assertEqual(self.state.stat().st_mode & 0o777, 0o700)
        for file in self.state.iterdir():
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)

    def test_missing_context_cannot_borrow_environment(self):
        ident = self.receipt()
        context.reset_session_vars()
        with patch.dict(os.environ, {'HERMES_SESSION_PLATFORM': 'mattermost', 'HERMES_SESSION_USER_ID': 'synthetic-user',
                                    'HERMES_SESSION_CHAT_ID': 'synthetic-chat', 'HERMES_SESSION_PROFILE': 'synthetic-health'}):
            self.assertEqual(self.command(ident)['error'], 'trusted_gateway_identity_required')
            self.assertFalse(self.prepare()['ok'])
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_different_identity_and_cron_denied(self):
        ident = self.receipt()
        for field in ('user_id', 'chat_id', 'profile', 'platform'):
            with self.subTest(field=field):
                self.bind(**{field: 'other'})
                self.assertFalse(self.command(ident)['ok'])
        self.bind(cron_session='1')
        self.assertEqual(self.command(ident)['error'], 'cron_confirmation_denied')
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_expired_receipt(self):
        ident = self.receipt()
        with m.state_store(self.tools) as store:
            receipt = store.load(ident); receipt['expires_at'] = 0; store.save(receipt)
        self.assertEqual(self.command(ident)['error'], 'receipt_expired')
        self.assertEqual(self.command(ident, 'status')['state'], 'expired')
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_cancelled_receipt(self):
        ident = self.receipt()
        self.assertEqual(self.command(ident, 'cancel')['state'], 'cancelled')
        self.assertEqual(self.command(ident)['error'], 'receipt_cancelled')
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_write_opt_in_and_unknown_model_boolean(self):
        ident = self.receipt()
        with patch.dict(os.environ, {'HEALTH_INTAKE_WRITE_ENABLED': '0'}):
            self.assertEqual(self.command(ident)['error'], 'intake_write_disabled')
        self.assertEqual(self.prepare(confirmed=True)['error'], 'arguments_invalid')
        self.assertFalse(self.tools.call('confirm', {'receipt_id': ident})['ok'])
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_receipt_hmac_corruption(self):
        ident = self.receipt()
        path = self.state / (ident + '.receipt.json')
        envelope = json.loads(path.read_text()); envelope['payload']['owner']['user_id'] = 'attacker'
        path.write_text(json.dumps(envelope))
        self.assertEqual(self.command(ident)['error'], 'receipt_integrity_mismatch')
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_blob_corruption_or_symlink(self):
        for suffix in ('.zip', '.original'):
            with self.subTest(suffix=suffix):
                ident = self.receipt(); file = self.state / (ident + suffix)
                file.write_bytes(b'corrupt')
                self.assertEqual(self.command(ident)['error'], 'prepared_blob_drift')
        ident = self.receipt(); file = self.state / (ident + '.zip')
        file.unlink(); file.symlink_to(self.inbox / 'technical.pdf')
        self.assertFalse(self.command(ident)['ok'])
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_manifest_drift_before_commit(self):
        ident = self.receipt()
        self.manifest.write_bytes(self.original_manifest + b'\n')
        self.assertEqual(self.command(ident)['error'], 'catalog_changed_prepare_again')
        self.assertEqual(len(self.tools.catalog()), 0)

    def test_committed_source_corruption_replay_refused(self):
        ident = self.receipt(); result = self.command(ident); self.assertTrue(result['ok'], result)
        source = self.map / result['sources'][0]['stored_at']
        source.write_bytes(b'X' * len(self.pdf))
        self.assertEqual(self.command(ident)['error'], 'committed_source_drift')
        self.assertEqual(len(self.tools.catalog()), 1)

    def test_renamed_pdf_exact_duplicate_no_receipt(self):
        ident = self.receipt(); self.assertTrue(self.command(ident)['ok'])
        (self.inbox / 'renamed.pdf').write_bytes(self.pdf)
        before = self.manifest.read_bytes()
        result = self.prepare('renamed.pdf')
        self.assertTrue(result['ok'], result); self.assertEqual(result['mode'], 'duplicate_noop')
        self.assertFalse(result['receipt_created'])
        self.assertEqual(self.manifest.read_bytes(), before)

    def test_stable_archive_independent_of_filename(self):
        a = self.receipt()
        (self.inbox / 'renamed.pdf').write_bytes(self.pdf)
        b = self.prepare('renamed.pdf')['receipt_id']
        self.assertEqual((self.state / (a + '.zip')).read_bytes(), (self.state / (b + '.zip')).read_bytes())

    def test_mixed_archive_rejected(self):
        ident = self.receipt(); self.assertTrue(self.command(ident)['ok'])
        with zipfile.ZipFile(self.inbox / 'mixed.zip', 'w') as archive:
            archive.writestr('renamed.pdf', self.pdf)
            archive.writestr('new.txt', 'TECHNICAL DOCUMENT, NO MEDICAL CONTENT')
        before = self.manifest.read_bytes()
        self.assertEqual(self.prepare('mixed.zip')['error'], 'mixed_duplicate_archive')
        self.assertEqual(self.manifest.read_bytes(), before)

    def test_logical_path_conflict(self):
        def archive(data):
            with zipfile.ZipFile(self.inbox / 'same.zip', 'w') as z:
                z.writestr('same.txt', data)
        archive('FIRST TECHNICAL DOCUMENT')
        first = self.prepare('same.zip'); self.assertTrue(first['ok'], first)
        self.assertTrue(self.command(first['receipt_id'])['ok'])
        archive('SECOND TECHNICAL DOCUMENT')
        self.assertEqual(self.prepare('same.zip')['error'], 'logical_path_conflict')

    def test_after_commit_lost_response_never_automatically_retries(self):
        ident = self.receipt()
        real = m.core_run
        def lost_response(tools, args, store):
            result = real(tools, args, store)
            if '--file' in args:
                raise RuntimeError('simulated lost response after real write')
            return result
        with patch.object(m, 'core_run', side_effect=lost_response):
            self.assertEqual(self.command(ident)['error'], 'reconciliation_required_no_automatic_retry')
        self.assertEqual(len(self.tools.catalog()), 1)
        before = self.manifest.read_bytes()
        self.assertEqual(self.command(ident)['error'], 'receipt_reconciliation_required')
        self.assertEqual(self.manifest.read_bytes(), before)

    def test_restart_at_committing_requires_reconciliation(self):
        ident = self.receipt()
        with m.state_store(self.tools) as store:
            receipt = store.load(ident); receipt['state'] = 'committing'; store.save(receipt)
        self.assertEqual(self.command(ident, 'status')['state'], 'reconciliation_required')
        self.assertEqual(self.command(ident)['error'], 'receipt_reconciliation_required')
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_concurrent_confirm_single_write(self):
        ident = self.receipt()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(copy_context().run, self.command, ident) for _ in range(2)]
            results = [f.result() for f in futures]
        self.assertTrue(any(r['ok'] for r in results), results)
        self.assertEqual(len(self.tools.catalog()), 1)
        self.assertTrue(self.command(ident)['replayed'])

    def test_quota_symlink_and_map_state_refused(self):
        with patch.object(m, 'MAX_RECEIPTS', 0):
            self.assertEqual(self.prepare()['error'], 'state_quota_exceeded_operator_cleanup_required')
        with patch.dict(os.environ, {'HEALTH_INTAKE_STATE': str(self.map / 'state')}):
            self.assertEqual(self.prepare()['error'], 'state_must_be_separate_from_map')
        link = self.root / 'link'; link.symlink_to(self.state, target_is_directory=True)
        with patch.dict(os.environ, {'HEALTH_INTAKE_STATE': str(link)}):
            self.assertFalse(self.prepare()['ok'])

    def test_real_mattermost_event_gateway_dispatch_no_llm(self):
        import asyncio
        from types import MethodType, SimpleNamespace
        from gateway.config import GatewayConfig, PlatformConfig
        from gateway.run import GatewayRunner
        from gateway.run_inbound import GatewayInboundMixin
        from gateway.platforms.event import MessageType
        adapter_spec = importlib.util.spec_from_file_location('mm_transport_fixture', '/opt/hermes/plugins/platforms/mattermost/adapter.py')
        adapter_module = importlib.util.module_from_spec(adapter_spec)
        adapter_spec.loader.exec_module(adapter_module)
        ident = self.receipt()
        received = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            runner = SimpleNamespace(_draining=False, config=GatewayConfig(), adapters={},
                                     _hm_quick_commands=lambda: {}, _session_key_for_source=lambda source: 'test-session',
                                     _get_executor=lambda: pool)
            for name in ('_set_session_env', '_clear_session_env', '_session_env_scope', '_run_in_executor_with_context'):
                setattr(runner, name, MethodType(getattr(GatewayRunner, name), runner))
            async def inbound(event):
                self.assertEqual(event.message_type, MessageType.COMMAND)
                self.assertEqual(event.source.user_id, 'synthetic-user')
                handled, response, command = await GatewayInboundMixin._hm_dispatch_quick_and_plugin_commands(
                    runner, event, event.source, event.get_command())
                self.assertTrue(handled, 'command must not fall through to LLM')
                received.append(json.loads(response))
            adapter = adapter_module.MattermostAdapter(PlatformConfig())
            adapter._owner_profile = 'synthetic-health'
            adapter._bot_user_id = 'synthetic-bot'
            adapter.handle_message = inbound
            event = {'event': 'posted', 'data': {'channel_type': 'D', 'post': json.dumps({
                'id': 'synthetic-post', 'user_id': 'synthetic-user', 'channel_id': 'synthetic-chat',
                'message': ' /health-confirm ' + ident, 'file_ids': []})}}
            context.reset_session_vars()
            with patch('hermes_cli.plugins.get_plugin_command_handler', side_effect=lambda name: m.command_handler('confirm') if name == 'health-confirm' else None):
                asyncio.run(adapter._handle_ws_event(event))
        self.assertEqual(len(received), 1)
        self.assertTrue(received[0]['ok'], received)
        self.assertEqual(len(self.tools.catalog()), 1)

    def test_changed_inbox_does_not_change_frozen_document(self):
        ident = self.receipt()
        (self.inbox / 'technical.pdf').write_bytes(b'NOT THE ORIGINAL')
        result = self.command(ident)
        self.assertTrue(result['ok'], result)
        self.assertEqual(self.tools.read(result['sources'][0]['stored_at']), self.pdf)

    def test_preexisting_orphan_refused_before_write(self):
        ident = self.receipt()
        (self.map / 'sources/raw/orphan.txt').write_text('TECHNICAL ORPHAN')
        result = self.command(ident)
        self.assertFalse(result['ok'], result)
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)
        self.assertEqual(self.command(ident, 'status')['state'], 'prepared')

    def test_old_core_capability_refused(self):
        ident = self.receipt()
        real = m.core_run
        def old_capability(tools, args, store):
            if '--capabilities' in args:
                return {'ok': True, 'capabilities': []}
            return real(tools, args, store)
        with patch.object(m, 'core_run', side_effect=old_capability):
            self.assertEqual(self.command(ident)['error'], 'core_write_contract_unavailable')
        self.assertEqual(self.manifest.read_bytes(), self.original_manifest)

    def test_bad_command_does_not_raise_through_gateway(self):
        self.assertFalse(json.loads(m.command_handler('confirm')('../path'))['ok'])
        self.assertFalse(json.loads(m.command_handler('confirm')('a' * 48))['ok'])
        self.assertFalse(json.loads(m.command_handler('confirm')(None))['ok'])


if __name__ == '__main__':
    unittest.main()
