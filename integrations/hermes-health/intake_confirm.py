"""Explicit gateway-confirmed originals intake. Disabled unless the operator opts in.

The LLM can prepare only. Commands consume task-local gateway identity, not model
arguments or process environment. Same-UID shell access is outside this boundary.
"""
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import stat
import time
from contextlib import contextmanager

from .health_plugin import HealthTools, Refusal, bounded_run
from .intake_preview import LIMITS, MAX_INPUT, archive_bytes, capture_attachment, preview

SCHEMA = 'hermes-health-intake-1'
TTL = 30 * 60
MAX_RECEIPTS = 64
MAX_STATE_BYTES = 256 * 1024 * 1024
CAPABILITIES = {'manifest-cas', 'durable-journal', 'global-content-dedup', 'idempotent-sha256'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def gateway_identity():
    try:
        from gateway import session_context as context
        result = {}
        for field in ('platform', 'user_id', 'chat_id', 'profile'):
            value = context._VAR_MAP['HERMES_SESSION_' + field.upper()].get()
            if value is context._UNSET or not isinstance(value, str) or len(value) > 512:
                raise Refusal('trusted_gateway_identity_required')
            if field != 'profile' and not value:
                raise Refusal('trusted_gateway_identity_required')
            result[field] = value
        if result['platform'] != 'mattermost':
            raise Refusal('mattermost_gateway_required')
        cron = context._VAR_MAP['HERMES_CRON_SESSION'].get()
        if cron is not context._UNSET and cron:
            raise Refusal('cron_confirmation_denied')
        return result
    except (ImportError, AttributeError, KeyError):
        raise Refusal('trusted_gateway_identity_required') from None


def source_message_id():
    try:
        from gateway import session_context as context
        value = context._VAR_MAP['HERMES_SESSION_MESSAGE_ID'].get()
        return value if isinstance(value, str) and len(value) <= 512 else None
    except (ImportError, AttributeError, KeyError):
        return None


def runtime_identity(tools):
    package = tools.runtime / 'node_modules/@dzhechkov/health-advisor'
    names = ('package.json', 'bin/health-advisor.js', 'skills/intake-archive/engine/run.js',
             'skills/intake-archive/engine/manifest.js', 'skills/intake-archive/engine/extract.js')
    reader = HealthTools(package, tools.node, tools.runtime)
    return {name: digest(reader.read(name, internal=True, limit=2 * 1024 * 1024)) for name in names}


def workspace_identity(tools):
    info = tools.workspace.stat()
    return {'path': str(tools.workspace.resolve()), 'dev': info.st_dev, 'ino': info.st_ino}


def open_private_directory(path):
    if not path.is_absolute() or '..' in path.parts or path == Path('/'):
        raise Refusal('state_path_invalid')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for index, part in enumerate(path.parts[1:]):
            last = index == len(path.parts) - 2
            if last:
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                except FileExistsError:
                    pass
                # Also sync on reopen: a prior mkdir may have succeeded before its fsync failed.
                os.fsync(fd)
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        info = os.fstat(fd)
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise Refusal('state_permissions_invalid')
        return fd
    except BaseException:
        os.close(fd)
        raise


class Store:
    def __init__(self, tools):
        configured = os.environ.get('HEALTH_INTAKE_STATE')
        if not configured:
            raise Refusal('intake_state_not_configured')
        self.path = Path(configured)
        # Never place original documents / approval state in the working map or Git.
        resolved = self.path.resolve()
        workspace = tools.workspace.resolve()
        if resolved == workspace or workspace in resolved.parents or resolved in workspace.parents:
            raise Refusal('state_must_be_separate_from_map')
        if any((p / '.git').exists() for p in (resolved, *resolved.parents)):
            raise Refusal('state_must_be_outside_git')
        self.fd = open_private_directory(self.path)

    def close(self):
        os.close(self.fd)

    def open(self, name, flags):
        fd = os.open(name, flags | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=self.fd)
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            os.close(fd)
            raise Refusal('state_file_permissions_invalid')
        return fd

    def read(self, name, limit):
        with os.fdopen(self.open(name, os.O_RDONLY), 'rb') as stream:
            if os.fstat(stream.fileno()).st_size > limit:
                raise Refusal('state_file_limit')
            value = stream.read(limit + 1)
            if len(value) > limit:
                raise Refusal('state_file_limit')
            return value

    def write(self, name, data):
        temp = '.pending-' + secrets.token_hex(16)
        try:
            with os.fdopen(self.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL), 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.rename(temp, name, src_dir_fd=self.fd, dst_dir_fd=self.fd)
            os.fsync(self.fd)
        finally:
            try:
                os.unlink(temp, dir_fd=self.fd)
            except FileNotFoundError:
                pass

    @contextmanager
    def locked(self):
        fd = self.open('.lock', os.O_RDWR | os.O_CREAT)
        try:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Refusal('intake_busy_retry') from None
            try:
                key = self.read('.key', 32)
            except FileNotFoundError:
                if any(name.endswith('.json') for name in os.listdir(self.fd)):
                    raise Refusal('state_key_missing')
                key = secrets.token_bytes(32)
                self.write('.key', key)
            if len(key) != 32:
                raise Refusal('state_key_invalid')
            self.key = key
            yield
        finally:
            os.close(fd)

    def quota(self, extra):
        count, total = 0, 0
        with os.scandir(self.fd) as entries:
            for index, entry in enumerate(entries):
                if index >= 256 or entry.is_symlink() or not entry.is_file(follow_symlinks=False):
                    raise Refusal('state_limit_or_type')
                count += entry.name.endswith('.receipt.json')
                total += entry.stat(follow_symlinks=False).st_size
        if count >= MAX_RECEIPTS or total + extra > MAX_STATE_BYTES:
            raise Refusal('state_quota_exceeded_operator_cleanup_required')

    def save(self, receipt):
        payload = encode(receipt)
        envelope = {'payload': receipt, 'mac': hmac.new(self.key, payload, hashlib.sha256).hexdigest()}
        self.write(receipt['receipt_id'] + '.receipt.json', encode(envelope))

    def load(self, ident):
        data = json.loads(self.read(ident + '.receipt.json', 1024 * 1024))
        payload = data['payload']
        if not hmac.compare_digest(hmac.new(self.key, encode(payload), hashlib.sha256).hexdigest(), data['mac']):
            raise Refusal('receipt_integrity_mismatch')
        if payload.get('schema') != SCHEMA or payload.get('receipt_id') != ident:
            raise Refusal('receipt_schema_invalid')
        return payload


@contextmanager
def state_store(tools):
    store = Store(tools)
    try:
        with store.locked():
            yield store
    finally:
        store.close()


def prepare(tools, args):
    owner = gateway_identity()
    with state_store(tools) as store:
        store.quota(2 * MAX_INPUT + 2 * 1024 * 1024)
        name, original = capture_attachment(tools, args)
        checked = preview(tools, args, snapshot=(name, original))
        files = checked['files']
        duplicates = [row for row in files if row['duplicate_status'] == 'verified_exact_match']
        if len(duplicates) == len(files):
            return {**checked, 'mode': 'duplicate_noop', 'receipt_created': False}
        if duplicates:
            raise Refusal('mixed_duplicate_archive')
        if len({(r['sha256'], r['bytes']) for r in files}) != len(files):
            raise Refusal('duplicate_content_in_archive')
        live = tools.catalog()
        if {row.get('path') for row in live} & {row['path'] for row in files}:
            raise Refusal('logical_path_conflict')
        if digest(tools.read('sources/manifest.json', limit=8 * 1024 * 1024)) != checked['manifest_sha256']:
            raise Refusal('catalog_changed_retry')
        archive = archive_bytes(name, original)
        ident = secrets.token_hex(24)
        now = int(time.time())
        receipt = {'schema': SCHEMA, 'plugin_version': '0.3.0', 'receipt_id': ident,
                   'owner': owner, 'workspace': workspace_identity(tools), 'runtime': runtime_identity(tools),
                   'created_at': now, 'expires_at': now + TTL, 'state': 'prepared',
                   'source_message_id': source_message_id(),
                   'original_name': name, 'attachment_sha256': digest(original), 'attachment_bytes': len(original),
                   'archive_sha256': digest(archive), 'archive_bytes': len(archive),
                   'manifest_sha256': checked['manifest_sha256'],
                   'files': sorted([{'path': r['path'], 'sha256': r['sha256'], 'bytes': r['bytes']} for r in files], key=lambda r: r['path'])}
        store.write(ident + '.original', original)
        store.write(ident + '.zip', archive)
        store.save(receipt)
        return {'ok': True, 'mode': 'prepared_not_committed', 'receipt_id': ident,
                'expires_at': receipt['expires_at'], 'files': receipt['files'], 'live_write': False,
                'confirmation_transport': 'gateway_command_requires_operator_transport_acceptance',
                'human_verification': 'not_established'}


def result_sources(tools, receipt):
    catalog = tools.catalog()
    results = []
    for expected in receipt['files']:
        matches = [r for r in catalog if r.get('path') == expected['path']
                   and r['sha256'] == expected['sha256'] and r['bytes'] == expected['bytes']]
        if len(matches) != 1:
            raise Refusal('committed_source_missing_or_ambiguous')
        row = matches[0]
        if row.get('archive_id') != 'sha256:' + receipt['archive_sha256']:
            raise Refusal('committed_source_identity_drift')
        raw = tools.read(row['stored_at'])
        if digest(raw) != expected['sha256'] or len(raw) != expected['bytes']:
            raise Refusal('committed_source_drift')
        results.append({'entry_id': row['entry_id'], 'stored_at': row['stored_at'],
                        'sha256': row['sha256'], 'bytes': row['bytes'], 'archive_id': row['archive_id']})
    if receipt.get('state') == 'committed' and results != receipt.get('sources'):
        raise Refusal('committed_source_identity_drift')
    return results


def core_run(tools, args, store):
    cli = tools.runtime / 'node_modules/@dzhechkov/health-advisor/bin/health-advisor.js'
    return json.loads(bounded_run([str(tools.node), str(cli), 'intake-archive', *args, '--json'],
                                 env={'PATH': '/usr/bin:/bin', 'HOME': str(store.path), 'LANG': 'C.UTF-8'}))


def command(action, ident):
    """Only registered as a gateway command; never exposed through tool schemas."""
    if not isinstance(ident, str) or not re.fullmatch('[0-9a-f]{48}', ident):
        raise Refusal('receipt_id_invalid')
    if action not in {'confirm', 'cancel', 'status'}:
        raise Refusal('command_invalid')
    owner = gateway_identity()
    tools = HealthTools.configured()
    with state_store(tools) as store:
        receipt = store.load(ident)
        if receipt['owner'] != owner or receipt['workspace'] != workspace_identity(tools):
            raise Refusal('receipt_owner_or_workspace_mismatch')
        state = receipt['state']
        if state == 'committing':
            receipt['state'] = state = 'reconciliation_required'
            store.save(receipt)
        if state == 'prepared' and time.time() >= receipt['expires_at']:
            receipt['state'] = state = 'expired'
            store.save(receipt)
        if action == 'status':
            return {'ok': True, 'receipt_id': ident, 'state': state, 'expires_at': receipt['expires_at']}
        if state == 'committed':
            return {'ok': True, 'receipt_id': ident, 'state': state, 'sources': result_sources(tools, receipt),
                    'replayed': True, 'human_verification': 'not_established'}
        if state != 'prepared':
            raise Refusal('receipt_' + state)
        if action == 'cancel':
            receipt['state'] = 'cancelled'
            store.save(receipt)
            return {'ok': True, 'receipt_id': ident, 'state': 'cancelled'}
        if receipt['runtime'] != runtime_identity(tools):
            raise Refusal('runtime_changed_prepare_again')
        if os.environ.get('HEALTH_INTAKE_WRITE_ENABLED') != '1':
            raise Refusal('intake_write_disabled')
        original = store.read(ident + '.original', MAX_INPUT)
        archive = store.read(ident + '.zip', 20 * 1024 * 1024)
        if (digest(original) != receipt['attachment_sha256'] or len(original) != receipt['attachment_bytes']
                or digest(archive) != receipt['archive_sha256'] or len(archive) != receipt['archive_bytes']
                or archive != archive_bytes(receipt['original_name'], original)):
            raise Refusal('prepared_blob_drift')
        if digest(tools.read('sources/manifest.json', limit=8 * 1024 * 1024)) != receipt['manifest_sha256']:
            raise Refusal('catalog_changed_prepare_again')
        checked = preview(tools, {}, snapshot=(receipt['original_name'], original))
        files = sorted([{'path': r['path'], 'sha256': r['sha256'], 'bytes': r['bytes']} for r in checked['files']], key=lambda r: r['path'])
        if files != receipt['files'] or any(r['duplicate_status'] != 'no_exact_catalog_match' for r in checked['files']):
            raise Refusal('prepared_members_drift')
        capabilities = core_run(tools, ['--capabilities'], store)
        if capabilities.get('ok') is not True or not CAPABILITIES.issubset(set(capabilities.get('capabilities', []))):
            raise Refusal('core_write_contract_unavailable')
        verification = core_run(tools, ['--workspace', str(tools.workspace), '--verify'], store)
        if verification.get('ok') is not True:
            raise Refusal('preexisting_core_integrity_failed')
        store.write('limits.json', encode(LIMITS))
        receipt['state'] = 'committing'
        receipt['confirmed_at'] = int(time.time())
        store.save(receipt)
        try:
            outcome = core_run(tools, ['--workspace', str(tools.workspace), '--file', str(store.path / (ident + '.zip')),
                                      '--expect-sha256', receipt['archive_sha256'], '--expect-manifest-sha256', receipt['manifest_sha256'],
                                      '--limits', str(store.path / 'limits.json')], store)
            if outcome.get('ok') is not True:
                raise Refusal('core_commit_contract_invalid')
            sources = result_sources(tools, receipt)
            if not tools.call('validate', {}).get('ok'):
                raise Refusal('final_catalog_integrity_failed')
            verification = core_run(tools, ['--workspace', str(tools.workspace), '--verify'], store)
            if verification.get('ok') is not True:
                raise Refusal('final_core_integrity_failed')
            receipt['state'] = 'committed'
            receipt['sources'] = sources
            receipt['committed_at'] = int(time.time())
            store.save(receipt)
        except Exception:
            receipt['state'] = 'reconciliation_required'
            store.save(receipt)
            raise Refusal('reconciliation_required_no_automatic_retry') from None
        return {'ok': True, 'receipt_id': ident, 'state': 'committed', 'sources': sources,
                'human_verification': 'not_established', 'ocr_performed': False, 'index_updated': False}


def command_handler(action):
    def handle(raw_args):
        # Never raise through gateway dispatch: it can otherwise fall through to the LLM.
        try:
            result = command(action, raw_args.strip())
        except Refusal as exc:
            result = {'ok': False, 'error': str(exc)}
        except Exception:
            result = {'ok': False, 'error': 'intake_unavailable_operator_check_required'}
        return json.dumps(result, ensure_ascii=False)
    return handle
