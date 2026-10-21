'use strict';

// Offline worksheet. All money and resource divisions use integer decimal arithmetic.
const fs = require('fs');

const MAX_INPUT = 128 * 1024;
const MAX_MONEY = 10n ** 18n;
const CATEGORIES = Object.freeze({
  compute: 'instance-hour',
  controlPlane: 'instance-hour',
  storage: 'GB-hour',
  publicIp: 'IP-hour',
  snat: 'gateway-hour',
  loadBalancer: 'LB-hour',
  traffic: 'traffic-GB',
});
const TIME_UNITS = new Set(['instance-hour', 'GB-hour', 'IP-hour', 'gateway-hour', 'LB-hour']);

function fail(path, message) { throw new Error(`${path}: ${message}`); }
function record(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  return value;
}
function required(obj, key, path) {
  if (!Object.hasOwn(obj, key)) fail(`${path}.${key}`, 'required');
  return obj[key];
}
function positiveInteger(value, path, max = 1000000, zero = false) {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1) || value > max) fail(path, `must be an integer from ${zero ? 0 : 1} to ${max}`);
  return value;
}
function words(value, path, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail(path, 'must be a nonempty bounded single-line string');
  return value;
}
function decimal(value, path, { zero = false, max = 1000000000n } = {}) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,9})?$/.test(value)) fail(path, 'must be a non-negative decimal string with at most 9 fractional places');
  const [whole, fraction = ''] = value.split('.');
  const coefficient = BigInt(whole + fraction);
  const scale = 10n ** BigInt(fraction.length);
  if ((!zero && coefficient === 0n) || coefficient > max * scale) fail(path, `must be ${zero ? 'non-negative' : 'positive'} and at most ${max}`);
  return { coefficient, scale };
}
const integerDecimal = value => ({ coefficient: BigInt(value), scale: 1n });
const multiply = (a, b) => ({ coefficient: a.coefficient * b.coefficient, scale: a.scale * b.scale });
const subtract = (a, b) => ({ coefficient: a.coefficient * b.scale - b.coefficient * a.scale, scale: a.scale * b.scale });
const compare = (a, b) => a.coefficient * b.scale < b.coefficient * a.scale ? -1 : a.coefficient * b.scale > b.coefficient * a.scale ? 1 : 0;
function add(a, b) { return { coefficient: a.coefficient * b.scale + b.coefficient * a.scale, scale: a.scale * b.scale }; }
function exact(value) {
  const whole = value.coefficient / value.scale;
  const remainder = value.coefficient % value.scale;
  if (!remainder) return String(whole);
  return `${whole}.${String(remainder).padStart(String(value.scale).length - 1, '0').replace(/0+$/, '')}`;
}
function display(value) {
  const cents = (value.coefficient * 200n + value.scale) / (2n * value.scale);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
function monetary(value, path) {
  if (value.coefficient < 0n || value.coefficient > MAX_MONEY * value.scale) fail(path, 'amount exceeds supported RUB magnitude');
  return value;
}
function slots(usable, perReplica, path) {
  const count = usable.coefficient * perReplica.scale / (usable.scale * perReplica.coefficient);
  if (count > 1000000n) fail(path, 'per-node capacity exceeds supported bound');
  return Number(count);
}

// JSON.parse discards duplicate members and rounds large/fractional numeric tokens.
// Inspect the bounded original text first, including decoded spellings of object keys.
function validateJsonLexemes(text) {
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let offset = 0, tokens = 0;
  const bad = message => fail('--input', message);
  const space = () => { while (offset < text.length && /[ \t\r\n]/.test(text[offset])) offset++; };
  const count = () => { if (++tokens > 10000) bad('JSON has too many members or values'); };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === '\\') { offset += 2; continue; }
      if (text[offset++] === '"') {
        try { return JSON.parse(text.slice(start, offset)); }
        catch { bad('invalid JSON string'); }
      }
    }
    bad('unterminated JSON string');
  };
  const value = depth => {
    count();
    if (depth > 64) bad('JSON nesting exceeds 64 levels');
    space();
    const marker = text[offset];
    if (marker === '{') {
      offset++; space();
      const seen = new Set();
      if (text[offset] === '}') { offset++; return; }
      while (true) {
        if (text[offset] !== '"') bad('object member must be a JSON string');
        count();
        const key = string();
        if (seen.has(key)) bad('duplicate decoded object member');
        seen.add(key);
        space();
        if (text[offset++] !== ':') bad('object member requires a colon');
        value(depth + 1); space();
        const separator = text[offset++];
        if (separator === '}') return;
        if (separator !== ',') bad('object member requires a comma or closing brace');
        space();
      }
    }
    if (marker === '[') {
      offset++; space();
      if (text[offset] === ']') { offset++; return; }
      while (true) {
        value(depth + 1); space();
        const separator = text[offset++];
        if (separator === ']') return;
        if (separator !== ',') bad('array element requires a comma or closing bracket');
      }
    }
    if (marker === '"') { string(); return; }
    for (const literal of ['true', 'false', 'null']) if (text.startsWith(literal, offset)) { offset += literal.length; return; }
    number.lastIndex = offset;
    const match = number.exec(text);
    if (!match) bad('invalid JSON value or number');
    const lexeme = match[0];
    offset = number.lastIndex;
    if (!/^(?:0|[1-9]\d*)$/.test(lexeme) || lexeme.length > 16 || BigInt(lexeme) > BigInt(Number.MAX_SAFE_INTEGER)) {
      bad('numeric tokens must be canonical non-negative safe integers; decimals must be strings');
    }
  };
  space(); value(0); space();
  if (offset !== text.length) bad('trailing or malformed JSON token');
}

