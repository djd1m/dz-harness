"""Изолированный Linux-прототип: PDF → непроверенный текст, без записи оригинала."""
import argparse
from dataclasses import dataclass
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import sys
import time


@dataclass(frozen=True)
class Limits:
    input_bytes: int = 8 * 1024 * 1024
    pages: int = 50
    output_bytes: int = 1024 * 1024
    seconds: float = 5.0
    memory_bytes: int = 256 * 1024 * 1024

    def validate(self):
        for name in ('input_bytes', 'pages', 'output_bytes', 'memory_bytes'):
            if type(getattr(self, name)) is not int or getattr(self, name) <= 0:
                raise ValueError('Лимиты должны быть положительными целыми числами')
        if not math.isfinite(self.seconds) or self.seconds <= 0:
            raise ValueError('Недопустимый таймаут')
        if self.output_bytes < 1024:
            raise ValueError('Для служебного JSON требуется минимум 1024 байта')


def extract(path, entry_id, expected_sha256, limits=Limits(), python=None):
    limits.validate()
    if not isinstance(entry_id, str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,128}', entry_id):
        raise ValueError('entry_id: 1–128 символов A–Z, a–z, 0–9, точка, подчёркивание, двоеточие, дефис')
    if not re.fullmatch('[a-f0-9]{64}', expected_sha256):
        raise ValueError('Требуется SHA-256 оригинала в нижнем регистре')
    result = dict(schema_version=1, entry_id=entry_id,
                  expected_sha256=expected_sha256, source_sha256=None,
                  engine={'name': 'pypdf', 'version': None}, pages=[],
                  human_review='unverified', derived_status='draft')
    def finish(status, **extra):
        result.update(status=status, **extra)
        if len(json.dumps(result, ensure_ascii=False).encode()) > limits.output_bytes:
            result.update(status='output_limit', pages=[])
        return result
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                return finish('source_error')
            if info.st_size > limits.input_bytes:
                return finish('input_limit')
            data = stream.read(limits.input_bytes + 1)
    except OSError:
        return finish('source_error')
    if len(data) > limits.input_bytes:
        return finish('input_limit')
    result['source_sha256'] = hashlib.sha256(data).hexdigest()
    if result['source_sha256'] != expected_sha256:
        return finish('source_changed')
    # Снимок в анонимной памяти: парсер не получает путь оригинала.
    fd = os.memfd_create('synthetic-pdf-snapshot', os.MFD_CLOEXEC)
    try:
        with os.fdopen(fd, 'w+b') as snapshot:
            snapshot.write(data)
            snapshot.seek(0)
            cmd = [python or sys.executable, '-I', '-B', str(Path(__file__).resolve()),
                   '--worker', json.dumps(limits.__dict__)]
            try:
                process = subprocess.Popen(cmd, stdin=snapshot, stdout=subprocess.PIPE,
                                           stderr=subprocess.DEVNULL, close_fds=True,
                                           env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
            except OSError:
                return finish('engine_unavailable')
            output = bytearray()
            deadline = time.monotonic() + limits.seconds
            try:
                with selectors.DefaultSelector() as selector:
                    selector.register(process.stdout, selectors.EVENT_READ)
                    while True:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            return finish('timeout')
                        if not selector.select(remaining):
                            return finish('timeout')
                        chunk = os.read(process.stdout.fileno(), min(65536, limits.output_bytes + 1 - len(output)))
                        if not chunk:
                            break
                        output.extend(chunk)
                        if len(output) > limits.output_bytes:
                            return finish('output_limit')
                remaining = deadline - time.monotonic()
                try:
                    process.wait(timeout=max(0, remaining))
                except subprocess.TimeoutExpired:
                    return finish('timeout')
                if process.returncode:
                    return finish('resource_limit' if process.returncode < 0 else 'worker_error')
                try:
                    payload = json.loads(output)
                except (ValueError, UnicodeDecodeError):
                    return finish('worker_error')
                return finish(payload.pop('status'), **payload)
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait()
                process.stdout.close()
    except OSError:
        return finish('worker_error')


def render_html(result):
    """Документ остаётся данными, включая инструкции и HTML внутри PDF."""
    return ('<!doctype html><meta charset="utf-8"><h1>Черновик — не проверено человеком</h1>'
            + '<pre>' + html.escape(json.dumps(result, ensure_ascii=False, indent=2)) + '</pre>')


def worker(limits):
    import resource
    import io
    resource.setrlimit(resource.RLIMIT_AS, (limits.memory_bytes, limits.memory_bytes))
    cpu = max(1, math.ceil(limits.seconds))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    result = {'status': 'worker_error', 'pages': []}
    try:
        import pypdf
        result['engine'] = {'name': 'pypdf', 'version': pypdf.__version__}
        if pypdf.__version__ != '7.0.0':
            sys.stdout.write(json.dumps({'status': 'unsupported_engine_version', 'pages': [], 'engine': result['engine']}))
            return
        reader = pypdf.PdfReader(io.BytesIO(sys.stdin.buffer.read(limits.input_bytes + 1)), strict=True)
        if reader.is_encrypted:
            result['status'] = 'encrypted'
        elif len(reader.pages) > limits.pages:
            result['status'] = 'page_limit'
        else:
            pages = []
            total = 0
            for index, page in enumerate(reader.pages, 1):
                text = page.extract_text() or ''
                total += len(text.encode('utf-8'))
                if total > limits.output_bytes:
                    result['status'] = 'output_limit'
                    break
                pages.append({'number': index, 'text': text, 'text_status': 'text' if text.strip() else 'no_text'})
            else:
                nonempty = sum(bool(p['text'].strip()) for p in pages)
                status = 'no_text' if not nonempty else ('ok' if nonempty == len(pages) else 'partial_text')
                result.update(status=status, pages=pages)
    except ImportError:
        result['status'] = 'engine_unavailable'
    except MemoryError:
        result.update(status='resource_limit', pages=[])
    except Exception:
        result.update(status='invalid_pdf', pages=[])
    raw = json.dumps(result, ensure_ascii=False).encode('utf-8')
    if len(raw) > limits.output_bytes:
        result.update(status='output_limit', pages=[])
        raw = json.dumps(result, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(raw)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--worker':
        worker(Limits(**json.loads(sys.argv[2])))
    else:
        parser = argparse.ArgumentParser(description='Изолированное извлечение текста синтетического PDF')
        parser.add_argument('path')
        parser.add_argument('--entry-id', required=True)
        parser.add_argument('--sha256', required=True)
        args = parser.parse_args()
        print(json.dumps(extract(args.path, args.entry_id, args.sha256), ensure_ascii=False))
