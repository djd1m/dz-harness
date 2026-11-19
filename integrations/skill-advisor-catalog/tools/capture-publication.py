#!/usr/bin/env python3
"""Capture npm archive membership and verify SKILL bytes without extracting tar paths.

Usage: python3 tools/capture-publication.py SOURCE_ROOT NEW_JSON
This produces source evidence only, never semantic approval or a live deployment.
"""
import base64
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit
from urllib.request import urlopen

MAX_ARCHIVE = 32 * 1024 * 1024

def download(url, maximum):
    with urlopen(url, timeout=45) as response:
        if urlsplit(response.url).hostname != 'registry.npmjs.org':
            raise ValueError('Unexpected registry redirect')
        value = response.read(maximum + 1)
    if len(value) > maximum:
        raise ValueError('Registry response exceeds bound')
    return value

def observe(manifest_path):
    manifest = json.loads(manifest_path.read_text())
    name, version = manifest['name'], manifest['version']
    metadata = json.loads(download('https://registry.npmjs.org/' + quote(name, safe='') + '/' + quote(version, safe=''), 1024 * 1024))
    if metadata['name'] != name or metadata['version'] != version:
        raise ValueError('Published package identity mismatch')
    dist = metadata['dist']
    if urlsplit(dist['tarball']).scheme != 'https' or urlsplit(dist['tarball']).hostname != 'registry.npmjs.org':
        raise ValueError('Unexpected tarball origin')
    archive = download(dist['tarball'], MAX_ARCHIVE)
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode()
    if integrity != dist['integrity']:
        raise ValueError('Archive integrity mismatch: ' + name)
    files, skills, seen = [], [], set()
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as bundle:
        members = bundle.getmembers()
        if len(members) > 100000 or sum(m.size for m in members) > 256 * 1024 * 1024:
            raise ValueError('Archive expanded size exceeds bound')
        for member in members:
            if not member.isfile():
                continue
            path = member.name
            if not path.startswith('package/'):
                raise ValueError('Unexpected npm tar path')
            path = path[len('package/'):]
            if not path or path.startswith('/') or any(p in ('.', '..') for p in path.split('/')) or path in seen:
                raise ValueError('Unsafe or duplicate npm tar path')
            seen.add(path)
            files.append(path)
            if path.endswith('/SKILL.md') or path == 'SKILL.md':
                source = manifest_path.parent / path
                payload = bundle.extractfile(member).read()
                if not source.is_file() or source.is_symlink() or source.read_bytes() != payload:
                    raise ValueError('Published skill/source mismatch: ' + name + '/' + path)
                skills.append({'path': path, 'sha256': hashlib.sha256(payload).hexdigest(), 'sourceExists': True, 'sourceMatches': True})
    return {'name': name, 'version': version, 'integrity': integrity, 'archiveBytes': len(archive), 'fileCount': len(files), 'files': sorted(files), 'skills': sorted(skills, key=lambda s: s['path'])}

def main():
    root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2])
    if output.exists():
        raise ValueError('Refusing existing evidence output')
    manifests = sorted((root / 'packages').glob('*/package.json'))
    if not manifests:
        raise ValueError('No source packages')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        packages = list(pool.map(observe, manifests))
    document = {'schema': 1, 'observedAt': datetime.now(timezone.utc).isoformat(), 'sourceCommit': commit, 'packages': packages}
    with output.open('x') as stream:
        json.dump(document, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'packages': len(packages), 'skills': sum(len(p['skills']) for p in packages)}))

if __name__ == '__main__':
    main()