function readInput(path) {
  words(path, '--input', 4096);
  const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
  const fd = fs.openSync(path, flags);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_INPUT) fail('--input', 'must be a regular file of at most 128 KiB');
    const chunks = [], buffer = Buffer.alloc(8192);
    let length = 0, read;
    while ((read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, MAX_INPUT + 1 - length), null)) > 0) {
      chunks.push(Buffer.from(buffer.subarray(0, read)));
      length += read;
      if (length > MAX_INPUT) fail('--input', 'file exceeds 128 KiB');
    }
    const bytes = Buffer.concat(chunks), text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes)) fail('--input', 'must be valid UTF-8');
    validateJsonLexemes(text);
    return JSON.parse(text);
  } finally { fs.closeSync(fd); }
}

function tariff(value, path, vatBasis) {
  record(value, path, ['url', 'version', 'asOf', 'vatBasis', 'pageOrRow', 'sha256']);
  const url = words(required(value, 'url', path), `${path}.url`, 1000);
  if (!/^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/.test(url)) fail(`${path}.url`, 'must be an HTTPS tariff URL');
  words(required(value, 'version', path), `${path}.version`, 100);
  const asOf = required(value, 'asOf', path);
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)) || new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf) fail(`${path}.asOf`, 'must be a valid YYYY-MM-DD date');
  if (required(value, 'vatBasis', path) !== vatBasis) fail(`${path}.vatBasis`, 'must match the common VAT basis');
  words(required(value, 'pageOrRow', path), `${path}.pageOrRow`, 100);
  if (value.sha256 !== undefined && (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256))) fail(`${path}.sha256`, 'must be lowercase SHA-256');
  return value;
}

