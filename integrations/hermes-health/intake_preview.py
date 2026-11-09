"""Preview local attachments through the shared intake core; never commit to the live map."""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import zipfile

from .health_plugin import HealthTools, Refusal, bounded_run

MAX_INPUT = 16 * 1024 * 1024
MAX_TOTAL = 64 * 1024 * 1024
LIMITS = {'schema': 'ha-intake-limits-1', 'max_entries': 100,
          'max_entry_bytes': MAX_INPUT, 'max_total_bytes': MAX_TOTAL,
          'max_download_bytes': 20 * 1024 * 1024, 'max_path_depth': 8,
          'total_timeout_ms': 25000, 'idle_timeout_ms': 10000}


def preview(tools, args):
    if set(args) - {'attachment', 'expect_sha256'}:
        raise Refusal('arguments_invalid')
    name = args.get('attachment')
    if (not isinstance(name, str) or not name or name.startswith('.')
            or '/' in name or '\\' in name or any(ord(c) < 32 or ord(c) == 127 for c in name)
            or len(name.encode('utf-8')) > 240):
        raise Refusal('attachment_name_invalid')
    suffix = Path(name).suffix.lower()
    if suffix not in {'.pdf', '.zip'}:
        raise Refusal('attachment_type_unsupported')
    expected = args.get('expect_sha256')
    if expected is not None and (not isinstance(expected, str) or not re.fullmatch('[0-9a-f]{64}', expected)):
        raise Refusal('digest_invalid')
    inbox = os.environ.get('HEALTH_INBOX')
    if not inbox:
        raise Refusal('inbox_not_configured')
    reader = HealthTools(inbox, tools.node, tools.runtime)
    content = reader.read(name, internal=True, limit=MAX_INPUT)
    if content != reader.read(name, internal=True, limit=MAX_INPUT):
        raise Refusal('attachment_changed_retry')
    digest = hashlib.sha256(content).hexdigest()
    if expected is not None and expected != digest:
        raise Refusal('attachment_digest_mismatch')
    if suffix == '.pdf' and (not content.startswith(b'%PDF-') or b'%%EOF' not in content[-1024:]):
        raise Refusal('pdf_envelope_invalid')
    original_manifest = tools.read('sources/manifest.json', limit=8 * 1024 * 1024)
    with tempfile.TemporaryDirectory(prefix='hermes-health-preview-') as temp:
        root = Path(temp)
        workspace = root / 'preview'
        workspace.mkdir()
        # Catalog validation uses exactly the captured live manifest, not another live read.
        compare = root / 'catalog-copy'
        (compare / 'sources').mkdir(parents=True)
        (compare / 'sources/manifest.json').write_bytes(original_manifest)
        live_rows = HealthTools(compare, tools.node, tools.runtime).catalog()
        archive = root / 'input.zip'
        if suffix == '.pdf':
            with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED) as z:
                z.writestr(name, content)
        else:
            archive.write_bytes(content)
        archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        limits = root / 'limits.json'
        limits.write_text(json.dumps(LIMITS))
        cli = tools.runtime / 'node_modules/@dzhechkov/health-advisor/bin/health-advisor.js'
        env = {'HOME': str(root), 'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}
        result = json.loads(bounded_run([str(tools.node), str(cli), 'intake-archive',
                         '--workspace', str(workspace), '--file', str(archive),
                         '--expect-sha256', archive_digest, '--limits', str(limits), '--json'], env=env))
        if not isinstance(result, dict) or result.get('ok') is not True:
            raise Refusal('preview_core_contract_invalid')
        staged = HealthTools(workspace, tools.node, tools.runtime)
        checked = staged.call('validate', {})
        if not checked.get('ok'):
            raise Refusal('preview_output_invalid')
        rows = staged.catalog()
        if not 1 <= len(rows) <= 100 or sum(r['bytes'] for r in rows) > MAX_TOTAL:
            raise Refusal('preview_output_limit')
        by_hash = {}
        for row in live_rows:
            by_hash.setdefault((row['sha256'], row['bytes']), []).append(row)
        files, verified, compared_bytes = [], set(), 0
        deadline = time.monotonic() + 20
        for row in rows:
            matches = by_hash.get((row['sha256'], row['bytes']), [])
            for existing in matches:
                if existing['stored_at'] in verified:
                    continue
                if time.monotonic() > deadline or compared_bytes + existing['bytes'] > MAX_TOTAL:
                    raise Refusal('duplicate_check_budget')
                raw = tools.read(existing['stored_at'])
                compared_bytes += len(raw)
                if len(raw) != existing['bytes'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
                    raise Refusal('duplicate_source_drift')
                verified.add(existing['stored_at'])
            path = row.get('path')
            if not isinstance(path, str) or len(path) > 2048:
                raise Refusal('preview_output_invalid')
            files.append({'path': path, 'bytes': row['bytes'], 'sha256': row['sha256'],
                          'duplicate_status': 'verified_exact_match' if matches else 'no_exact_catalog_match',
                          'matching_entries': len(matches),
                          'human_verification': 'not_established'})
        if tools.read('sources/manifest.json', limit=8 * 1024 * 1024) != original_manifest:
            raise Refusal('catalog_changed_retry')
        return {'ok': True, 'mode': 'preview_only', 'attachment_sha256': digest,
                'caller_digest_checked': expected is not None,
                'manifest_sha256': hashlib.sha256(original_manifest).hexdigest(),
                'files': files, 'live_write': False, 'content_trust': 'untrusted_document',
                'limitations': ['not_a_commit_authorization', 'no_ocr_or_clinical_verification',
                               'no_full_pdf_structure_validation', 'duplicates_limited_to_current_catalog',
                               'repeat_preview_if_input_or_catalog_changes']}
