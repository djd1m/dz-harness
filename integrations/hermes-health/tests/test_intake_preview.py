"""Synthetic real-CLI acceptance; run inside the pinned runtime, network disabled."""
import concurrent.futures
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('preview_fixture', ROOT / '__init__.py', submodule_search_locations=[str(ROOT)])
pkg = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pkg
spec.loader.exec_module(pkg)
from preview_fixture.health_plugin import HealthTools


def synthetic_pdf():
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
               b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>']
    data = b'%PDF-1.4\n'; offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data)); data += str(i).encode() + b' 0 obj\n' + obj + b'\nendobj\n'
    start = len(data)
    data += b'xref\n0 4\n0000000000 65535 f \n'
    data += b''.join(('%010d 00000 n \n' % n).encode() for n in offsets[1:])
    return data + b'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n' + str(start).encode() + b'\n%%EOF\n'


@unittest.skipUnless(Path('/opt/health-node22/bin/node').is_file(), 'requires pinned health runtime')
class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.map = root / 'medical'; (self.map / 'sources/raw').mkdir(parents=True)
        self.inbox = root / 'inbox'; self.inbox.mkdir()
        self.manifest = self.map / 'sources/manifest.json'
        self.manifest.write_text(json.dumps({'schema': 'ha-intake-manifest-1', 'entries': []}))
        self.pdf = synthetic_pdf(); (self.inbox / 'doc_123_тест.pdf').write_bytes(self.pdf)
        self.tools = HealthTools(self.map, '/opt/health-node22/bin/node', '/opt/health-advisor-runtime')
        self.env = patch.dict(os.environ, {'HEALTH_INBOX': str(self.inbox)})
        self.env.start()

    def tearDown(self):
        self.env.stop(); self.tmp.cleanup()

    def call(self, attachment='doc_123_тест.pdf', **kwargs):
        return self.tools.call('intake_preview', {'attachment': attachment, **kwargs})

    def snapshot(self):
        return {str(p.relative_to(self.tmp.name)): p.read_bytes()
                for p in Path(self.tmp.name).rglob('*') if p.is_file()}

    def add_duplicate(self):
        source = self.map / 'sources/raw/saved.pdf'; source.write_bytes(self.pdf)
        self.manifest.write_text(json.dumps({'schema': 'ha-intake-manifest-1', 'entries': [{
            'entry_id': 'synthetic', 'stored_at': 'sources/raw/saved.pdf',
            'bytes': len(self.pdf), 'sha256': hashlib.sha256(self.pdf).hexdigest()}]}))
        return source

    def archive(self, name, data=b'technical only', info=None):
        with zipfile.ZipFile(self.inbox / 'test.zip', 'w') as z:
            z.writestr(info or name, data)
        return 'test.zip'

    def test_pdf_and_repeat_unchanged(self):
        before = self.snapshot(); a = self.call(); b = self.call()
        self.assertTrue(a['ok'], a); self.assertEqual(a, b)
        self.assertFalse(a['live_write']); self.assertFalse(a['caller_digest_checked'])
        self.assertEqual(a['files'][0]['sha256'], hashlib.sha256(self.pdf).hexdigest())
        self.assertIn('no_full_pdf_structure_validation', a['limitations'])
        self.assertEqual(before, self.snapshot())

    def test_zip_and_duplicate(self):
        self.add_duplicate(); name = self.archive('документ.pdf', self.pdf)
        before = self.snapshot(); r = self.call(name)
        self.assertTrue(r['ok'], r)
        self.assertEqual(r['files'][0]['duplicate_status'], 'verified_exact_match')
        self.assertEqual(before, self.snapshot())

    def test_duplicate_drift(self):
        self.add_duplicate().write_bytes(b'changed')
        self.assertEqual(self.call()['error'], 'duplicate_source_drift')

    def test_expected_hash(self):
        self.assertEqual(self.call(expect_sha256='0' * 64)['error'], 'attachment_digest_mismatch')
        r = self.call(expect_sha256=hashlib.sha256(self.pdf).hexdigest())
        self.assertTrue(r['ok'], r); self.assertTrue(r['caller_digest_checked'])

    def test_paths_and_special_files(self):
        for name in ['../x.pdf', '/etc/a.pdf', '.hidden.pdf', 'a\\x.pdf', 'a\nx.pdf']:
            self.assertEqual(self.call(name)['error'], 'attachment_name_invalid')
        (self.inbox / 'link.pdf').symlink_to(self.inbox / 'doc_123_тест.pdf')
        self.assertFalse(self.call('link.pdf')['ok'])
        os.mkfifo(self.inbox / 'fifo.pdf'); self.assertFalse(self.call('fifo.pdf')['ok'])
        outside = self.inbox.parent / 'alias'; outside.symlink_to(self.inbox)
        with patch.dict(os.environ, {'HEALTH_INBOX': str(outside)}):
            self.assertFalse(self.call()['ok'])

    def test_missing_config_and_unsupported(self):
        with patch.dict(os.environ, {'HEALTH_INBOX': ''}):
            self.assertEqual(self.call()['error'], 'inbox_not_configured')
        self.assertEqual(self.call('file.txt')['error'], 'attachment_type_unsupported')
        self.assertEqual(self.call(extra='x')['error'], 'arguments_invalid')

    def test_pdf_envelope(self):
        (self.inbox / 'bad.pdf').write_bytes(b'not pdf')
        self.assertEqual(self.call('bad.pdf')['error'], 'pdf_envelope_invalid')

    def test_corrupt_and_traversal_archives(self):
        (self.inbox / 'bad.zip').write_bytes(b'not zip')
        self.assertFalse(self.call('bad.zip')['ok'])
        for name in ['../escape.txt', '/absolute.txt']:
            self.archive(name)
            before = self.snapshot(); self.assertFalse(self.call('test.zip')['ok'])
            self.assertEqual(before, self.snapshot())

    def test_archive_symlink(self):
        info = zipfile.ZipInfo('link.txt'); info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.archive('unused', b'/etc/passwd', info=info)
        self.assertFalse(self.call('test.zip')['ok'])

    def test_bomb_and_entry_limit(self):
        with zipfile.ZipFile(self.inbox / 'bomb.zip', 'w', compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('big.txt', b'A' * 1024 * 1024)
        self.assertFalse(self.call('bomb.zip')['ok'])
        with zipfile.ZipFile(self.inbox / 'many.zip', 'w') as z:
            for i in range(101): z.writestr(str(i)+'.txt', b'x')
        self.assertFalse(self.call('many.zip')['ok'])

    def test_input_size_and_change(self):
        with (self.inbox / 'large.pdf').open('wb') as f:
            f.truncate(16 * 1024 * 1024 + 1)
        self.assertEqual(self.call('large.pdf')['error'], 'file_limit_or_type')
        original = HealthTools.read
        count = 0
        def changing(reader, path, **kwargs):
            nonlocal count
            raw = original(reader, path, **kwargs)
            if reader.workspace == self.inbox:
                count += 1
                if count == 2: return raw + b'changed'
            return raw
        with patch.object(HealthTools, 'read', changing):
            self.assertEqual(self.call()['error'], 'attachment_changed_retry')

    def test_manifest_change(self):
        from preview_fixture import intake_preview as module
        run = module.bounded_run
        def changing(argv, **kwargs):
            self.assertNotIn(str(self.map), argv)
            self.assertNotIn(str(self.inbox), argv)
            result = run(argv, **kwargs)
            self.manifest.write_text(self.manifest.read_text() + ' ')
            return result
        with patch.object(module, 'bounded_run', changing):
            self.assertEqual(self.call()['error'], 'catalog_changed_retry')

    def test_encrypted_zip(self):
        self.archive('technical.txt')
        p = self.inbox / 'test.zip'; data = bytearray(p.read_bytes())
        local = data.index(b'PK\x03\x04'); central = data.index(b'PK\x01\x02')
        data[local + 6] |= 1; data[central + 8] |= 1
        p.write_bytes(data)
        self.assertFalse(self.call('test.zip')['ok'])

    def test_actual_gateway_document_cache(self):
        from gateway.platforms.base import cache_document_from_bytes
        # The integration container has no production home mounted.
        with patch.dict(os.environ, {'HERMES_HOME': str(Path(self.tmp.name) / 'test-home')}):
            cached = Path(cache_document_from_bytes(self.pdf, 'технический.pdf'))
        try:
            self.assertTrue(cached.name.startswith('doc_'))
            with patch.dict(os.environ, {'HEALTH_INBOX': str(cached.parent)}):
                r = self.call(cached.name)
            self.assertTrue(r['ok'], r)
            self.assertEqual(r['attachment_sha256'], hashlib.sha256(self.pdf).hexdigest())
        finally:
            cached.unlink()

    def test_parallel_preview(self):
        before = self.snapshot()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            a, b = list(pool.map(lambda _: self.call(), range(2)))
        self.assertTrue(a['ok'], a); self.assertEqual(a, b)
        self.assertEqual(before, self.snapshot())


if __name__ == '__main__':
    unittest.main()