function category(value, path, name, expected, horizon, vatBasis) {
  record(value, path, ['status', 'reason', 'items']);
  const status = required(value, 'status', path);
  if (!['priced', 'not-used', 'unpriced'].includes(status)) fail(`${path}.status`, 'must be priced, not-used or unpriced');
  if (status !== 'priced') {
    if (value.items !== undefined) fail(`${path}.items`, 'allowed only when priced');
    const reason = words(required(value, 'reason', path), `${path}.reason`);
    if (status === 'not-used' && (expected === null || expected.coefficient !== 0n)) fail(path, 'not-used requires a declared zero quantity');
    if (status === 'unpriced' && expected !== null && expected.coefficient === 0n) fail(path, 'declared zero quantity must be not-used');
    return { status, reason, items: [], totalRubExact: null, totalRubDisplay: null };
  }
  if (value.reason !== undefined) fail(`${path}.reason`, 'allowed only when unpriced or not-used');
  if (expected === null || expected.coefficient === 0n) fail(path, 'priced requires a positive declared quantity');
  const items = required(value, 'items', path);
  if (!Array.isArray(items) || !items.length || items.length > 16) fail(`${path}.items`, 'must have 1 to 16 items');
  const seen = new Set();
  let quantitySum = integerDecimal(0), total = integerDecimal(0);
  const result = items.map((item, index) => {
    const at = `${path}.items[${index}]`;
    record(item, at, ['id', 'description', 'quantity', 'unit', 'rateRub', 'tariff']);
    const id = words(required(item, 'id', at), `${at}.id`, 80);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || seen.has(id)) fail(`${at}.id`, 'must be a unique slug');
    seen.add(id);
    words(required(item, 'description', at), `${at}.description`);
    const q = decimal(required(item, 'quantity', at), `${at}.quantity`);
    if (required(item, 'unit', at) !== CATEGORIES[name]) fail(`${at}.unit`, `must be ${CATEGORIES[name]}`);
    if (['compute', 'controlPlane', 'publicIp', 'snat', 'loadBalancer'].includes(name) && q.scale !== 1n) fail(`${at}.quantity`, 'must be an integer service count');
    const rate = decimal(required(item, 'rateRub', at), `${at}.rateRub`);
    tariff(required(item, 'tariff', at), `${at}.tariff`, vatBasis);
    quantitySum = add(quantitySum, q);
    const amount = monetary(multiply(multiply(q, rate), TIME_UNITS.has(item.unit) ? horizon : integerDecimal(1)), `${at}.amount`);
    total = monetary(add(total, amount), `${path}.total`);
    return { ...item, amountRubExact: exact(amount), amountRubDisplay: display(amount), formula: TIME_UNITS.has(item.unit) ? `${item.quantity} ${item.unit.slice(0, -5)} × ${item.rateRub} RUB/${item.unit} × ${exact(horizon)} hours` : `${item.quantity} ${item.unit} × ${item.rateRub} RUB/${item.unit} once` };
  });
  if (compare(quantitySum, expected) !== 0) fail(`${path}.items`, `quantities must sum to declared ${exact(expected)} ${CATEGORIES[name]}`);
  return { status, items: result, totalRubExact: exact(total), totalRubDisplay: display(total), _total: total };
}

