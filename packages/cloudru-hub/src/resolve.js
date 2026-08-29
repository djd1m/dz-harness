'use strict';
// Engine binary resolution — ADR-002: the Go engine is located at RUNTIME, never bundled.
// Resolution order (first hit wins):
//   1. env CLOUDRU_VM_BIN                          — explicit path (local baseline testing)
//   2. config enginePath                           — ~/.cloudru-hub/config.json (or $CLOUDRU_HUB_CONFIG)
//   3. platform package @dzhechkov/cloudru-vm-<os>-<cpu>/native/cloudru-vm
//      (does not exist until the ADR-001 licence grant clears — see LICENSE Part 2)
//   4. loud, esbuild-style error explaining all three paths and the licence hold.
//
// sha256 policy: the resolved binary is hashed and compared against the pinned map in
// package.json `cloudruHub.binaryHashes` (ADR-002 point 2, esbuild.binaryHashes pattern).
//   - platform-package path: mismatch is a HARD error (supply-chain: registry artifact
//     must be byte-exact against the pin);
//   - env/config path: mismatch is reported (`verified:false`) but tolerated — the owner
//     points these at development builds by design.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PKG = require('../package.json');

function platformKey() {
  return `${process.platform === 'darwin' ? 'darwin' : process.platform}-${process.arch}`;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function configPath(env) {
  return (env.CLOUDRU_HUB_CONFIG && String(env.CLOUDRU_HUB_CONFIG)) ||
    path.join(os.homedir(), '.cloudru-hub', 'config.json');
}

function readConfig(env) {
  try {
    const raw = fs.readFileSync(configPath(env), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the engine binary WITHOUT touching the network.
 * @param {NodeJS.ProcessEnv} env
 * @returns {{path:string, source:'env'|'config'|'platform-package', sha256:string,
 *            verified:boolean, pinned:string|null, key:string} | {error:string}}
 */
function resolveEngine(env = process.env) {
  const key = platformKey();
  const pinned = (PKG.cloudruHub && PKG.cloudruHub.binaryHashes && PKG.cloudruHub.binaryHashes[key]) || null;

  const candidates = [];
  if (env.CLOUDRU_VM_BIN) candidates.push({ path: String(env.CLOUDRU_VM_BIN), source: 'env' });
  const cfg = readConfig(env);
  if (cfg.enginePath) candidates.push({ path: String(cfg.enginePath), source: 'config' });
  const platformPkg = PKG.cloudruHub && PKG.cloudruHub.platformPackages && PKG.cloudruHub.platformPackages[key];
  if (platformPkg) {
    try {
      const pkgJson = require.resolve(`${platformPkg}/package.json`);
      candidates.push({ path: path.join(path.dirname(pkgJson), 'native', 'cloudru-vm'), source: 'platform-package' });
    } catch {
      /* optional platform package not installed — expected while the ADR-001 hold is in force */
    }
  }

  for (const cand of candidates) {
    if (!fs.existsSync(cand.path)) continue;
    let st;
    try { st = fs.statSync(cand.path); } catch { continue; }
    if (!st.isFile()) continue;
    const sha = sha256File(cand.path);
    const verified = pinned !== null && sha === pinned;
    if (cand.source === 'platform-package' && !verified) {
      return {
        error:
          `cloudru-hub: platform package binary at ${cand.path} does NOT match the pinned sha256 for ${key}\n` +
          `  expected ${pinned}\n  actual   ${sha}\n` +
          'Refusing to run an unpinned registry artifact (ADR-002 supply-chain rule).',
      };
    }
    return { path: cand.path, source: cand.source, sha256: sha, verified, pinned, key };
  }

  return {
    error:
      'cloudru-hub: could not locate the cloudru-vm engine binary. It is resolved at runtime, never bundled (ADR-002).\n' +
      'Tried, in order:\n' +
      `  1. $CLOUDRU_VM_BIN                          ${env.CLOUDRU_VM_BIN ? `(set, but not a file: ${env.CLOUDRU_VM_BIN})` : '(unset)'}\n` +
      `  2. enginePath in ${configPath(env)}          ${cfg.enginePath ? `(set, but not a file: ${cfg.enginePath})` : '(unset/absent)'}\n` +
      `  3. optional dependency ${(PKG.cloudruHub && PKG.cloudruHub.platformPackages && PKG.cloudruHub.platformPackages[key]) || '<none for ' + key + '>'} (not installed)\n` +
      'Local testing: point $CLOUDRU_VM_BIN at an engine build (see docs/LOCAL-TESTING.md).\n' +
      'The hosted platform package does not exist yet: its first publication still requires the ADR-002 trusted-CI binary build (see LICENSE Part 2 and THIRD_PARTY_NOTICES).',
  };
}

module.exports = { resolveEngine, platformKey, sha256File, configPath };
