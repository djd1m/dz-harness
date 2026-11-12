"""Synthetic adapter contracts; no patient data or real parser required."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import struct
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pdf_fixture', ROOT / '__init__.py', submodule_search_locations=[str(ROOT)])
pkg = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pkg
spec.loader.exec_module(pkg)
from pdf_fixture.health_plugin import HealthTools
from pdf_fixture import pdf_draft as m


def reply(text='Synthetic text'):
    return {'status': 'ok', 'engine': {'name': 'pypdf', 'version': '7.0.0'},
            'pages': [{'number': 1, 'text': text, 'text_status': 'text'}]}


class PdfDraftTests(unittest.TestCase):
    def setUp(self):
        fixture_parent = Path(os.environ.get('HEALTH_TEST_TMP', '/tmp'))
        self.assertTrue(fixture_parent.is_absolute() and fixture_parent.is_dir(),
                        'Test infrastructure: HEALTH_TEST_TMP must be an existing absolute directory outside Git')
        for ancestor in (fixture_parent.resolve(), *fixture_parent.resolve().parents):
            self.assertFalse(os.path.lexists(ancestor / '.git'),
                             f'Test infrastructure: {ancestor}/.git blocks private drafts; '
                             'set HEALTH_TEST_TMP to a writable directory outside Git')
        self.tmp = tempfile.TemporaryDirectory(dir=fixture_parent)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.map = self.root / 'map'
        (self.map / 'sources/raw').mkdir(parents=True)
        self.pdf = self.map / 'sources/raw/technical.pdf'
        self.raw = b'%PDF-1.4\nsynthetic only'
        self.pdf.write_bytes(self.raw)
        self.row = {'entry_id': 'synthetic', 'stored_at': 'sources/raw/technical.pdf',
                    'bytes': len(self.raw), 'sha256': hashlib.sha256(self.raw).hexdigest()}
        self.manifest()
        self.drafts = self.root / 'drafts'
        self.drafts.mkdir(mode=0o700)
        self.env = patch.dict(os.environ, HEALTH_DRAFTS=str(self.drafts))
        self.env.start()
        self.addCleanup(self.env.stop)
        self.tools = HealthTools(self.map, '/unused/node', '/unused/runtime')
        # Prove the complete write path before every negative test, then reset artifacts.
        baseline = self.call()
        self.assertTrue(baseline.get('ok'), f'Test infrastructure: valid draft baseline failed: {baseline}')
        self.assertEqual(len(baseline['artifacts']), 2)
        for artifact in baseline['artifacts']:
            Path(artifact['path']).unlink()
        Path(baseline['artifacts'][0]['path']).parent.rmdir()
        (self.drafts / '.draft.lock').unlink()

    def manifest(self):
        (self.map / 'sources/manifest.json').write_text(json.dumps({'schema': 'ha-intake-manifest-1', 'entries': [self.row]}))

    def call(self, value=None, args=None):
        with patch.object(m, 'broker_request', return_value=reply() if value is None else value):
            return self.tools.call('pdf_draft', {'entry_id': 'synthetic'} if args is None else args)

    def test_safe_artifacts_and_never_overwrite(self):
        hostile = '<script>alert(1)</script>\n```\n[click](https://example.invalid)\n````'
        result = self.call(reply(hostile))
        self.assertTrue(result['ok'])
        self.assertEqual(result['human_verification'], 'not_established')
        self.assertEqual(result['sha256'], self.row['sha256'])
        paths = [Path(a['path']) for a in result['artifacts']]
        for path, artifact in zip(paths, result['artifacts']):
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), artifact['sha256'])
        self.assertIn('\n`````\n', paths[0].read_text())
        page = paths[1].read_text()
        self.assertNotIn('<script>', page)
        self.assertIn('&lt;script&gt;', page)
        self.assertIn("default-src 'none'", page)
        self.assertNotEqual(result['artifacts'], self.call()['artifacts'])

    def test_arguments_and_integrity_preparse(self):
        for args, error in (({'entry_id':'synthetic', 'path':'/etc/passwd'}, 'arguments_invalid'),
                            ({'entry_id':'synthetic', 'sha256':'a'*64}, 'arguments_invalid'),
                            ({'entry_id':'../foo'}, 'source_not_found'), ({}, 'arguments_invalid')):
            self.assertEqual(self.call(args=args), {'ok': False, 'error': error})
        self.pdf.write_bytes(b'changed')
        with patch.object(m, 'broker_request') as broker:
            self.assertEqual(self.tools.call('pdf_draft', {'entry_id':'synthetic'}),
                             {'ok': False, 'error': 'source_integrity_mismatch'})
            broker.assert_not_called()

    def test_original_drift(self):
        def changed(raw):
            self.pdf.write_bytes(b'changed')
            return reply()
        with patch.object(m, 'broker_request', side_effect=changed):
            self.assertEqual(self.tools.call('pdf_draft', {'entry_id':'synthetic'})['error'], 'source_changed_during_parse')
        self.assertEqual(list(self.drafts.iterdir()), [])

    def test_bad_schema(self):
        variants=[]
        for key, value in [('provenance', 'trusted'), ('engine', {'name':'pypdf','version':'8.0.0'}), ('status','partial_text')]:
            item=reply(); item[key]=value; variants.append(item)
        for key,value in [('number',True), ('number',2), ('text_status','verified'), ('text','x'*100001), ('text','\ud800')]:
            item=reply(); item['pages'][0][key]=value; variants.append(item)
        item=reply(); item['pages'] *= 51; variants.append(item)
        for item in variants:
            self.assertEqual(self.call(item), {'ok': False, 'error': 'pdf_broker_schema'})
        self.assertEqual(list(self.drafts.iterdir()), [])

    def test_no_text_errors_partial(self):
        for status in sorted(m.FAILURES | {'no_text'}):
            item=reply(); item.update(status=status,pages=[])
            result=self.call(item)
            self.assertEqual(result['status'],status)
            self.assertEqual(result['artifacts'],[])
        item=reply(); item['pages'].append({'number':2,'text':'','text_status':'no_text'}); item['status']='partial_text'
        self.assertEqual(self.call(item)['status'], 'partial_text')

    def test_unsafe_draft_directories(self):
        self.drafts.chmod(0o755)
        self.assertEqual(self.call(), {'ok': False, 'error': 'drafts_not_private'})
        self.drafts.chmod(0o700)
        link=self.root/'link'; link.symlink_to(self.drafts, target_is_directory=True)
        cases=[(link, 'unavailable_or_invalid_source'), (self.map, 'drafts_inside_workspace'),
               (self.root/'x'/'..'/'drafts', 'drafts_configuration_invalid')]
        git=self.root/'repository'; git.mkdir(); (git/'.git').write_text('gitdir: /somewhere')
        inside=git/'drafts'; inside.mkdir(mode=0o700); cases.append((inside, 'drafts_inside_git'))
        for path, error in cases:
            with patch.dict(os.environ, HEALTH_DRAFTS=str(path)):
                self.assertEqual(self.call(), {'ok': False, 'error': error})
        self.assertEqual(list(self.drafts.iterdir()), [])

    def test_source_traversal_symlink_suffix_size(self):
        for path, error in (('sources/raw/../../outside.pdf', 'path_denied'),
                            ('sources/raw/technical.txt', 'pdf_type_or_size')):
            self.row['stored_at']=path; self.manifest()
            self.assertEqual(self.call(), {'ok': False, 'error': error})
        self.row['stored_at']='sources/raw/technical.pdf'
        self.row['bytes']=m.MAX_PDF+1; self.manifest()
        self.assertEqual(self.call(), {'ok': False, 'error': 'pdf_type_or_size'})
        self.row['bytes']=len(self.raw); self.manifest()
        self.pdf.unlink(); self.pdf.symlink_to('/etc/passwd')
        self.assertEqual(self.call(), {'ok': False, 'error': 'unavailable_or_invalid_source'})

    def test_quota_and_lock(self):
        import fcntl
        for index in range(100):
            (self.drafts / str(index)).mkdir(mode=0o700)
        self.assertEqual(self.call()['error'], 'drafts_quota_exceeded')
        for index in range(100):
            (self.drafts / str(index)).rmdir()
        with (self.drafts / '.draft.lock').open('r+') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.call()['error'], 'drafts_busy_retry')

    def test_deterministic_collision_preserves_existing_files(self):
        with patch.object(m.secrets, 'token_hex', return_value='a' * 32):
            original = self.call()
            self.assertTrue(original['ok'], original)
            before = {Path(a['path']): Path(a['path']).read_bytes() for a in original['artifacts']}
            result = self.call(reply('must not overwrite original'))
        self.assertEqual(result, {'ok': False, 'error': 'unavailable_or_invalid_source'})
        self.assertEqual(before, {path: path.read_bytes() for path in before})
        self.assertEqual(set(self.drafts.iterdir()),
                         {next(iter(before)).parent, self.drafts / '.draft.lock'})

    def test_fsync_failures_clean_up_all_artifacts(self):
        real_fsync = m.os.fsync
        for failure_at in range(1, 5):
            calls = []
            def fail_at(fd):
                calls.append(fd)
                if len(calls) == failure_at:
                    raise OSError('synthetic fsync failure')
                return real_fsync(fd)
            with self.subTest(failure_at=failure_at), patch.object(m.os, 'fsync', side_effect=fail_at):
                self.assertEqual(self.call(), {'ok': False, 'error': 'unavailable_or_invalid_source'})
            self.assertEqual(len(calls), failure_at)
            self.assertEqual(list(self.drafts.iterdir()), [self.drafts / '.draft.lock'])

    def test_partial_file_write_failure_cleans_up_and_preserves_existing(self):
        original = self.call()
        self.assertTrue(original['ok'], original)
        before = {Path(a['path']): Path(a['path']).read_bytes() for a in original['artifacts']}
        real_fdopen = m.os.fdopen
        attempted = []
        class PartialWriter:
            def __init__(self, stream):
                self.stream = stream
            def __enter__(self):
                return self
            def __exit__(self, *args):
                self.stream.close()
            def write(self, data):
                self.stream.write(data[:7])
                self.stream.flush()
                attempted.append(len(data[:7]))
                raise OSError('synthetic partial write failure')
        def fdopen(fd, mode='r', *args, **kwargs):
            stream = real_fdopen(fd, mode, *args, **kwargs)
            return PartialWriter(stream) if mode == 'wb' else stream
        with patch.object(m.os, 'fdopen', side_effect=fdopen):
            result = self.call()
        self.assertEqual(result, {'ok': False, 'error': 'unavailable_or_invalid_source'})
        self.assertEqual(attempted, [7])
        self.assertEqual(before, {path: path.read_bytes() for path in before})
        self.assertEqual(set(self.drafts.iterdir()),
                         {next(iter(before)).parent, self.drafts / '.draft.lock'})

    def test_real_socket_framing(self):
        address=str(self.root/'broker.sock')
        server=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); server.bind(address); server.listen(1)
        seen=[]
        def serve():
            with server:
                conn,_=server.accept()
                with conn:
                    size=struct.unpack('!I', conn.recv(4))[0]
                    data=b''
                    while len(data)<size:
                        data+=conn.recv(size-len(data))
                    seen.append(data)
                    payload=json.dumps(reply()).encode()
                    frame=struct.pack('!I',len(payload))+payload
                    for byte in frame:
                        conn.sendall(bytes([byte]))
        thread=threading.Thread(target=serve); thread.start()
        with patch.dict(os.environ,HEALTH_PDF_SOCKET=address):
            self.assertEqual(m.broker_request(self.raw), reply())
        thread.join(2)
        self.assertFalse(thread.is_alive())
        self.assertEqual(seen,[self.raw])


if __name__ == '__main__':
    unittest.main()
