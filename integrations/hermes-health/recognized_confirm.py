"""Experimental synthetic-only recognized proposal adapter; no clinical verification."""
import hashlib
import json
import os
import selectors
import signal
import subprocess
import time
from .health_plugin import Refusal

MAX_TEXT = 2 * 1024 * 1024
MAX_INPUT = 16 * 1024 * 1024


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise Refusal('recognized_json_invalid')
            result[key] = value
        return result
    def invalid(_):
        raise Refusal('recognized_json_invalid')
    def finite_float(token):
        value = float(token)
        if not math.isfinite(value):
            invalid(None)
        return value
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=invalid, parse_float=finite_float)
        if not isinstance(value, dict):
            invalid(None)
        # Reject surrogate/NUL even inside unknown values before schema interpretation.
        encoded = json.dumps(value, ensure_ascii=False).encode('utf-8')
        if b'\\u0000' in encoded:
            invalid(None)
        return value
    except (ValueError, UnicodeError, RecursionError):
        raise Refusal('recognized_json_invalid') from None


def bounded_input_run(argv, payload, *, timeout=25, limit=65536):
    """One deadline covers full-duplex pipes and process exit; never echo stderr."""
    if not isinstance(payload, bytes) or len(payload) > MAX_INPUT:
        raise Refusal('recognized_input_limit')
    deadline = time.monotonic() + timeout
    process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True,
                               env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
    output = bytearray()
    total = offset = 0
    try:
        with selectors.DefaultSelector() as selector:
            for stream in (process.stdin, process.stdout, process.stderr):
                os.set_blocking(stream.fileno(), False)
            if payload:
                selector.register(process.stdin, selectors.EVENT_WRITE)
            else:
                process.stdin.close()
            selector.register(process.stdout, selectors.EVENT_READ)
            selector.register(process.stderr, selectors.EVENT_READ)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise Refusal('recognized_core_timeout')
                for key, _ in selector.select(remaining):
                    stream = key.fileobj
                    if stream is process.stdin:
                        offset += os.write(stream.fileno(), payload[offset:offset + 65536])
                        if offset == len(payload):
                            selector.unregister(stream)
                            stream.close()
                    else:
                        chunk = os.read(stream.fileno(), 65536)
                        if not chunk:
                            selector.unregister(stream)
                            stream.close()
                            continue
                        total += len(chunk)
                        if total > limit:
                            raise Refusal('recognized_core_output_limit')
                        if stream is process.stdout:
                            output.extend(chunk)
            remaining = deadline - time.monotonic()
            if remaining <= 0 or process.wait(timeout=remaining) != 0:
                raise Refusal('recognized_core_unavailable')
        return bytes(output)
    except (OSError, subprocess.TimeoutExpired):
        raise Refusal('recognized_core_unavailable') from None
    finally:
        # Descendants may outlive an exited parent, including holding inherited pipes.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        for stream in (process.stdin, process.stdout, process.stderr):
            stream.close()


