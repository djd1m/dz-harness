#!/usr/bin/env python3
"""Prepare a decision manifest or validate a whole answer document. Python stdlib only."""
import copy
import hashlib
import json
import math
import re
import sys


class ContractError(ValueError):
    """Invalid, stale or unbound decision data."""


def _require(condition, message):
    if not condition:
        raise ContractError(message)


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result, 'duplicate JSON key: ' + key)
        result[key] = value
    return result


def _finite(value):
    if isinstance(value, float):
        _require(math.isfinite(value), 'nonfinite JSON number')
    elif isinstance(value, dict):
        for key, item in value.items():
            _scalar(key)
            _finite(item)
    elif isinstance(value, list):
        for item in value:
            _finite(item)
    elif isinstance(value, str):
        _scalar(value)


def _constant(value):
    raise ContractError('nonfinite JSON constant: ' + value)


def load_strict_json(raw):
    """Reject lost duplicate keys, nonfinite numbers and unpaired surrogates."""
    try:
        value = json.loads(raw, object_pairs_hook=_pairs, parse_constant=_constant)
    except (json.JSONDecodeError, UnicodeError, RecursionError) as error:
        raise ContractError('invalid JSON: ' + str(error)) from error
    _finite(value)
    return value


def _scalar(value):
    _require(isinstance(value, str), 'expected string')
    _require(not any(0xD800 <= ord(char) <= 0xDFFF for char in value), 'unpaired Unicode surrogate')


V2_WHITESPACE = re.compile(r'[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+')


def normalize_material_text(value):
    """Only visible v2 material collapses the shared explicit whitespace set."""
    return V2_WHITESPACE.sub(' ', value).strip(' ')


def _text(value):
    _scalar(value)
    _require(bool(normalize_material_text(value)), 'expected nonempty text')


def _object(value, required, optional=()):
    _require(type(value) is dict, 'expected object')
    _require(set(required) <= value.keys(), 'missing fields: ' + ', '.join(sorted(set(required) - value.keys())))
    _require(value.keys() <= set(required) | set(optional), 'unknown fields: ' + ', '.join(sorted(value.keys() - set(required) - set(optional))))


def _array(value, minimum=0):
    _require(type(value) is list and len(value) >= minimum, 'expected array with at least %s item(s)' % minimum)


def _texts(value):
    _array(value)
    for item in value:
        _text(item)


def _version(value):
    _require(type(value) in (int, float) and value == 2, 'schemaVersion must be numeric 2')


def _revision(value):
    _require(isinstance(value, str) and re.fullmatch(r'sha256:[0-9a-f]{64}', value) is not None, 'invalid revision')


def _unique(items, name):
    ids = [item['id'] for item in items]
    _require(len(ids) == len(set(ids)), 'duplicate ' + name + ' ID')


def _manifest_shape(manifest, prepare=False):
    _finite(manifest)
    fields = ('schemaVersion', 'pageId', 'topic', 'date', 'context', 'grounds', 'decisions')
    _object(manifest, fields if prepare else fields + ('revision',), ('components', 'revision') if prepare else ('components',))
    _version(manifest['schemaVersion'])
    for name in ('pageId', 'topic', 'date'):
        _text(manifest[name])
    if 'revision' in manifest:
        _revision(manifest['revision'])
    context = manifest['context']
    _object(context, ('task', 'done', 'remaining', 'whyNow', 'constraints', 'risks', 'unknowns', 'requestedAnswer'))
    for name in ('task', 'whyNow', 'requestedAnswer'):
        _text(context[name])
    for name in ('done', 'remaining', 'constraints', 'risks', 'unknowns'):
        _texts(context[name])
    _array(manifest['grounds'])
    for ground in manifest['grounds']:
        _object(ground, ('id', 'kind', 'claim', 'source'), ('basis', 'observedAt', 'commit'))
        for value in ground.values():
            _text(value)
        _require(ground['kind'] in ('fact', 'estimate', 'assumption', 'unknown'), 'invalid evidence kind')
        _require(ground['kind'] != 'estimate' or 'basis' in ground, 'estimate requires basis')
    _unique(manifest['grounds'], 'ground')
    _array(manifest['decisions'], 1)
    for decision in manifest['decisions']:
        _object(decision, ('id', 'label', 'rationale', 'recommendedOptionId', 'options'), ('excludedAlternatives',))
        for name in ('id', 'label', 'rationale'):
            _text(decision[name])
        _array(decision['options'], 2)
        for option in decision['options']:
            _object(option, ('id', 'label', 'cost', 'whenUseful'))
            for value in option.values():
                _text(value)
        _unique(decision['options'], 'option')
        recommended = decision['recommendedOptionId']
        _require(recommended is None or any(option['id'] == recommended for option in decision['options']), 'unknown recommended option')
        if 'excludedAlternatives' in decision:
            _array(decision['excludedAlternatives'])
            for excluded in decision['excludedAlternatives']:
                _object(excluded, ('label', 'reason', 'assumptions'))
                _text(excluded['label'])
                _text(excluded['reason'])
                _texts(excluded['assumptions'])
    _unique(manifest['decisions'], 'decision')
    if 'components' in manifest:
        _array(manifest['components'])
        for component in manifest['components']:
            _object(component, ('id', 'label'))
            _text(component['id'])
            _text(component['label'])
        _unique(manifest['components'], 'component')


