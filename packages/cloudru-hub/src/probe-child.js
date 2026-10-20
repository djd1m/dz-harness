'use strict';
// One-shot live tools/list probe. MCP servers may stay alive after stdin EOF;
// terminate the child after the first matching response instead of waiting for exit.
const { spawn } = require('child_process');

const bin = process.argv[2];
const child = spawn(bin, ['mcp'], { stdio: ['pipe', 'pipe', 'ignore'] });
let buffer = '';
let done = false;
const fail = (message) => {
  if (done) return;
  done = true;
  process.stderr.write(message + '\n');
  child.kill();
  process.exitCode = 1;
};
child.on('error', (error) => fail(error.message));
child.on('exit', (code) => { if (!done) fail(`engine exited before tools/list: ${code}`); });
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  if (done) return;
  buffer += chunk;
  if (Buffer.byteLength(buffer) > 16 * 1024 * 1024) { fail('tools/list response too large'); return; }
  let end;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end).trim();
    buffer = buffer.slice(end + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch { fail('engine emitted invalid JSON'); return; }
    if (message.id !== 1) continue;
    done = true;
    process.stdout.write(JSON.stringify(message) + '\n');
    child.kill();
    return;
  }
});
child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
