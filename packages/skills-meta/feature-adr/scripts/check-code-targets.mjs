#!/usr/bin/env node
// Read-only current source admission. This is neither a QE receipt nor a cache key.
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { measureManifest } from './check-review-convergence.mjs'

const schema = 'fa-code-targets-1'
let result
try {
  const args = process.argv.slice(2)
  if (args.length !== 4 || args[0] !== '--repo' || !args[1] || args[2] !== '--feature' || !args[3]) throw Error('invalid-arguments: expected --repo <project> --feature <feature>')
  // Match the checker: real execution root, feature resolved from that root, then
  // its own inside-repo/path/Git checks. Do not reinterpret feature from cwd.
  const repo = realpathSync(args[1])
  const feature = resolve(repo, args[3])
  const manifest = measureManifest(repo, feature, 'qe')
  result = { schema, status: 'admitted', manifestDigest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), reasons: [] }
} catch (error) {
  // execFileSync errors include raw subprocess output in message. Keep that out
  // of the wire; ordinary checker diagnostics are bounded and carry no contents.
  const reason = error && (error.stdout !== undefined || error.stderr !== undefined)
    ? 'git-evidence-unavailable: exit=' + String(error.status ?? error.code ?? 'unknown')
    : String(error?.message || 'measurement-unavailable').slice(0, 4096)
  result = { schema, status: 'refused', manifestDigest: null, reasons: [reason] }
}
process.stdout.write(JSON.stringify(result) + '\n')
process.exitCode = result.status === 'admitted' ? 0 : 1
