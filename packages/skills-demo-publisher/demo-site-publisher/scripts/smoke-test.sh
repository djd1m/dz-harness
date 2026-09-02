#!/usr/bin/env bash
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
node "$ROOT/demo-site-publisher/scripts/preflight.mjs"
status=$?
if [ "$status" -ne 0 ]; then
  if [ "$status" -eq 4 ]; then exit 9; fi
  exit "$status"
fi
node "$ROOT/demo-site-publisher/scripts/smoke-test.mjs" "$@"
