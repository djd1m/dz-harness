"""Bounded, read-only Hermes adapter. Never treats document text as instructions."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shlex
import signal
import sqlite3
import stat
import subprocess
import tempfile
import time

MAX_FILE = 32 * 1024 * 1024
MAX_OUTPUT = 2 * 1024 * 1024
ROOTS = {'sources', 'recognized', 'analysis', 'research', 'doctors', 'case', 'wiki', 'context'}


class Refusal(Exception):
    pass


def bounded_run(argv, *, env, timeout=25, limit=MAX_OUTPUT):
    """Bound both pipes while running; kill the process group on timeout/overflow."""
    p = subprocess.Popen(argv, env=env, stdin=subprocess.DEVNULL,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    out = bytearray()
    total = 0
    deadline = time.monotonic() + timeout
    try:
        with selectors.DefaultSelector() as sel:
            sel.register(p.stdout, selectors.EVENT_READ)
            sel.register(p.stderr, selectors.EVENT_READ)
            while sel.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise Refusal('runtime_timeout')
                for key, _ in sel.select(min(remaining, .1)):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        sel.unregister(key.fileobj)
                        continue
                    total += len(chunk)
                    if total > limit:
                        raise Refusal('runtime_output_limit')
                    if key.fileobj is p.stdout:
                        out.extend(chunk)
        p.wait(timeout=max(.01, deadline - time.monotonic()))
        if p.returncode:
            raise Refusal('runtime_failed')
        return bytes(out)
    except subprocess.TimeoutExpired:
        raise Refusal('runtime_timeout') from None
    finally:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        p.wait()
        p.stdout.close()
        p.stderr.close()


class HealthTools:
    def __init__(self, workspace, node, runtime):
        self.workspace = Path(workspace)
        self.node = Path(node)
        self.runtime = Path(runtime)
        if not self.workspace.is_absolute() or not self.node.is_absolute() or not self.runtime.is_absolute():
            raise Refusal('configuration_requires_absolute_paths')

    @classmethod
    def configured(cls):
        workspace = os.environ.get('HEALTH_WORKSPACE')
        if not workspace:
            raise Refusal('workspace_not_configured')
        return cls(workspace, os.environ.get('HEALTH_NODE', '/opt/health-node22/bin/node'),
                   os.environ.get('HEALTH_RUNTIME', '/opt/health-advisor-runtime'))

    def read(self, relative, *, internal=False, limit=MAX_FILE):
        if not isinstance(relative, str) or '\\' in relative:
            raise Refusal('path_denied')
        parts = relative.split('/')
        if any(not x or x in {'.', '..'} or ('\x00' in x) for x in parts):
            raise Refusal('path_denied')
        if not internal and (parts[0] not in ROOTS or any(x.startswith('.') for x in parts)):
            raise Refusal('path_denied')
        fd = os.open(self.workspace, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            for part in parts[:-1]:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = child
            child = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
            with os.fdopen(child, 'rb') as stream:
                info = os.fstat(stream.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
                    raise Refusal('file_limit_or_type')
                data = stream.read(limit + 1)
                if len(data) > limit:
                    raise Refusal('file_limit_or_type')
                return data
        finally:
            os.close(fd)

    def catalog(self):
        data = json.loads(self.read('sources/manifest.json', limit=8 * 1024 * 1024))
        if not isinstance(data, dict) or data.get('schema') != 'ha-intake-manifest-1':
            raise Refusal('manifest_schema')
        rows = data.get('entries')
        if not isinstance(rows, list) or len(rows) > 10000:
            raise Refusal('manifest_limit_or_shape')
        ids, paths = set(), set()
        for row in rows:
            if not isinstance(row, dict):
                raise Refusal('manifest_entry')
            ident, path = row.get('entry_id'), row.get('stored_at')
            if (not isinstance(ident, str) or not ident or not isinstance(path, str)
                    or not path.startswith('sources/raw/') or ident in ids or path in paths
                    or not isinstance(row.get('sha256'), str)
                    or not re.fullmatch('[0-9a-f]{64}', row['sha256'])
                    or type(row.get('bytes')) is not int or row['bytes'] < 0):
                raise Refusal('manifest_entry')
            ids.add(ident)
            paths.add(path)
        return rows

    def source_get(self, args):
        if bool(args.get('entry_id')) == bool(args.get('path')):
            raise Refusal('choose_entry_id_or_path')
        row = None
        if args.get('entry_id'):
            row = next((x for x in self.catalog() if x['entry_id'] == args['entry_id']), None)
            if row is None:
                raise Refusal('source_not_found')
            path = row['stored_at']
        else:
            path = args['path']
        content = self.read(path)
        digest = hashlib.sha256(content).hexdigest()
        if row and (digest != row['sha256'] or len(content) != row['bytes']):
            raise Refusal('source_integrity_mismatch')
        result = {'ok': True, 'path': path, 'sha256': digest, 'bytes': len(content),
                  'content_trust': 'untrusted_document', 'human_verification': 'not_established',
                  'integrity': 'manifest_match' if row else 'current_bytes_only'}
        if row:
            result['entry_id'] = row['entry_id']
        if Path(path).suffix.lower() in {'.md', '.txt', '.html', '.json', '.csv'}:
            text = content.decode('utf-8')
            result.update(text=text[:12000], truncated=len(text) > 12000)
        else:
            result['text_available'] = False
        return result

    def validate(self, args):
        rows = self.catalog()
        deadline, total, checked = time.monotonic() + 20, 0, 0
        for row in rows:
            if time.monotonic() > deadline or total + row['bytes'] > 512 * 1024 * 1024:
                raise Refusal('validation_budget_exceeded')
            raw = self.read(row['stored_at'])
            if len(raw) != row['bytes'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
                raise Refusal('source_integrity_mismatch')
            checked += 1
            total += len(raw)
        return {'ok': True, 'checked_entries': checked, 'checked_bytes': total,
                'scope': 'manifest_listed_bytes_only', 'human_verification': 'not_established',
                'limitations': ['Does not detect unlisted files or validate clinical interpretation.']}

    def search(self, args):
        query, limit = args.get('query'), args.get('limit', 5)
        if not isinstance(query, str) or not query.strip() or len(query) > 500 or '\x00' in query:
            raise Refusal('query_invalid')
        if type(limit) is not int or not 1 <= limit <= 10:
            raise Refusal('limit_invalid')
        # A bounded private copy avoids any write by dz to the live medical index.
        db_rel = '.health-brain/.dz/memory/patterns.sqlite'
        with tempfile.TemporaryDirectory(prefix='hermes-health-') as tmp:
            root = Path(tmp)
            target = root / '.health-brain/.dz/memory/patterns.sqlite'
            target.parent.mkdir(parents=True)
            # Opening a live WAL database read-only can still create SHM files. Copy only a
            # stable DB+WAL pair first; rebuild SHM and use Backup API in the private directory.
            def capture():
                database = self.read(db_rel, internal=True, limit=128 * 1024 * 1024)
                try:
                    wal = self.read(db_rel + '-wal', internal=True, limit=128 * 1024 * 1024)
                except FileNotFoundError:
                    wal = None
                return database, wal
            pair = capture()
            if pair != capture():
                raise Refusal('index_busy_retry')
            copied = root / 'snapshot.sqlite'
            copied.write_bytes(pair[0])
            if pair[1] is not None:
                Path(str(copied) + '-wal').write_bytes(pair[1])
            deadline = time.monotonic() + 15
            def progress(status, remaining, count):
                if time.monotonic() > deadline:
                    raise Refusal('snapshot_budget_exceeded')
            src = sqlite3.connect(copied, timeout=2)
            dst = sqlite3.connect(target)
            try:
                if src.execute('PRAGMA page_count').fetchone()[0] * src.execute('PRAGMA page_size').fetchone()[0] > 128 * 1024 * 1024:
                    raise Refusal('snapshot_budget_exceeded')
                src.backup(dst, pages=256, progress=progress, sleep=.01)
                dst.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
                if dst.execute("SELECT type FROM sqlite_master WHERE name='memory_records'").fetchone() != ('table',):
                    raise Refusal('index_schema_invalid')
                count = dst.execute('SELECT COUNT(*) FROM memory_records').fetchone()[0]
            finally:
                dst.close()
                src.close()
            node_modules = self.runtime / 'node_modules'
            health_cli = node_modules / '@dzhechkov/health-advisor/bin/health-advisor.js'
            dz_cli = node_modules / '@dzhechkov/harness-cli/dist/bin.js'
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            wrapper = bin_dir / 'dz'
            wrapper.write_text('#!/bin/sh\nexec ' + shlex.quote(str(self.node)) + ' '
                               + shlex.quote(str(dz_cli)) + ' "$@"\n')
            wrapper.chmod(0o700)
            env = {'PATH': str(bin_dir) + ':/usr/bin:/bin', 'HOME': str(root),
                   'LANG': 'C.UTF-8', 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1'}
            # Fail closed on missing native binding, never accept dz's JSON fallback as evidence.
            probe = "const D=require(process.argv[1]);const d=new D(process.argv[2],{readonly:true});console.log(d.prepare('SELECT COUNT(*) AS n FROM memory_records').get().n);d.close()"
            actual = bounded_run([str(self.node), '-e', probe,
                                  str(node_modules / 'better-sqlite3'), str(target)], env=env)
            if int(actual) != count:
                raise Refusal('index_probe_failed')
            raw = bounded_run([str(self.node), str(health_cli), 'third-brain', 'search', query,
                               '--workspace', str(root), '--limit', str(limit), '--json'], env=env)
            data = json.loads(raw)
            if not isinstance(data, dict) or data.get('ok') is not True or not isinstance(data.get('hits'), list):
                raise Refusal('search_contract_invalid')
            hits = []
            for hit in data['hits'][:limit]:
                path, digest = hit.get('doc_path'), hit.get('doc_sha256')
                current = self.read(path)
                if hashlib.sha256(current).hexdigest() != digest:
                    raise Refusal('stale_index_source')
                text = current.decode('utf-8')
                # Index content is only a locator: quote the verified current file bytes.
                terms = [t for t in query.lower().split() if len(t) >= 3]
                positions = [text.lower().find(t) for t in terms]
                offset = max(0, min((p for p in positions if p >= 0), default=0) - 200)
                hits.append({'path': path, 'sha256': digest, 'integrity': 'index_hash_match',
                             'text': text[offset:offset+6000], 'text_offset': offset,
                             'snippet_source': 'current_document', 'truncated': offset > 0 or len(text) > 6000,
                             'human_verification': 'not_established', 'content_trust': 'untrusted_document'})
            return {'ok': True, 'hits': hits, 'indexed_records': count, 'coverage': 'third_brain_only',
                    'empty_result_proves_absence': False}

    def intake_preview(self, args):
        from .intake_preview import preview
        return preview(self, args)

    def intake_prepare(self, args):
        from .intake_confirm import prepare
        return prepare(self, args)

    def pdf_draft(self, args):
        from .pdf_draft import draft
        return draft(self, args)

    def call(self, operation, args):
        try:
            if not isinstance(args, dict):
                raise Refusal('arguments_invalid')
            return getattr(self, operation)(args)
        except Refusal as exc:
            return {'ok': False, 'error': str(exc)}
        except (OSError, ValueError, TypeError, KeyError, AttributeError, RecursionError, sqlite3.Error):
            return {'ok': False, 'error': 'unavailable_or_invalid_source'}