function scenario(value, path, workload, horizon, vatBasis) {
  record(value, path, ['id', 'kind', 'nodes', 'controlPlaneCount', 'resources', 'categories']);
  const id = words(required(value, 'id', path), `${path}.id`, 80);
  if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`${path}.id`, 'must be a slug');
  const kind = required(value, 'kind', path);
  if (!['vm', 'k8s'].includes(kind)) fail(`${path}.kind`, 'must be vm or k8s');
  const node = record(required(value, 'nodes', path), `${path}.nodes`, ['count', 'cpu', 'ramGB', 'reservedCpu', 'reservedRamGB', 'cpuShare']);
  const count = positiveInteger(required(node, 'count', `${path}.nodes`), `${path}.nodes.count`, 1000);
  if (workload.failedNodes > count) fail(`${path}.nodes.count`, 'must be at least the declared failedNodes');
  const cpu = decimal(required(node, 'cpu', `${path}.nodes`), `${path}.nodes.cpu`, { max: 10000n });
  const ram = decimal(required(node, 'ramGB', `${path}.nodes`), `${path}.nodes.ramGB`, { max: 1000000n });
  const share = decimal(required(node, 'cpuShare', `${path}.nodes`), `${path}.nodes.cpuShare`, { max: 1n });
  const reservedCpu = decimal(required(node, 'reservedCpu', `${path}.nodes`), `${path}.nodes.reservedCpu`, { zero: true, max: 10000n });
  const reservedRam = decimal(required(node, 'reservedRamGB', `${path}.nodes`), `${path}.nodes.reservedRamGB`, { zero: true, max: 1000000n });
  const guaranteedCpu = multiply(cpu, share);
  if (compare(reservedCpu, guaranteedCpu) > 0 || compare(reservedRam, ram) > 0) fail(`${path}.nodes`, 'reservations exceed guaranteed CPU or RAM');
  const controlPlaneCount = positiveInteger(required(value, 'controlPlaneCount', path), `${path}.controlPlaneCount`, 1000, kind === 'vm');
  if (kind === 'vm' && controlPlaneCount !== 0) fail(`${path}.controlPlaneCount`, 'VM must declare zero control-plane service instances');
  const resources = record(required(value, 'resources', path), `${path}.resources`, ['storageGB', 'publicIpCount', 'snatGatewayCount', 'loadBalancerCount', 'trafficGB']);
  const storage = decimal(required(resources, 'storageGB', `${path}.resources`), `${path}.resources.storageGB`, { zero: true });
  const publicIp = positiveInteger(required(resources, 'publicIpCount', `${path}.resources`), `${path}.resources.publicIpCount`, 1000000, true);
  const snat = positiveInteger(required(resources, 'snatGatewayCount', `${path}.resources`), `${path}.resources.snatGatewayCount`, 1000000, true);
  const lb = positiveInteger(required(resources, 'loadBalancerCount', `${path}.resources`), `${path}.resources.loadBalancerCount`, 1000000, true);
  const trafficValue = required(resources, 'trafficGB', `${path}.resources`);
  const traffic = trafficValue === null ? null : decimal(trafficValue, `${path}.resources.trafficGB`, { zero: true });
  const expected = { compute: integerDecimal(count), controlPlane: integerDecimal(controlPlaneCount), storage, publicIp: integerDecimal(publicIp), snat: integerDecimal(snat), loadBalancer: integerDecimal(lb), traffic };
  const raw = record(required(value, 'categories', path), `${path}.categories`, Object.keys(CATEGORIES));
  const categories = {}, unpriced = [];
  let known = integerDecimal(0);
  for (const name of Object.keys(CATEGORIES)) {
    const result = category(required(raw, name, `${path}.categories`), `${path}.categories.${name}`, name, expected[name], horizon, vatBasis);
    if (result._total) { known = monetary(add(known, result._total), `${path}.knownSubtotal`); delete result._total; }
    if (result.status === 'unpriced') unpriced.push({ category: name, reason: result.reason });
    categories[name] = result;
  }
  const perNodeCpu = slots(subtract(guaranteedCpu, reservedCpu), workload.cpu, `${path}.nodes.cpu`);
  const perNodeRam = slots(subtract(ram, reservedRam), workload.ram, `${path}.nodes.ramGB`);
  const perNodeSlots = Math.min(perNodeCpu, perNodeRam);
  const normalSlots = count * perNodeSlots;
  const survivingNodes = Math.max(0, count - workload.failedNodes);
  const survivingSlots = survivingNodes * perNodeSlots;
  const feasible = normalSlots >= workload.replicas && survivingSlots >= workload.survivingReplicas;
  return {
    id, kind, nodes: node, controlPlaneCount, resources, categories,
    capacity: { perNodeCpuSlots: perNodeCpu, perNodeRamSlots: perNodeRam, perNodeSlots, normalSlots, survivingNodes, survivingSlots, feasible,
      formula: 'usable guaranteed CPU = cpu × cpuShare − reservedCpu; usable RAM = ramGB − reservedRamGB; per-node slots = min(floor(usable CPU / cpuPerReplica), floor(usable RAM / ramGBPerReplica)); normal/surviving slots = per-node slots × available nodes' },
    unpriced, complete: unpriced.length === 0, knownSubtotalRubExact: exact(known), knownSubtotalRubDisplay: display(known), _known: known,
  };
}

