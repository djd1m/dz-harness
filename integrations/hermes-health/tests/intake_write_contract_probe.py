"""Characterize pinned core write limitations on synthetic temporary workspaces.

NOT production acceptance. Network must be disabled; never mount the real medical map.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

NODE = '/opt/health-node22/bin/node'
PACKAGE = '/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor'
CLI = PACKAGE + '/bin/health-advisor.js'


def workspace(root, name):
    path = root / name
    (path / 'sources').mkdir(parents=True)
    (path / 'sources/manifest.json').write_text(json.dumps({'schema': 'ha-intake-manifest-1', 'entries': []}))
    return path


def archive(root, name, entries):
    path = root / name
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_STORED) as z:
        for filename, data in entries.items():
            info = zipfile.ZipInfo(filename, date_time=(1980, 1, 1, 0, 0, 0))
            z.writestr(info, data)
    return path


def run(ws, blob=None, verify=False):
    args = [NODE, CLI, 'intake-archive', '--workspace', str(ws), '--json']
    args += ['--verify'] if verify else ['--file', str(blob)]
    p = subprocess.run(args, capture_output=True, text=True, timeout=30)
    try:
        body = json.loads(p.stdout)
    except ValueError:
        body = {'ok': False}
    return p.returncode, body


def main():
    with tempfile.TemporaryDirectory(prefix='health-write-contract-') as temp:
        root = Path(temp)
        payload = b'TECHNICAL ONLY. NO PATIENT DATA.\n'
        first = archive(root, 'first.zip', {'a.txt': payload})
        renamed = archive(root, 'renamed.zip', {'b.txt': payload})
        ws = workspace(root, 'duplicates')
        assert run(ws, first)[0] == 0 and run(ws, renamed)[0] == 0
        rows = json.loads((ws / 'sources/manifest.json').read_text())['entries']
        assert len(rows) == 2 and rows[0]['sha256'] == rows[1]['sha256']

        mixed_ws = workspace(root, 'mixed')
        assert run(mixed_ws, first)[0] == 0
        mixed = archive(root, 'mixed.zip', {'a.txt': payload, 'new.txt': b'NEW TECHNICAL FILE'})
        mixed_code, mixed_result = run(mixed_ws, mixed)
        assert mixed_code == 0 and mixed_result['ok']
        verify_code, verify = run(mixed_ws, verify=True)
        assert verify_code != 0 and not verify['ok']

        corrupt_ws = workspace(root, 'idempotency')
        assert run(corrupt_ws, first)[0] == 0
        row = json.loads((corrupt_ws / 'sources/manifest.json').read_text())['entries'][0]
        (corrupt_ws / row['stored_at']).write_bytes(b'X' * row['bytes'])
        retry_code, retry = run(corrupt_ws, first)
        assert retry_code == 0 and retry.get('idempotent') is True
        assert run(corrupt_ws, verify=True)[0] != 0

        crash_ws = workspace(root, 'crash')
        original = (crash_ws / 'sources/manifest.json').read_bytes()
        # Simulate termination exactly between raw rename and manifest persistence.
        code = """
const root=process.argv[1];
const manifest=require(root+'/skills/intake-archive/engine/manifest.js');
manifest.writeCatalogAtomically=()=>process.exit(93);
const {runIntake}=require(root+'/skills/intake-archive/engine/run.js');
runIntake({workspace:process.argv[2],file:process.argv[3]}).catch(()=>process.exit(94));
"""
        crash = subprocess.run([NODE, '-e', code, PACKAGE, str(crash_ws), str(first)],
                               capture_output=True, timeout=30)
        assert crash.returncode == 93
        raw_files = [p for p in (crash_ws / 'sources/raw').rglob('*') if p.is_file()]
        assert raw_files and (crash_ws / 'sources/manifest.json').read_bytes() == original
        assert run(crash_ws, verify=True)[0] != 0
        print(json.dumps({'different_paths_same_bytes': 'duplicate_rows_observed',
                          'mixed_archive': 'success_then_verify_failure_observed',
                          'same_size_corruption': 'idempotent_success_but_verify_failure_observed',
                          'termination_before_manifest': 'orphan_raw_observed',
                          'production_data_used': False}))


if __name__ == '__main__':
    main()
