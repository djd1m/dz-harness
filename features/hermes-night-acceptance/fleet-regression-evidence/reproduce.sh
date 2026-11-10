#!/usr/bin/env bash
set -euo pipefail
umask 077
# Offline prerequisites only: no installation, extraction, pull, or download.
# Pure Python tracer: the CPython-3.12 wheel extension is not loaded in Python 3.14.
HERMES_FLEET_IMAGE=sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961
HERMES_FLEET_SOURCE=${HERMES_FLEET_SOURCE:-/home/dz-user/dz-harness-health-plugin/integrations/hermes-health}
HERMES_FLEET_CORE=${HERMES_FLEET_CORE:-/home/dz-user/dz-harness-health-recognized/packages/@dzhechkov/health-advisor}
HERMES_FLEET_COVLIB=${HERMES_FLEET_COVLIB:-/tmp/hermes-fleet-coverage-lib}
HERMES_FLEET_WHEEL=${HERMES_FLEET_WHEEL:-/tmp/hermes-fleet-coverage-wheel/coverage-7.6.12-cp312-cp312-manylinux_2_5_x86_64.manylinux1_x86_64.manylinux_2_17_x86_64.manylinux2014_x86_64.whl}
HERMES_FLEET_RESULTS_PARENT=${HERMES_FLEET_RESULTS_PARENT:-/tmp}
fail() { printf 'Preflight failed: %s\n' "$1" >&2; exit 1; }
for command in sudo sha256sum mktemp; do
  command -v "$command" >/dev/null || fail "required command unavailable: $command"
done
# Local dependency failures must occur before even a Docker inspect invocation.
for directory in "$HERMES_FLEET_SOURCE" "$HERMES_FLEET_CORE" "$HERMES_FLEET_COVLIB" "$HERMES_FLEET_RESULTS_PARENT"; do
  [[ "$directory" = /* && "$directory" != *:* && "$directory" != *$'\n'* ]] || fail 'paths must be absolute and contain no colon/newline'
  [[ -d "$directory" && -r "$directory" && -x "$directory" ]] || fail 'required local directory unavailable'
done
[[ -w "$HERMES_FLEET_RESULTS_PARENT" ]] || fail 'results parent is not writable'
for file in "$HERMES_FLEET_SOURCE/recognized_confirm.py" "$HERMES_FLEET_SOURCE/tests/test_recognized_confirm.py" "$HERMES_FLEET_SOURCE/tests/integration_recognized_confirm.py" "$HERMES_FLEET_CORE/lib/recognized-cli.js" "$HERMES_FLEET_CORE/lib/recognized-store.js" "$HERMES_FLEET_COVLIB/coverage/__main__.py" "$HERMES_FLEET_WHEEL"; do
  [[ -f "$file" && -r "$file" ]] || fail 'required local file unavailable'
done
HERMES_FLEET_WHEEL_HASH=$(sha256sum -- "$HERMES_FLEET_WHEEL")
[[ "${HERMES_FLEET_WHEEL_HASH%% *}" = bda1c5f347550c359f841d6614fb8ca42ae5cb0b74d39f8a1e204815ebe25750 ]] || fail 'coverage wheel hash mismatch'
sudo -n docker image inspect "$HERMES_FLEET_IMAGE" >/dev/null 2>&1 || fail 'pinned local image or noninteractive Docker access unavailable'
# mktemp creates a new 0700 directory; never chown an existing supplied directory.
HERMES_FLEET_RESULTS=$(mktemp -d "$HERMES_FLEET_RESULTS_PARENT/hermes-fleet-coverage.XXXXXXXX")
sudo -n chown 1000:1001 -- "$HERMES_FLEET_RESULTS"
printf 'Coverage results: %s\n' "$HERMES_FLEET_RESULTS"
run_cov() {
  sudo -n docker run --rm --init --network none --user 1000:1001 \
    --tmpfs /test:rw,exec,mode=0700,uid=1000,gid=1001 \
    -e HOME=/test -e TMPDIR=/test -e PYTHONPATH=/covlib:/opt/hermes \
    -e COVERAGE_CORE=pytrace -e COVERAGE_FILE=/results/.coverage -e HERMES_HOME=/test/hermes \
    -v "$HERMES_FLEET_COVLIB":/covlib:ro \
    -v "$HERMES_FLEET_RESULTS":/results \
    -v "$HERMES_FLEET_SOURCE":/plugin:ro \
    -v "$HERMES_FLEET_CORE":/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor:ro \
    --entrypoint python3 "$HERMES_FLEET_IMAGE" -m coverage "$@"
}
run_cov run --branch --source=/plugin -m unittest discover -s /plugin/tests -p 'test_*.py'
run_cov json -o /results/unit-coverage.json
run_cov run --append --branch --source=/plugin /plugin/tests/integration_recognized_confirm.py
run_cov json -o /results/combined-coverage.json
printf 'Coverage results complete: %s\n' "$HERMES_FLEET_RESULTS"