def _digest(manifest):
    content = {key: value for key, value in manifest.items() if key != 'revision'}
    content['schemaVersion'] = 2
    raw = json.dumps(content, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)
    return 'sha256:' + hashlib.sha256(raw.encode('utf-8')).hexdigest()


def prepare_decision_manifest(manifest):
    """Explicit authoring mode is the only operation that replaces a revision."""
    _manifest_shape(manifest, prepare=True)
    result = copy.deepcopy(manifest)
    result['schemaVersion'] = 2
    result['revision'] = _digest(result)
    return result


def validate_decision_manifest(manifest):
    _manifest_shape(manifest)
    _require(manifest['revision'] == _digest(manifest), 'manifest revision mismatch; prepare author context explicitly')
    result = copy.deepcopy(manifest)
    result['schemaVersion'] = 2
    return result


def validate_decision_answer(manifest, answer):
    """Use the receiver's current manifest; return complete normalized answer rows."""
    current = validate_decision_manifest(manifest)
    _finite(answer)
    _object(answer, ('schemaVersion', 'pageId', 'revision', 'answers'))
    _version(answer['schemaVersion'])
    _text(answer['pageId'])
    _revision(answer['revision'])
    _require(answer['pageId'] == current['pageId'], 'wrong page; explicit reconfirmation required')
    _require(answer['revision'] == current['revision'], 'stale revision; explicit reconfirmation required')
    _array(answer['answers'])
    decisions = {decision['id']: decision for decision in current['decisions']}
    rows = {}
    for row in answer['answers']:
        _object(row, ('decisionId', 'status'), ('optionId', 'note'))
        _text(row['decisionId'])
        _require(row['decisionId'] in decisions, 'unknown decision ID')
        _require(row['decisionId'] not in rows, 'duplicate answer row')
        status = row['status']
        _require(isinstance(status, str) and status in ('selected', 'deferred', 'needs-data', 'unanswered'), 'invalid answer status')
        if status == 'selected':
            _require('optionId' in row, 'selected requires optionId')
            _text(row['optionId'])
            _require(any(option['id'] == row['optionId'] for option in decisions[row['decisionId']]['options']), 'unknown option ID')
        else:
            _require('optionId' not in row, 'non-selected forbids optionId')
        if 'note' in row:
            _require(status in ('deferred', 'needs-data'), 'note requires deferred or needs-data')
            _text(row['note'])
        rows[row['decisionId']] = copy.deepcopy(row)
    return {'schemaVersion': 2, 'pageId': current['pageId'], 'revision': current['revision'],
            'answers': [rows.get(decision['id'], {'decisionId': decision['id'], 'status': 'unanswered'}) for decision in current['decisions']]}


def main(argv):
    prepare = len(argv) == 2 and argv[0] == '--prepare'
    if not prepare and (len(argv) != 2 or any(arg.startswith('--') for arg in argv)):
        print('usage: check_answer.py --prepare manifest.json | current-manifest.json answer.json', file=sys.stderr)
        return 2
    try:
        raws = [open(path, encoding='utf-8').read() for path in (argv[1:] if prepare else argv)]
    except (OSError, UnicodeError) as error:
        print(json.dumps({'valid': False, 'error': str(error)}))
        return 2
    try:
        inputs = [load_strict_json(raw) for raw in raws]
        result = prepare_decision_manifest(inputs[0]) if prepare else validate_decision_answer(*inputs)
        print(json.dumps(result if prepare else {'valid': True, 'answer': result}, sort_keys=True, ensure_ascii=True, allow_nan=False))
        return 0
    except (ContractError, RecursionError) as error:
        print(json.dumps({'valid': False, 'error': str(error)}, ensure_ascii=True))
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
