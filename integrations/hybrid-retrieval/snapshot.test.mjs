import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as lance from '@lancedb/lancedb';
import {buildSnapshot, openSnapshot, SnapshotError} from './index.mjs';
import {createSearchServer} from './service.mjs';
const exec = promisify(execFile);
const pkg = fileURLToPath(new URL('.', import.meta.url));
const identity = {revision: '2026-11-10:test-r1', model: 'fixture-vectors-v1', dimensions: 3, lexicalizerId: 'identity-v1'};
const documents = [
  {id: 'fruit/apple', text: 'apple fruit orchard', vector: [1, 0, 0]},
  {id: 'fruit/pear', text: 'pear fruit orchard', vector: [0.9, 0.1, 0]},
  {id: 'tool/hammer', text: 'hammer carpenter steel', vector: [0, 1, 0]},
  {id: 'sky/blue', text: 'blue sky cloud', vector: [0, 0, 1]},
  {id: 'z-tie', text: 'same identical', vector: [0, 0.5, 0.5]},
  {id: 'a-tie', text: 'same identical', vector: [0, 0.5, 0.5]},
];
async function fixture(t, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), 'hybrid-retrieval-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const options = {...identity, directory: join(root, 'generation'), documents, ...extra};
  const snapshot = await buildSnapshot(options);
  t.after(() => snapshot.close());
  return {root, options, snapshot};
}
const apple = {query: 'apple orchard', vector: [1, 0, 0], revision: identity.revision};

test('real Lance roundtrip and independent consumers retain native hybrid scores/order', async t => {
  const {options, snapshot} = await fixture(t);
  const expected = await snapshot.search(apple);
  assert.equal(expected.hits.length, 5); assert.equal(expected.hits[0].id, 'fruit/apple');
  assert(expected.hits.every(hit => Number.isFinite(hit.score)));
  const second = await openSnapshot(options); t.after(() => second.close());
  assert.deepEqual(await second.search(apple), expected);
  const script = `import {openSnapshot} from ${JSON.stringify(new URL('./index.mjs', import.meta.url).href)};const s=await openSnapshot(${JSON.stringify(options)});console.log(JSON.stringify(await s.search(${JSON.stringify(apple)})));s.close();`;
  for (let i = 0; i < 2; i++) {
    const child = await exec(process.execPath, ['--input-type=module', '-e', script], {env: {PATH: process.env.PATH}});
    assert.deepEqual(JSON.parse(child.stdout), expected);
  }
  const tied = await snapshot.search({query: 'same identical', vector: [0, 0.5, 0.5], revision: identity.revision});
  assert.deepEqual(await second.search({query: 'same identical', vector: [0, 0.5, 0.5], revision: identity.revision}), tied);
});

test('unrelated corpus and injected lexicalizer with arbitrary IDs', async t => {
  const opts = {revision: 'recipes-v7', model: 'other-model', dimensions: 2, lexicalizerId: 'lowercase-tokens-v1', lexicalize: text => text.toLowerCase().split(/\s+/),
    documents: [{id: '🥣 soup', text: 'Tomato Soup', vector: [1, 0]}, {id: '面', text: 'Noodle Pasta', vector: [0, 1]}]};
  const {snapshot, options} = await fixture(t, opts);
  assert.equal((await snapshot.search({query: 'TOMATO', vector: [1, 0], revision: opts.revision})).hits[0].id, '🥣 soup');
  await assert.rejects(openSnapshot({...options, lexicalize: text => 'wrong ' + text}), {code: 'SNAPSHOT_CORRUPT'});
});

