'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

const ZONES = Object.freeze({
  'ru.AZ-1': '7c99a597-8516-494f-a2c7-d7377048681e',
  'ru.AZ-2': '479a4ab3-3ff3-4972-95c5-7610bac5c0bb',
  'ru.AZ-3': '2c63c482-2532-4bba-8c9b-70ea330507bf',
});

function credentialsPath(env = process.env) {
  return env.CLOUDRU_HUB_CREDENTIALS || path.join(os.homedir(), '.config', 'cloudru-hub', 'credentials.json');
}

function readCredentials(env = process.env) {
  const file = credentialsPath(env);
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('credentials must be a regular file');
  if ((st.mode & 0o077) !== 0) throw new Error('credentials permissions must be 0600');
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) throw new Error('credentials owner differs from MCP process');
  if (st.size > 65536) throw new Error('credentials file is too large');
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('credentials file is not valid JSON'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('credentials JSON must be an object');
  for (const key of ['key_id', 'secret', 'project_id']) {
    if (typeof parsed[key] !== 'string' || !parsed[key].trim()) throw new Error(`credentials ${key} is required`);
    if (/[\r\n\0]/.test(parsed[key])) throw new Error(`credentials ${key} contains a control character`);
  }
  if (parsed.agreement_id !== undefined &&
      (typeof parsed.agreement_id !== 'string' || !parsed.agreement_id.trim() || /[\r\n\0]/.test(parsed.agreement_id))) {
    throw new Error('credentials agreement_id must be a non-empty string without control characters');
  }
  if (!UUID.test(parsed.project_id)) throw new Error('credentials project_id must be a UUID');
  const region = parsed.region || 'ru.AZ-2';
  const zone = ZONES[region] || region;
  if (!UUID.test(zone)) throw new Error('credentials region must be a known zone or UUID');
  return {
    path: file,
    projectId: parsed.project_id,
    env: {
      CLOUDRU_KEY_ID: parsed.key_id,
      CLOUDRU_SECRET: parsed.secret,
      CLOUDRU_PROJECT_ID: parsed.project_id,
      CLOUDRU_REGION: zone,
      ...(parsed.agreement_id === undefined ? {} : { CLOUDRU_AGREEMENT_ID: parsed.agreement_id.trim() }),
    },
  };
}

function readOptionalCredentials(env = process.env) {
  // An explicit path must fail loudly when unreadable. Without one, retain
  // environment-only billing setups that have no default credential file.
  if (!env.CLOUDRU_HUB_CREDENTIALS && !fs.existsSync(credentialsPath(env))) return null;
  return readCredentials(env);
}

module.exports = { credentialsPath, readCredentials, readOptionalCredentials, ZONES, UUID };