def core_run(tools, action, request):
    if action not in {'capabilities', 'save', 'status'}:
        raise Refusal('recognized_core_action_invalid')
    if action == 'save':
        keys(request, ['operation_id', 'entry_id', 'source_sha256', 'source_bytes', 'text', 'engine'])
        keys(request['engine'], ['name', 'version'])
        if (not isinstance(request['text'], str) or not 1 <= len(request['text']) <= MAX_TEXT or '\x00' in request['text'] or
                not isinstance(request['entry_id'], str) or not re.fullmatch(r'[a-f0-9]{32}', request['entry_id']) or
                not isinstance(request['source_sha256'], str) or not HEX.fullmatch(request['source_sha256']) or
                type(request['source_bytes']) is not int or not 0 <= request['source_bytes'] <= 32*1024*1024 or
                any(not isinstance(v, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._+-]{0,63}', v) for v in request['engine'].values())):
            raise Refusal('recognized_core_request_invalid')
        try:
            if len(request['text'].encode('utf-8')) > MAX_TEXT:
                raise Refusal('recognized_input_limit')
        except UnicodeError:
            raise Refusal('recognized_text_invalid') from None
    elif action == 'status':
        keys(request, ['operation_id'])
    else:
        keys(request, [])
    if action != 'capabilities' and (not isinstance(request['operation_id'], str) or not PROPOSAL.fullmatch(request['operation_id'])):
        raise Refusal('recognized_operation_id_invalid')
    script = tools.runtime / 'node_modules/@dzhechkov/health-advisor/lib/recognized-cli.js'
    argv = [str(tools.node), str(script), action]
    if action != 'capabilities':
        argv += ['--workspace', str(tools.workspace.resolve())]
    payload = b'' if action == 'capabilities' else json.dumps(request, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return strict_json(bounded_input_run(argv, payload))

import fcntl
import hmac
import math
from pathlib import Path
import re
import secrets
import stat
from contextlib import contextmanager
from .intake_confirm import gateway_identity, workspace_identity, open_private_directory
from .pdf_draft import private_root

SCHEMA = 'hermes-health-recognized-confirm-1'
LABELS = {'human_verification': 'not_established', 'content_trust': 'untrusted_document',
          'index_status': 'not_requested', 'label': 'НЕПРОВЕРЕНО'}
HEX = re.compile(r'[a-f0-9]{64}\Z')
PROPOSAL = re.compile(r'rc-[a-f0-9]{32}\Z')
DRAFT = re.compile(r'pdf-[a-f0-9]{32}\Z')
STATES = {'prepared', 'committing', 'reconciliation_required', 'saved_unverified', 'expired', 'cancelled'}


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def keys(value, expected):
    if type(value) is not dict or set(value) != set(expected):
        raise Refusal('recognized_schema_invalid')


def private_read(fd, name, limit):
    child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    with os.fdopen(child, 'rb') as stream:
        info = os.fstat(child)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or
                stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > limit):
            raise Refusal('recognized_private_file_invalid')
        value = stream.read(limit + 1)
        if len(value) > limit:
            raise Refusal('recognized_private_file_limit')
        return value


def validate_sidecar(side):
    keys(side, ['schema', 'draft_id', 'workspace', 'source', 'draft', 'engine', 'parser_status'])
    keys(side['workspace'], ['path', 'dev', 'ino'])
    keys(side['source'], ['entry_id', 'path', 'logical_path', 'sha256', 'bytes'])
    keys(side['draft'], ['sha256', 'bytes'])
    keys(side['engine'], ['name', 'version'])
    if (side['schema'] != 'draft-provenance-1' or not isinstance(side['draft_id'], str) or not DRAFT.fullmatch(side['draft_id']) or
            side['parser_status'] not in {'ok', 'partial_text'} or side['engine'] != {'name': 'pypdf', 'version': '7.0.0'}):
        raise Refusal('recognized_sidecar_schema')
    for binding in ('source', 'draft'):
        item = side[binding]
        if not isinstance(item['sha256'], str) or not HEX.fullmatch(item['sha256']) or type(item['bytes']) is not int or not 0 <= item['bytes'] <= 32*1024*1024:
            raise Refusal('recognized_sidecar_schema')
    for field in ('path', 'entry_id'):
        if not isinstance(side['source'][field], str) or not 1 <= len(side['source'][field]) <= 4096:
            raise Refusal('recognized_sidecar_schema')
    logical = side['source']['logical_path']
    if logical is not None and (not isinstance(logical, str) or not 1 <= len(logical) <= 4096):
        raise Refusal('recognized_sidecar_schema')
    if not isinstance(side['workspace']['path'], str) or not Path(side['workspace']['path']).is_absolute():
        raise Refusal('recognized_sidecar_schema')
    for field in ('dev', 'ino'):
        if type(side['workspace'][field]) is not int or side['workspace'][field] < 0:
            raise Refusal('recognized_sidecar_schema')


def snapshot(tools, ident):
    if not isinstance(ident, str) or not DRAFT.fullmatch(ident):
        raise Refusal('recognized_draft_id_invalid')
    _, root = private_root(tools.workspace)
    child = None
    try:
        child = os.open(ident, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
        info = os.fstat(child)
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise Refusal('recognized_draft_permissions')
        side = strict_json(private_read(child, 'provenance.json', 16384))
        validate_sidecar(side)
        keys(side['source'], ['entry_id', 'path', 'logical_path', 'sha256', 'bytes'])
        keys(side['draft'], ['sha256', 'bytes'])
        keys(side['engine'], ['name', 'version'])
        if (side['schema'] != 'draft-provenance-1' or side['draft_id'] != ident or
                side['workspace'] != workspace_identity(tools) or side['parser_status'] not in {'ok', 'partial_text'} or
                side['engine'] != {'name': 'pypdf', 'version': '7.0.0'}):
            raise Refusal('recognized_draft_binding_invalid')
        source = side['source']
        row = next((r for r in tools.catalog() if r['entry_id'] == source['entry_id']), None)
        if row is None or source != {'entry_id': row['entry_id'], 'path': row['stored_at'], 'logical_path': row.get('path'), 'sha256': row['sha256'], 'bytes': row['bytes']}:
            raise Refusal('recognized_source_drift')
        raw = tools.read(source['path'], limit=32 * 1024 * 1024)
        if digest(raw) != source['sha256'] or len(raw) != source['bytes']:
            raise Refusal('recognized_source_drift')
        raw = private_read(child, 'draft.md', MAX_TEXT)
        if type(side['draft']['bytes']) is not int or side['draft'] != {'sha256': digest(raw), 'bytes': len(raw)}:
            raise Refusal('recognized_draft_drift')
        text = raw.decode('utf-8')
        if not raw or '\x00' in text:
            raise Refusal('recognized_text_invalid')
        return side, text
    finally:
        if child is not None:
            os.close(child)
        os.close(root)


class RecognizedStore:
    def __init__(self, tools):
        configured = os.environ.get('HEALTH_RECOGNIZED_STATE', '')
        if not configured:
            raise Refusal('recognized_state_not_configured')
        self.path = Path(configured)
        resolved = self.path.resolve()
        for other in [tools.workspace, Path(os.environ.get('HEALTH_DRAFTS', '')), Path(os.environ.get('HEALTH_INTAKE_STATE', ''))]:
            if not other.is_absolute():
                raise Refusal('recognized_isolation_roots_required')
            target = other.resolve()
            if resolved == target or target in resolved.parents or resolved in target.parents:
                raise Refusal('recognized_state_isolation')
            if resolved.exists() and target.exists() and os.path.samestat(resolved.stat(), target.stat()):
                raise Refusal('recognized_state_isolation')
        if any((p / '.git').exists() for p in (resolved, *resolved.parents)):
            raise Refusal('recognized_state_inside_git')
        self.fd = open_private_directory(self.path)

    def write(self, name, value):
        temp = '.recognized-pending-' + secrets.token_hex(16)
        try:
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(value)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, name, src_dir_fd=self.fd, dst_dir_fd=self.fd)
            os.fsync(self.fd)
        finally:
            try:
                os.unlink(temp, dir_fd=self.fd)
            except FileNotFoundError:
                pass

    def save(self, receipt):
        self.write(receipt['proposal_id'] + '.recognized.json', encode({'payload': receipt, 'mac': hmac.new(self.key, encode(receipt), hashlib.sha256).hexdigest()}))

    def load(self, ident):
        envelope = strict_json(private_read(self.fd, ident + '.recognized.json', 1024 * 1024))
        keys(envelope, ['payload', 'mac'])
        receipt = envelope['payload']
        if not isinstance(envelope['mac'], str) or not hmac.compare_digest(hmac.new(self.key, encode(receipt), hashlib.sha256).hexdigest(), envelope['mac']):
            raise Refusal('recognized_receipt_integrity')
        keys(receipt, ['schema', 'proposal_id', 'operation_id', 'owner', 'workspace', 'runtime', 'sidecar', 'created', 'expires', 'state', 'artifact_observed'])
        if receipt['schema'] != SCHEMA or receipt['proposal_id'] != ident or receipt['operation_id'] != ident or receipt['state'] not in STATES:
            raise Refusal('recognized_receipt_schema')
        if type(receipt['artifact_observed']) is not bool:
            raise Refusal('recognized_receipt_schema')
        validate_sidecar(receipt['sidecar'])
        keys(receipt['owner'], ['platform', 'user_id', 'chat_id', 'profile'])
        if any(not isinstance(v, str) or len(v) > 512 for v in receipt['owner'].values()) or receipt['workspace'] != receipt['sidecar']['workspace'] or not isinstance(receipt['runtime'], str) or not HEX.fullmatch(receipt['runtime']):
            raise Refusal('recognized_receipt_schema')
        for field in ('created', 'expires'):
            if type(receipt[field]) not in {int, float} or not math.isfinite(receipt[field]):
                raise Refusal('recognized_receipt_clock')
        return receipt

    def quota(self):
        names = os.listdir(self.fd)
        if len(names) >= 128:
            raise Refusal('recognized_state_quota')
        total = 0
        for name in names:
            info = os.stat(name, dir_fd=self.fd, follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600:
                raise Refusal('recognized_state_file_invalid')
            total += info.st_size
        if total > 16 * 1024 * 1024:
            raise Refusal('recognized_state_quota')


@contextmanager
def state_store(tools):
    store = RecognizedStore(tools)
    lock = None
    try:
        lock = os.open('.recognized.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=store.fd)
        info = os.fstat(lock)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
            raise Refusal('recognized_lock_invalid')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refusal('recognized_busy_retry') from None
        store.quota()
        try:
            store.key = private_read(store.fd, '.recognized.key', 32)
        except FileNotFoundError:
            if any(n.endswith('.json') for n in os.listdir(store.fd)):
                raise Refusal('recognized_key_missing')
            store.key = secrets.token_bytes(32)
            store.write('.recognized.key', store.key)
        if len(store.key) != 32:
            raise Refusal('recognized_key_invalid')
        yield store
    finally:
        if lock is not None:
            os.close(lock)
        os.close(store.fd)

CAPABILITY = {'schema': 'ha-recognized-capabilities-1', 'version': 1, 'request_schema': 'ha-recognized-save-1',
              'experimental': True, 'capabilities': ['immutable-opid', 'exact-source-binding', 'unverified-only', 'status-no-text']}


def runtime_identity(tools):
    """Pin all installed runtime code, including transitive lock dependencies."""
    result = {}
    total = count = 0
    root = tools.runtime / 'node_modules'
    if root.is_symlink() or not root.is_dir():
        raise Refusal('recognized_runtime_unavailable')
    reader = type(tools)(root, tools.node, tools.runtime)
    for path in sorted(root.rglob('*')):
        # npm's .bin links are launcher aliases; direct absolute Node+CLI are used.
        if '.bin' in path.relative_to(root).parts:
            continue
        if path.is_symlink():
            raise Refusal('recognized_runtime_symlink')
        if not path.is_file() or path.suffix not in {'.js', '.cjs', '.mjs', '.json', '.node'}:
            continue
        count += 1
        if count > 32768:
            raise Refusal('recognized_runtime_limit')
        raw = reader.read(str(path.relative_to(root)), internal=True, limit=16 * 1024 * 1024)
        total += len(raw)
        if total > 128 * 1024 * 1024:
            raise Refusal('recognized_runtime_limit')
        result[str(path.relative_to(root))] = digest(raw)
    for name in ('@dzhechkov/health-advisor/lib/recognized-cli.js', '@dzhechkov/health-advisor/lib/recognized-store.js', '@dzhechkov/harness-core/package.json'):
        if name not in result:
            raise Refusal('recognized_runtime_unavailable')
    node_hash = hashlib.sha256()
    fd = os.open(tools.node, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > 256 * 1024 * 1024:
            raise Refusal('recognized_node_invalid')
        while chunk := stream.read(1024 * 1024):
            node_hash.update(chunk)
    result['node-executable'] = node_hash.hexdigest()
    if core_run(tools, 'capabilities', {}) != CAPABILITY:
        raise Refusal('recognized_capability_required')
    return digest(encode(result))


def summary(receipt):
    side = receipt['sidecar']
    return {'ok': True, 'proposal_id': receipt['proposal_id'], 'state': receipt['state'],
            'operation_id': receipt['operation_id'], 'source': side['source'], 'draft': side['draft'],
            'parser_status': side['parser_status'], 'expires': receipt['expires'],
            'artifact_presence': 'previously_observed_unverified' if receipt['artifact_observed'] else 'not_established', **LABELS}


def prepare(tools, args):
    keys(args, ['draft_id', 'entry_id', 'expected_draft_sha256'])
    owner = gateway_identity()
    side, _ = snapshot(tools, args['draft_id'])
    if side['source']['entry_id'] != args['entry_id'] or side['draft']['sha256'] != args['expected_draft_sha256']:
        raise Refusal('recognized_prepare_binding')
    # Core entry IDs have a narrower grammar than generic plugin catalog IDs.
    if not re.fullmatch(r'[a-f0-9]{32}', args['entry_id']):
        raise Refusal('recognized_core_entry_id_invalid')
    if not isinstance(side['source']['logical_path'], str) or not 1 <= len(side['source']['logical_path']) <= 4096:
        raise Refusal('recognized_logical_source_required')
    runtime = runtime_identity(tools)
    now = time.time()
    if not math.isfinite(now):
        raise Refusal('recognized_clock_invalid')
    ident = 'rc-' + secrets.token_hex(16)
    receipt = {'schema': SCHEMA, 'proposal_id': ident, 'operation_id': ident, 'owner': owner,
               'workspace': workspace_identity(tools), 'runtime': runtime, 'sidecar': side,
               'created': now, 'expires': now + 1800, 'state': 'prepared', 'artifact_observed': False}
    with state_store(tools) as store:
        store.save(receipt)
    return summary(receipt)


def verify_core(value, receipt, expected_status='present_unverified'):
    expected_keys = ['ok', 'status', 'operation_id', 'request_sha256', 'artifact_path', 'source', 'text_sha256',
                     'text_bytes', 'engine', 'created_at', 'verification_status', 'human_verification',
                     'content_trust', 'label', 'index_status', 'current_source_integrity']
    keys(value, expected_keys)
    side = receipt['sidecar']
    ws = receipt['workspace']
    src, draft = side['source'], side['draft']
    # Core SHA binds workspace and path as well as all public summary fields.
    binding = ['ha-recognized-save-1', receipt['operation_id'], ws['path'], str(ws['dev']), str(ws['ino']),
               'ha-source-anchor-1', src['entry_id'], src['logical_path'], src['sha256'], src['bytes'],
               draft['sha256'], draft['bytes'], side['engine']['name'], side['engine']['version']]
    request_hash = digest(json.dumps(binding, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    if (value['ok'] is not True or value['status'] != expected_status or
            value['operation_id'] != receipt['operation_id'] or value['request_sha256'] != request_hash or
            value['source'] != {k: src[k] for k in ('entry_id', 'sha256', 'bytes')} or
            value['text_sha256'] != draft['sha256'] or type(value['text_bytes']) is not int or value['text_bytes'] != draft['bytes'] or
            value['engine'] != side['engine'] or value['verification_status'] != 'unverified' or
            any(value[k] != v for k, v in LABELS.items()) or value['current_source_integrity'] != 'valid_at_read_time' or
            value['artifact_path'] != 'recognized/.machine-unverified/operations/' + receipt['operation_id'] + '/artifact.md' or
            not isinstance(value['created_at'], str) or len(value['created_at']) > 64):
        raise Refusal('recognized_core_binding_invalid')


def reconcile(tools, store, receipt):
    receipt['state'] = 'reconciliation_required'
    try:
        if runtime_identity(tools) != receipt['runtime']:
            raise Refusal('recognized_runtime_drift')
        verify_core(core_run(tools, 'status', {'operation_id': receipt['operation_id']}), receipt)
        receipt['state'] = 'saved_unverified'
        receipt['artifact_observed'] = True
        store.save(receipt)
    except Exception:
        receipt['state'] = 'reconciliation_required'
        try:
            store.save(receipt)
        except Exception:
            pass
    return summary(receipt)


_COMMAND_AUTHORITY = object()


def command(action, ident, tools=None, *, _authority=None):
    if _authority is not _COMMAND_AUTHORITY:
        raise Refusal('recognized_command_boundary_required')
    if action not in {'confirm', 'cancel', 'status'} or not isinstance(ident, str) or not PROPOSAL.fullmatch(ident):
        raise Refusal('recognized_command_invalid')
    owner = gateway_identity()
    tools = tools or __import__(__package__ + '.health_plugin', fromlist=['HealthTools']).HealthTools.configured()
    with state_store(tools) as store:
        receipt = store.load(ident)
        if receipt['owner'] != owner or receipt['workspace'] != workspace_identity(tools):
            raise Refusal('recognized_owner_or_workspace_mismatch')
        if receipt['state'] in {'committing', 'reconciliation_required', 'saved_unverified'}:
            if action == 'cancel':
                raise Refusal('recognized_cancellation_after_intent')
            return reconcile(tools, store, receipt)
        now = time.time()
        if not math.isfinite(now):
            raise Refusal('recognized_clock_invalid')
        if receipt['state'] == 'prepared' and now >= receipt['expires']:
            receipt['state'] = 'expired'
            store.save(receipt)
        if receipt['state'] != 'prepared' or action == 'status':
            return summary(receipt)
        if action == 'cancel':
            receipt['state'] = 'cancelled'
            store.save(receipt)
            return summary(receipt)
        if os.environ.get('HEALTH_RECOGNIZED_SYNTHETIC_WRITE') != '1':
            raise Refusal('recognized_write_disabled')
        side, text = snapshot(tools, receipt['sidecar']['draft_id'])
        if side != receipt['sidecar'] or runtime_identity(tools) != receipt['runtime']:
            raise Refusal('recognized_prepare_again')
        receipt['state'] = 'committing'
        store.save(receipt)
        source = side['source']
        try:
            saved = core_run(tools, 'save', {'operation_id': ident, 'entry_id': source['entry_id'],
                     'source_sha256': source['sha256'], 'source_bytes': source['bytes'], 'text': text, 'engine': side['engine']})
            verify_core(saved, receipt, 'saved_unverified')
        except Exception:
            # Once intent is durable, only observation of this opid is safe.
            receipt['state'] = 'reconciliation_required'
            try:
                store.save(receipt)
            except Exception:
                pass
            return summary(receipt)
        return reconcile(tools, store, receipt)


def command_handler(action):
    def handle(raw_args):
        try:
            result = command(action, raw_args.strip(), _authority=_COMMAND_AUTHORITY)
        except Exception:
            # Never hand a failed recognized command back to model dispatch.
            result = {'ok': False, 'error': 'recognized_unavailable_operator_check_required', **LABELS}
        return json.dumps(result, ensure_ascii=False)
    return handle
