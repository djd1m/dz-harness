"""Fixed, fail-closed worker protocol. No parser import in broker."""
import json
INPUT_MAX = 8 * 1024 * 1024
OUTPUT_MAX = 1024 * 1024
ENGINE = {'name': 'pypdf', 'version': '7.0.0'}
STATUSES = frozenset('ok partial_text no_text encrypted page_limit output_limit input_limit timeout resource_limit invalid_pdf engine_unavailable unsupported_engine_version worker_error request_error'.split())

def result(status):
    return {'status': status, 'engine': dict(ENGINE), 'pages': []}

def encode(payload):
    return json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

def validate(payload):
    if type(payload) is not dict or set(payload) != {'status', 'engine', 'pages'}:
        raise ValueError('payload')
    if payload['engine'] != ENGINE or payload['status'] not in STATUSES:
        raise ValueError('engine/status')
    pages = payload['pages']
    if type(pages) is not list or len(pages) > 50:
        raise ValueError('pages')
    if payload['status'] not in ('ok', 'partial_text', 'no_text') and pages:
        raise ValueError('error pages')
    total = 0
    nonempty = 0
    for i, page in enumerate(pages, 1):
        if type(page) is not dict or set(page) != {'number', 'text', 'text_status'}:
            raise ValueError('page')
        if type(page['number']) is not int or page['number'] != i or type(page['text']) is not str:
            raise ValueError('page types')
        text = page['text']
        if len(text) > 100000:
            raise ValueError('page text limit')
        total += len(text)
        nonempty += bool(text.strip())
        if page['text_status'] != ('text' if text.strip() else 'no_text'):
            raise ValueError('text status')
    if total > 500000 or len(encode(payload)) > OUTPUT_MAX:
        raise ValueError('output limit')
    if payload['status'] in ('ok', 'partial_text', 'no_text'):
        expected = 'no_text' if not nonempty else ('ok' if nonempty == len(pages) else 'partial_text')
        if payload['status'] != expected:
            raise ValueError('status consistency')
    return payload
