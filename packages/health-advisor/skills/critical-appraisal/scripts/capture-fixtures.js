#!/usr/bin/env node
'use strict';
// ha-ca1 — OPT-IN fixture capture. This script USES THE NETWORK and is NEVER invoked by `npm test`
// (the suite greps for exactly that). It captures a live Observation plus its provenance sidecar
// ({sourceUrl, capturedAt, httpStatus, sha256, capturedBy}) so a committed fixture is
// distinguishable from a fabricated one.
//
//   node capture-fixtures.js --url <https-url> --out <fixture.json>

const fs = require('node:fs');
const path = require('node:path');

function main() {
  const argv = process.argv.slice(2);
  let url = null;
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') url = argv[++i];
    else if (argv[i] === '--out') out = argv[++i];
  }
  if (!url || !out) {
    process.stderr.write('usage: capture-fixtures.js --url <https-url> --out <fixture.json>\n');
    process.exit(2);
  }
  // resolve the engine's transport through the same closed resolver discipline as appraise.js
  const enginePath = path.join(__dirname, '..', '..', '..', 'lib', 'appraisal-transport.js');
  const { createTransport } = require(enginePath);
  createTransport().get(url).then((obs) => {
    if (obs.answered !== true) {
      process.stderr.write(`[ERROR] capture failed: ${obs.reason} (${obs.detail || 'no detail'})\n`);
      process.exit(1);
    }
    fs.writeFileSync(out, obs.body); // byte-exact: the sidecar's sha256 is of THESE bytes
    const sidecar = {
      sourceUrl: url,
      capturedAt: obs.fetchedAt,
      httpStatus: obs.httpStatus,
      sha256: obs.sha256,
      capturedBy: 'skills/critical-appraisal/scripts/capture-fixtures.js',
    };
    fs.writeFileSync(`${out.replace(/\.json$/, '')}.meta.json`, `${JSON.stringify(sidecar, null, 2)}\n`);
    process.stdout.write(`captured ${url} -> ${out} (HTTP ${obs.httpStatus}, sha256 ${obs.sha256.slice(0, 12)}…)\n`);
  });
}

/* istanbul ignore next -- network CLI, never run by the suite */
if (require.main === module) main();
