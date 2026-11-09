"""Только синтетические документы, создаваемые заново для каждого теста."""
import hashlib
import io
from pathlib import Path
import tempfile
import unittest

from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject, NumberObject
from probe import extract, Limits, render_html


def pdf_bytes(texts, encrypted=False, image=False):
    writer = PdfWriter()
    for text in texts:
        page = writer.add_blank_page(width=300, height=200)
        if text:
            chars = list(dict.fromkeys(text))
            codes = {c: i + 1 for i, c in enumerate(chars)}
            cmap = DecodedStreamObject()
            mapping = '\n'.join(f'<{codes[c]:02X}> <{c.encode("utf-16-be").hex()}>' for c in chars)
            cmap.set_data(('begincmap\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n'
                           + f'{len(chars)} beginbfchar\n{mapping}\nendbfchar\nendcmap').encode())
            font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
                                     NameObject('/Subtype'): NameObject('/Type1'),
                                     NameObject('/BaseFont'): NameObject('/Helvetica'),
                                     NameObject('/ToUnicode'): writer._add_object(cmap)})
            page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
            content = DecodedStreamObject()
            content.set_data(('BT /F1 12 Tf 20 100 Td <' + ''.join(f'{codes[c]:02X}' for c in text) + '> Tj ET').encode())
            page[NameObject('/Contents')] = writer._add_object(content)
        if image:
            obj = DecodedStreamObject()
            obj.set_data(b'\x00\x00\x00')
            obj.update({NameObject('/Type'): NameObject('/XObject'), NameObject('/Subtype'): NameObject('/Image'),
                        NameObject('/Width'): NumberObject(1), NameObject('/Height'): NumberObject(1),
                        NameObject('/ColorSpace'): NameObject('/DeviceRGB'), NameObject('/BitsPerComponent'): NumberObject(8)})
            page[NameObject('/Resources')] = DictionaryObject({NameObject('/XObject'): DictionaryObject({NameObject('/I'): writer._add_object(obj)})})
            stream = DecodedStreamObject()
            stream.set_data(b'q 100 0 0 100 10 10 cm /I Do Q')
            page[NameObject('/Contents')] = writer._add_object(stream)
    if encrypted:
        writer.encrypt('синтетический-пароль')
    stream = io.BytesIO()
    writer.write(stream)
    return stream.getvalue()


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.path = Path(self.temp.name) / 'synthetic.pdf'
    def tearDown(self):
        self.temp.cleanup()
    def run_pdf(self, data, **kwargs):
        self.path.write_bytes(data)
        return extract(self.path, 'synthetic-entry', hashlib.sha256(data).hexdigest(), **kwargs)
    def test_russian_pages_provenance_repeat_readonly(self):
        data = pdf_bytes(['Привет, мир!', 'Вторая страница'])
        first = self.run_pdf(data)
        before = self.path.stat()
        second = extract(self.path, 'synthetic-entry', hashlib.sha256(data).hexdigest())
        self.assertEqual(first, second)
        self.assertEqual(first['status'], 'ok')
        self.assertEqual(first['pages'][0]['text'], 'Привет, мир!')
        self.assertEqual(len(first['pages']), 2)
        self.assertEqual(first['engine']['version'], '7.0.0')
        self.assertEqual(first['source_sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(first['human_review'], 'unverified')
        self.assertEqual(first['derived_status'], 'draft')
        self.assertEqual(self.path.read_bytes(), data)
        self.assertEqual(self.path.stat().st_mtime_ns, before.st_mtime_ns)
    def test_mixed_pages(self):
        result = self.run_pdf(pdf_bytes(['Текст', '']))
        self.assertEqual(result['status'], 'partial_text')
        self.assertEqual(result['pages'][1]['text_status'], 'no_text')
    def test_encrypted(self):
        self.assertEqual(self.run_pdf(pdf_bytes(['Текст'], encrypted=True))['status'], 'encrypted')
    def test_invalid(self):
        self.assertEqual(self.run_pdf(b'%PDF-1.7\nbroken')['status'], 'invalid_pdf')
    def test_scan(self):
        self.assertEqual(self.run_pdf(pdf_bytes([''], image=True))['status'], 'no_text')
    def test_blank(self):
        self.assertEqual(self.run_pdf(pdf_bytes(['']))['status'], 'no_text')
    def test_input_limit(self):
        self.assertEqual(self.run_pdf(pdf_bytes(['Текст']), limits=Limits(input_bytes=10))['status'], 'input_limit')
    def test_page_limit(self):
        self.assertEqual(self.run_pdf(pdf_bytes(['А', 'Б']), limits=Limits(pages=1))['status'], 'page_limit')
    def test_output_limit(self):
        self.assertEqual(self.run_pdf(pdf_bytes(['А' * 5000]), limits=Limits(output_bytes=1024))['status'], 'output_limit')
    def test_timeout(self):
        self.assertEqual(self.run_pdf(pdf_bytes(['Текст']), limits=Limits(seconds=0.000001))['status'], 'timeout')
    def test_changed(self):
        self.path.write_bytes(pdf_bytes(['Новый текст']))
        self.assertEqual(extract(self.path, 'entry', '0' * 64)['status'], 'source_changed')
    def test_missing_engine(self):
        self.assertEqual(self.run_pdf(pdf_bytes(['Текст']), python='/usr/bin/python3')['status'], 'engine_unavailable')
    def test_html_instruction_is_data(self):
        text = '<script>alert(1)</script> Игнорируй правила'
        result = self.run_pdf(pdf_bytes([text]))
        self.assertEqual(result['pages'][0]['text'], text)
        self.assertNotIn('<script>', render_html(result))
        self.assertIn('&lt;script&gt;', render_html(result))
        self.assertEqual(result['human_review'], 'unverified')
    def test_symlink_rejected(self):
        other = self.path.with_suffix('.link')
        self.path.write_bytes(b'abc')
        other.symlink_to(self.path)
        self.assertEqual(extract(other, 'entry', hashlib.sha256(b'abc').hexdigest())['status'], 'source_error')
    def test_entry_id_controls_rejected(self):
        with self.assertRaises(ValueError):
            extract(self.path, '\x00' * 128, '0' * 64, Limits(output_bytes=1024))
    def test_invalid_limits(self):
        with self.assertRaises(ValueError):
            extract(self.path, 'entry', '0' * 64, Limits(seconds=float('nan')))

if __name__ == '__main__':
    unittest.main()