function calculate(input) {
  record(input, 'input', ['schemaVersion', 'horizonHours', 'currency', 'vatBasis', 'workload', 'equivalence', 'scenarios']);
  if (required(input, 'schemaVersion', 'input') !== 1) fail('input.schemaVersion', 'must be 1');
  const horizon = decimal(required(input, 'horizonHours', 'input'), 'input.horizonHours', { max: 8760n });
  if (required(input, 'currency', 'input') !== 'RUB') fail('input.currency', 'must be RUB');
  const vatBasis = required(input, 'vatBasis', 'input');
  if (vatBasis !== 'included') fail('input.vatBasis', 'must be included');
  const rawWorkload = record(required(input, 'workload', 'input'), 'input.workload', ['replicas', 'cpuPerReplica', 'ramGBPerReplica', 'survivingReplicas', 'failedNodes']);
  const workload = {
    replicas: positiveInteger(required(rawWorkload, 'replicas', 'input.workload'), 'input.workload.replicas'),
    cpu: decimal(required(rawWorkload, 'cpuPerReplica', 'input.workload'), 'input.workload.cpuPerReplica', { max: 10000n }),
    ram: decimal(required(rawWorkload, 'ramGBPerReplica', 'input.workload'), 'input.workload.ramGBPerReplica', { max: 1000000n }),
    survivingReplicas: positiveInteger(required(rawWorkload, 'survivingReplicas', 'input.workload'), 'input.workload.survivingReplicas', 1000000, true),
    failedNodes: positiveInteger(required(rawWorkload, 'failedNodes', 'input.workload'), 'input.workload.failedNodes', 1000, true),
  };
  if (workload.survivingReplicas > workload.replicas) fail('input.workload.survivingReplicas', 'cannot exceed replicas');
  const equivalence = record(required(input, 'equivalence', 'input'), 'input.equivalence', ['status', 'assumptions', 'reason']);
  if (!['assumed', 'unknown'].includes(required(equivalence, 'status', 'input.equivalence'))) fail('input.equivalence.status', 'must be assumed or unknown');
  const assumptions = required(equivalence, 'assumptions', 'input.equivalence');
  if (!Array.isArray(assumptions) || assumptions.length > 16 || (equivalence.status === 'assumed' && assumptions.length === 0)) fail('input.equivalence.assumptions', 'must have 1 to 16 assumptions when assumed');
  assumptions.forEach((item, i) => words(item, `input.equivalence.assumptions[${i}]`));
  if (equivalence.status === 'unknown') words(required(equivalence, 'reason', 'input.equivalence'), 'input.equivalence.reason');
  else if (equivalence.reason !== undefined) fail('input.equivalence.reason', 'allowed only when unknown');
  const rawScenarios = required(input, 'scenarios', 'input');
  if (!Array.isArray(rawScenarios) || rawScenarios.length !== 2) fail('input.scenarios', 'must contain exactly one VM and one K8s scenario');
  const scenarios = rawScenarios.map((item, i) => scenario(item, `input.scenarios[${i}]`, workload, horizon, vatBasis));
  if (new Set(scenarios.map(item => item.kind)).size !== 2 || new Set(scenarios.map(item => item.id)).size !== 2) fail('input.scenarios', 'must have unique IDs and one scenario of each kind');
  const reasons = [];
  if (equivalence.status === 'unknown') reasons.push('architecture/HA equivalence is unknown');
  for (const item of scenarios) {
    if (!item.capacity.feasible) reasons.push(`${item.id}: declared normal or node-failure capacity is insufficient`);
    if (!item.complete) reasons.push(`${item.id}: unpriced categories remain`);
  }
  const eligible = reasons.length === 0;
  let winner = null, savings = null, tie = false;
  if (eligible) {
    const [a, b] = scenarios;
    const relation = compare(a._known, b._known);
    tie = relation === 0;
    if (!tie) { winner = relation < 0 ? a.id : b.id; savings = subtract(relation < 0 ? b._known : a._known, relation < 0 ? a._known : b._known); }
  }
  for (const item of scenarios) delete item._known;
  return {
    schemaVersion: 1, horizonHours: input.horizonHours, currency: 'RUB', vatBasis,
    workload: rawWorkload, equivalence,
    scenarios,
    comparison: { eligible, reasons, basis: eligible ? 'conditional lower modeled infrastructure cost under supplied assumptions' : null,
      winner, tie: eligible ? tie : null, savingsRubExact: savings ? exact(savings) : null, savingsRubDisplay: savings ? display(savings) : null },
    limitations: ['Declared quantities and tariff provenance are user assertions, not verified inventory or live prices.',
      'Capacity is a homogeneous per-node packing bound, not a placement, performance, HA or SLA proof.',
      'Static full-horizon resources only; no tiered, monthly, stopped-resource, discount or heterogeneous-fleet modeling.'],
  };
}

