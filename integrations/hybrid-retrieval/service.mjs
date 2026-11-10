/** Private-network HTTP transport; deployment owns network isolation and listening. */
import {createServer} from 'node:http';
import {SnapshotError} from './index.mjs';

const MAX_BODY = 256 * 1024;
export function createSearchServer({snapshot}) {
  const identity = snapshot.identity;
  if (!identity || typeof snapshot.search !== 'function') throw new TypeError('Opened snapshot required');
  const server = createServer({headersTimeout: 5000, requestTimeout: 10000, connectionsCheckingInterval: 1000}, async (req, res) => {
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/health') { send(200, {ok: true, ...identity}); return; }
    if (req.url !== '/search') { send(404, {error: 'NOT_FOUND'}); return; }
    if (req.method !== 'POST') { send(405, {error: 'METHOD_NOT_ALLOWED'}); return; }
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') { send(415, {error: 'CONTENT_TYPE'}); return; }
    if (Number(req.headers['content-length']) > MAX_BODY) { send(413, {error: 'BODY_TOO_LARGE'}); req.resume(); return; }
    const timer = setTimeout(() => { send(408, {error: 'BODY_TIMEOUT'}); req.destroy(); }, 5000);
    timer.unref();
    let body;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) { send(413, {error: 'BODY_TOO_LARGE'}); return; }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { send(400, {error: 'INVALID_JSON'}); return; }
    finally { clearTimeout(timer); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { send(400, {error: 'INVALID_QUERY'}); return; }
    if (Object.entries(identity).some(([key, value]) => body[key] !== value)) { send(409, {error: 'IDENTITY_MISMATCH'}); return; }
    try { send(200, await snapshot.search(body)); }
    catch (error) {
      const code = error instanceof SnapshotError ? error.code : 'SEARCH_FAILED';
      const status = ['IDENTITY_MISMATCH', 'SNAPSHOT_CORRUPT'].includes(code) ? 409 : ['INVALID_QUERY', 'INVALID_VECTOR', 'INVALID_LEXICALIZER'].includes(code) ? 400 : 503;
      send(status, {error: code});
    }
  });
  server.maxHeadersCount = 32;
  server.keepAliveTimeout = 5000;
  return server;
}
