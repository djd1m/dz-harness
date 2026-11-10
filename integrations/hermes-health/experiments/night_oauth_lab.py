"""Offline OAuth state-machine lab. NEVER supply real credentials or deploy as a broker."""
import contextlib
import fcntl
import json
import math
import os
from pathlib import Path
import stat
import time
import uuid


class LabRefusal(Exception):
    """Only fixed codes are permitted; no provider or state data in errors."""


def _fail(code):
    raise LabRefusal(code)


def _pairs(items):
    out = {}
    for k, v in items:
        if k in out:
            _fail('state_invalid')
        out[k] = v
    return out


class _PrivateStore:
    def __init__(self, directory, hook=None):
        self.path = Path(directory)
        if not self.path.is_absolute():
            _fail('directory_invalid')
        for p in (self.path, *self.path.parents):
            if p.is_symlink():
                _fail('directory_invalid')
        st = self.path.stat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != 0o700:
            _fail('directory_invalid')
        self.hook = hook or (lambda point: None)

    @contextlib.contextmanager
    def locked(self):
        # Open afresh per operation: same-object threads must not share flock's OFD.
        dfd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        fd = None
        try:
            fd = os.open('lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600, dir_fd=dfd)
            self._private(fd)
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield dfd
        finally:
            if fd is not None:
                os.close(fd)
            os.close(dfd)

    @staticmethod
    def _private(fd):
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != 0o600 or st.st_nlink != 1:
            _fail('state_permissions')

    def read(self, dfd, name):
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dfd)
        try:
            self._private(fd)
            with os.fdopen(os.dup(fd), 'rb') as f:
                data = f.read(16385)
            if len(data) > 16384:
                _fail('state_invalid')
            return json.loads(data, object_pairs_hook=_pairs,
                              parse_constant=lambda _: _fail('state_invalid'))
        except (ValueError, UnicodeError, RecursionError):
            _fail('state_invalid')
        finally:
            os.close(fd)

    def write(self, dfd, name, value):
        self.hook(name + ':before')
        tmp = '.tmp-' + uuid.uuid4().hex
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=dfd)
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(json.dumps(value, allow_nan=False).encode())
                f.flush()
                os.fsync(f.fileno())
            self.hook(name + ':file_synced')
            os.replace(tmp, name, src_dir_fd=dfd, dst_dir_fd=dfd)
            self.hook(name + ':replaced')
            os.fsync(dfd)
            self.hook(name + ':directory_synced')
        finally:
            try:
                os.unlink(tmp, dir_fd=dfd)
            except FileNotFoundError:
                pass


def _finite(value):
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _tokens(value):
    return (isinstance(value.get('access'), str) and value['access'].startswith('FAKE_ACCESS_')
            and isinstance(value.get('refresh'), str) and value['refresh'].startswith('FAKE_REFRESH_')
            and _finite(value.get('expires')) and value['expires'] >= 0)


class FakeProvider:
    """Shared on-disk fake provider ledger survives process death of an owner."""
    def __init__(self, directory, clock=time.time, behavior='ok'):
        self.store = _PrivateStore(directory)
        self.clock, self.behavior = clock, behavior

    def create(self, lifetime=0):
        token = {'access': 'FAKE_ACCESS_' + uuid.uuid4().hex,
                 'refresh': 'FAKE_REFRESH_' + uuid.uuid4().hex,
                 'expires': self.clock() + lifetime}
        with self.store.locked() as fd:
            if 'provider.json' in os.listdir(fd):
                _fail('already_initialized')
            self.store.write(fd, 'provider.json', {'refresh': token['refresh'], 'calls': 0, 'revoked': False})
        return token

    def refresh(self, refresh):
        with self.store.locked() as fd:
            state = self.store.read(fd, 'provider.json')
            state['calls'] += 1
            if self.behavior == 'revoke':
                state['revoked'] = True
            if state['revoked'] or refresh != state['refresh']:
                self.store.write(fd, 'provider.json', state)
                _fail('provider_rejected')
            if self.behavior == 'timeout':
                self.store.write(fd, 'provider.json', state)
                _fail('provider_unavailable')
            successor = {'access': 'FAKE_ACCESS_' + uuid.uuid4().hex,
                         'refresh': 'FAKE_REFRESH_' + uuid.uuid4().hex,
                         'expires': self.clock() + 3600}
            state['refresh'] = successor['refresh']
            self.store.write(fd, 'provider.json', state)
            if self.behavior == 'ambiguous':
                _fail('provider_ambiguous')
            return successor

    def calls(self):
        with self.store.locked() as fd:
            return self.store.read(fd, 'provider.json')['calls']


class OfflineOwner:
    def __init__(self, directory, provider, clock=time.time, margin=30, hook=None):
        if not _finite(margin) or margin < 0:
            _fail('clock_invalid')
        self.store = _PrivateStore(directory, hook)
        self.provider, self.clock, self.margin = provider, clock, margin

    def initialize(self, fake_grant):
        if not isinstance(fake_grant, dict) or set(fake_grant) != {'access', 'refresh', 'expires'} or not _tokens(fake_grant):
            _fail('fake_grant_required')
        with self.store.locked() as fd:
            if any(x != 'lock' for x in os.listdir(fd)):
                _fail('already_initialized')
            self.store.write(fd, 'state.json', {'schema': 1, 'generation': 0, **fake_grant})

    def get_access(self):
        try:
            with self.store.locked() as fd:
                if 'pending.json' in os.listdir(fd):
                    _fail('uncertain_new_grant_required')
                s = self.store.read(fd, 'state.json')
                if (not isinstance(s, dict) or set(s) != {'schema', 'generation', 'access', 'refresh', 'expires'}
                    or type(s['schema']) is not int or s['schema'] != 1
                    or type(s['generation']) is not int or s['generation'] < 0 or not _tokens(s)):
                    _fail('state_invalid')
                now = self.clock()
                if not _finite(now):
                    _fail('clock_invalid')
                if s['expires'] <= now + self.margin:
                    self.store.write(fd, 'pending.json', {'generation': s['generation']})
                    self.store.hook('before_provider')
                    try:
                        t = self.provider.refresh(s['refresh'])
                    except Exception:
                        _fail('uncertain_new_grant_required')
                    self.store.hook('after_provider')
                    if not isinstance(t, dict) or set(t) != {'access', 'refresh', 'expires'} or not _tokens(t):
                        _fail('provider_result_invalid')
                    s = {'schema': 1, 'generation': s['generation'] + 1, **t}
                    self.store.write(fd, 'state.json', s)
                    # Pending survives any failure up to confirmed result commit.
                    os.unlink('pending.json', dir_fd=fd)
                    self.store.hook('pending:unlinked')
                    os.fsync(fd)
                    self.store.hook('committed')
                now = self.clock()
                if not _finite(now) or s['expires'] <= now + self.margin:
                    _fail('access_expired')
                return {'access_token': s['access'], 'expires_at': s['expires'], 'generation': s['generation']}
        except LabRefusal:
            raise
        except (OSError, ValueError, TypeError):
            _fail('storage_or_durability_unknown')