function parseFlags(argv) {
  let input = null, json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') { if (json) fail('flags', 'duplicate --json'); json = true; }
    else if (arg === '--input') { if (input !== null) fail('flags', 'duplicate --input'); input = argv[++i]; if (!input || input.startsWith('--')) fail('flags', '--input requires a path'); }
    else fail('flags', `unknown argument ${JSON.stringify(arg)}`);
  }
  if (input === null) fail('flags', '--input is required');
  return { input, json };
}

function run(argv, write = s => process.stdout.write(s + '\n'), error = s => process.stderr.write(s + '\n')) {
  try {
    const flags = parseFlags(argv);
    const result = calculate(readInput(flags.input));
    if (flags.json) write(JSON.stringify(result, null, 2));
    else {
      write(`Offline Cloud.ru cost worksheet — ${result.horizonHours} hours, RUB, VAT included`);
      for (const item of result.scenarios) {
        write(`${item.id} (${item.kind}): known subtotal ${item.knownSubtotalRubExact} RUB (${item.knownSubtotalRubDisplay} displayed); capacity ${item.capacity.normalSlots} normal / ${item.capacity.survivingSlots} after ${result.workload.failedNodes} node failure(s): ${item.capacity.feasible ? 'feasible packing bound' : 'INSUFFICIENT'}`);
        for (const [name, category] of Object.entries(item.categories)) for (const line of category.items) write(`  ${name}/${line.id}: ${line.formula} = ${line.amountRubExact} RUB; tariff ${line.tariff.url} version ${line.tariff.version} as of ${line.tariff.asOf}, ${line.tariff.pageOrRow}, VAT ${line.tariff.vatBasis}`);
        for (const missing of item.unpriced) write(`  unpriced ${missing.category}: ${missing.reason}`);
      }
      write(`Architecture equivalence: ${result.equivalence.status}${result.equivalence.reason ? ` — ${result.equivalence.reason}` : ''}`);
      for (const assumption of result.equivalence.assumptions) write(`  assumption: ${assumption}`);
      write(result.comparison.eligible ? (result.comparison.tie ? 'Conditional modeled cost: tie under supplied assumptions' : `Conditional lower modeled infrastructure cost: ${result.comparison.winner}; savings ${result.comparison.savingsRubExact} RUB (${result.comparison.savingsRubDisplay} displayed)`) : `No winner: ${result.comparison.reasons.join('; ')}`);
      for (const limitation of result.limitations) write(`Limit: ${limitation}`);
      write(`Formulas and tariff provenance: use --json or inspect ${flags.input}`);
    }
    return 0;
  } catch (e) { error(`cloudru-hub cost-compare: ${e.message}`); return 1; }
}

module.exports = { run, calculate, readInput };
