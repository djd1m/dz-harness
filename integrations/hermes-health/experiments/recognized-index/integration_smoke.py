"""Synthetic fixtures only. Run inside the pinned, networkless runtime image."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import zipfile

NODE = '/opt/health-node22/bin/node'
PKG = '/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor'
LAB = str(Path(__file__).with_name('index_lab.js'))


def run(argv, body=None, env=None):
    p = subprocess.run(argv, input=None if body is None else json.dumps(body),
                       capture_output=True, text=True, timeout=120, env=env)
    try:
        result = json.loads(p.stdout)
    except ValueError:
        raise AssertionError((p.returncode, p.stdout[:2000], p.stderr[:2000]))
    return p.returncode, result


class Fixture:
    def __init__(self):
        self.root = Path(tempfile.mkdtemp(prefix='recognized-index-', dir='/tmp'))
        self.ws = self.root / 'workspace'
        self.ws.mkdir(mode=0o700)
        self.sentinel = self.root / '.health-index-lab-synthetic'
        self.sentinel.write_text(json.dumps(dict(schema='hermes-recognized-index-lab-1',
                                                workspace=str(self.ws), nonce='a' * 32)))
        self.sentinel.chmod(0o600)
        archive = self.root / 'technical.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('technical.txt', 'Synthetic technical fixture: checksum packet transport only.\n')
        rc, result = run([NODE, PKG + '/bin/health-advisor.js', 'intake-archive',
                          '--workspace', str(self.ws), '--file', str(archive), '--json'])
        assert rc == 0, result
        self.row = json.loads((self.ws / 'sources/manifest.json').read_text())['entries'][0]
        self.term = 'quartzindexsynthetic'
        self.text = '\n\n'.join(f'Synthetic technical paragraph {i}. {self.term} ' +
                                 'Checksum packet transport fixture. ' * 30 for i in range(18))
        req = dict(operation_id='index-op', entry_id=self.row['entry_id'],
                   source_sha256=self.row['sha256'], source_bytes=self.row['bytes'],
                   text=self.text, engine=dict(name='fixture', version='1'))
        rc, self.saved = run([NODE, PKG + '/lib/recognized-cli.js', 'save', '--workspace', str(self.ws)], req)
        assert rc == 0, self.saved
        self.artifact = self.ws / self.saved['artifact_path']
        # Explicit fixture bootstrap through the existing ingest API, before lab scope.
        seed = self.ws / 'seed.txt'
        seed.write_text('Synthetic seed for technical index initialization.\n')
        script = "require(process.argv[1]).ingest({workspace:process.argv[2],documentPath:'seed.txt',case:'synthetic',kind:'conclusion',date:'2026-11-09',anchors:[]}).then(x=>console.log(JSON.stringify(x)),e=>{console.error(e);process.exit(1)})"
        rc, result = run([NODE, '-e', script, PKG + '/skills/third-brain/engine/write.js', str(self.ws)])
        assert rc == 0, result
        self.db = self.ws / '.health-brain/.dz/memory/patterns.sqlite'
        assert self.db.is_file(), 'fixture must create actual SQLite backend'

    def close(self):
        shutil.rmtree(self.root)

    def call(self, verb, extra=(), env=None):
        return run([NODE, LAB, verb, '--lab-root', str(self.root), '--workspace', str(self.ws),
                    '--operation-id', 'index-op', '--case', 'synthetic', *extra], env=env)

    def apply(self, digest=None, env=None):
        if digest is None:
            rc, plan = self.call('plan')
            assert rc == 0, plan
            digest = plan['plan_sha256']
        return self.call('apply', ['--execute', '--synthetic-confirm', '--expect-plan-sha256', digest], env)

    def protected(self):
        return {str(p.relative_to(self.ws)): hashlib.sha256(p.read_bytes()).hexdigest()
                for folder in ('sources', 'recognized') for p in (self.ws / folder).rglob('*') if p.is_file()}

    def backup(self):
        target = self.root / 'backup.sqlite'
        if target.exists(): target.unlink()
        with sqlite3.connect(self.db) as source, sqlite3.connect(target) as dest:
            source.backup(dest)
        return target

    def mutate(self, sql, args=()):
        self.backup()
        with sqlite3.connect(self.db) as db:
            db.execute(sql, args)

    def hook(self, body):
        hook = self.root / 'hook.cjs'
        hook.write_text("const w=require('" + PKG + "/skills/third-brain/engine/write.js'); const original=w.ingest; " + body)
        return {**os.environ, 'NODE_OPTIONS': '--require=' + str(hook)}


if __name__ == '__main__':
    f = Fixture()
    try:
        before = f.protected()
        rc, result = f.apply()
        assert rc == 0 and result['status'] == 'indexed_unverified_at_check_time', result
        assert result['expected_count'] > 10, result
        expected = result['expected_count']
        # Supplemental recall observation only; the CLI never uses this as authority.
        rc, recalled = run(['dz', 'recall', '--all', '--project', str(f.ws / '.health-brain'), '--json'])
        assert rc == 0 and isinstance(recalled, list), recalled
        recalled_target = sum('kind=machine-unverified' in r.get('pattern', '') for r in recalled)
        rc, opted = run(['dz', 'recall', '--all', '--include-domain', 'health-research',
                         '--project', str(f.ws / '.health-brain'), '--json'])
        assert rc == 0 and isinstance(opted, list), opted
        opted_count = sum('kind=machine-unverified' in r.get('pattern', '') for r in opted)
        assert opted_count == expected, (opted_count, expected)
        rc, result = f.call('search-known', ['--query', f.term])
        assert rc == 0 and result['status'] == 'known_source_reachable_at_check_time', result
        assert before == f.protected()
        print(json.dumps(dict(ok=True, synthetic_only=True, expected_count=result['expected_count'],
                              supplemental_recall_target_count=recalled_target,
                              supplemental_recall_complete=recalled_target == expected,
                              supplemental_explicit_domain_count=opted_count,
                              authority='native-readonly-sqlite-v2')))
    finally:
        f.close()