test('immutable publication rejects overwrite/concurrency and leaves no staging debris', async t => {
  const {snapshot, options, root} = await fixture(t);
  const manifest = await readFile(join(options.directory, 'manifest.json'), 'utf8');
  await assert.rejects(buildSnapshot(options), {code: 'SNAPSHOT_EXISTS'});
  assert.equal(await readFile(join(options.directory, 'manifest.json'), 'utf8'), manifest);
  const results = await Promise.allSettled([buildSnapshot({...options, directory: join(root, 'concurrent')}), buildSnapshot({...options, directory: join(root, 'concurrent')})]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  results.filter(r => r.status === 'fulfilled').forEach(r => r.value.close());
  assert.deepEqual((await readdir(root)).sort(), ['concurrent', 'generation']);
  snapshot.close(); await assert.rejects(snapshot.search(apple), {code: 'SNAPSHOT_CLOSED'});
});

test('rejects wrong identity, invalid vectors, duplicate IDs and invalid lexicalizer identity', async t => {
  const {snapshot, options} = await fixture(t);
  for (const change of [{revision: 'old'}, {model: 'other'}, {dimensions: 2}, {lexicalizerId: 'changed'}]) {
    await assert.rejects(openSnapshot({...options, ...change}), {code: 'IDENTITY_MISMATCH'});
  }
  await assert.rejects(snapshot.search({...apple, revision: 'old'}), {code: 'IDENTITY_MISMATCH'});
  for (const vector of [[1, 0], [NaN, 0, 1], [Infinity, 1, 0], [0, 0, 0], ['1', 0, 0], [1e50, 0, 0], [1e30, 0, 0], [1e-30, 0, 0]]) {
    await assert.rejects(snapshot.search({...apple, vector}), {code: 'INVALID_VECTOR'});
  }
  await assert.rejects(snapshot.search({...apple, limit: 0}), {code: 'INVALID_QUERY'});
  await assert.rejects(buildSnapshot({...options, documents: [documents[0], documents[0]]}), {code: 'INVALID_DOCUMENTS'});
  await assert.rejects(buildSnapshot({...options, lexicalize: x => x, lexicalizerId: undefined}), {code: 'INVALID_CONFIG'});
});

test('reopen validates actual stored text, vector and lexical content', async t => {
  for (const field of ['text', 'vector', 'lexical']) {
    const {options, snapshot} = await fixture(t);
    snapshot.close();
    const db = await lance.connect(join(options.directory, 'lance'));
    const table = await db.openTable('documents');
    await table.update({where: "id = 'fruit/apple'", values: {[field]: field === 'vector' ? [0, 0, 1] : 'altered content'}});
    table.close(); db.close();
    await assert.rejects(openSnapshot(options), {code: 'SNAPSHOT_CORRUPT'});
  }
});

test('HTTP checks complete identity, vector bounds, JSON/body limits and private generic routes', async t => {
  const {snapshot} = await fixture(t);
  const server = createSearchServer({snapshot});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = body => fetch(url + '/search', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  assert.deepEqual(await (await fetch(url + '/health')).json(), {ok: true, ...identity});
  const response = await post({...identity, ...apple});
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), await snapshot.search(apple));
  for (const key of Object.keys(identity)) {
    const body = {...identity, ...apple}; delete body[key];
    assert.equal((await post(body)).status, 409);
  }
  assert.equal((await post({...identity, ...apple, vector: [1]})).status, 400);
  assert.equal((await post({...identity, ...apple, query: 'x'.repeat(6001)})).status, 400);
  assert.equal((await post({stuff: 'x'.repeat(256 * 1024)})).status, 413);
  assert.equal((await fetch(url + '/search', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{'})).status, 400);
  assert.equal((await fetch(url + '/search')).status, 405);
  assert.equal((await fetch(url + '/anything')).status, 404);
});

test('npm tarball installs outside repo and serves unrelated corpus over HTTP', {timeout: 120000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'hybrid-external-consumer-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const {stdout} = await exec('npm', ['pack', '--json', '--pack-destination', root], {cwd: pkg});
  const packed = JSON.parse(stdout)[0];
  assert(packed.files.every(f => !f.path.includes('node_modules') && !f.path.includes('catalog')));
  await writeFile(join(root, 'package.json'), JSON.stringify({private: true, type: 'module'}));
  await exec('npm', ['install', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund', join(root, packed.filename)], {cwd: root, timeout: 90000});
  await writeFile(join(root, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import {buildSnapshot,openSnapshot} from '@aicoding/hybrid-retrieval';
import {createSearchServer} from '@aicoding/hybrid-retrieval/service';
const opts={directory:'./weather-index',revision:'weather-r1',model:'weather-vectors',dimensions:2,documents:[{id:'rain',text:'wet rainfall',vector:[1,0]},{id:'sun',text:'dry sunlight',vector:[0,1]}]};
const built=await buildSnapshot(opts);built.close();const snapshot=await openSnapshot(opts);
const server=createSearchServer({snapshot});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...snapshot.identity,query:'wet rainfall',vector:[1,0]})});assert.equal(response.status,200);assert.equal((await response.json()).hits[0].id,'rain');console.log('external tarball HTTP consumer passed');}finally{await new Promise(r=>{server.closeAllConnections();server.close(r)});snapshot.close();}
`);
  const consumer = await exec(process.execPath, ['consumer.mjs'], {cwd: root, env: {PATH: process.env.PATH}});
  assert.match(consumer.stdout, /external tarball HTTP consumer passed/);
});


test('native RRF requested-five window matches independent branch-rank oracle and returned tie order', async t => {
  // Equal lengths make lexical rank follow apple frequency. Vector ranks deliberately differ.
  const vectorOrder = ['e', 'd', 'c', 'b', 'f', 'a', 'g'];
  const docs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => {
    const rank = vectorOrder.indexOf(id);
    return {id, text: [...Array(7 - i).fill('apple'), ...Array(i).fill('filler')].join(' '), vector: [7 - rank, rank, 0]};
  });
  const {options, snapshot} = await fixture(t, {documents: docs});
  const db = await lance.connect(join(options.directory, 'lance'));
  const table = await db.openTable('documents');
  try {
    const lexical = await table.query().fullTextSearch('apple', {columns: ['lexical']}).limit(5).toArray();
    const semantic = await table.vectorSearch([1, 0, 0]).distanceType('cosine').limit(5).toArray();
    assert.deepEqual(lexical.map(r => r.id), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(semantic.map(r => r.id), ['e', 'd', 'c', 'b', 'f']);
  } finally { table.close(); db.close(); }
  // Native RRF(k=60, zero-based ranks), each branch limited to five. a has only lexical evidence;
  // f has only vector evidence. Expanding the branch window incorrectly changes these scores/order.
  const hits = (await snapshot.search({query: 'apple', vector: [1, 0, 0], revision: identity.revision})).hits;
  assert.deepEqual(hits.map(h => h.id), ['e', 'b', 'd', 'c', 'a']);
  assert.equal(hits[1].score, hits[2].score);
  const expectedScores = [1 / 64 + 1 / 60, 1 / 61 + 1 / 63, 1 / 63 + 1 / 61, 2 / 62, 1 / 60];
  hits.forEach((hit, i) => assert(Math.abs(hit.score - expectedScores[i]) < 1e-8));
});

test('HTTP integrity errors remain 409 and do not masquerade as availability failures', async t => {
  const server = createSearchServer({snapshot: {identity, async search() { throw new SnapshotError('SNAPSHOT_CORRUPT', 'private integrity details'); }}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/search`, {
    method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...identity, ...apple}),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {error: 'SNAPSHOT_CORRUPT'});
});
