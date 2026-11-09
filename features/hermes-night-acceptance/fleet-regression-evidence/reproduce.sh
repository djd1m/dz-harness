#!/usr/bin/env bash
set -euo pipefail
# Requires unpacked coverage 7.6.12 wheel in /tmp/hermes-fleet-coverage-lib.
# Wheel sha256 bda1c5f347550c359f841d6614fb8ca42ae5cb0b74d39f8a1e204815ebe25750.
# Uses pure Python tracer; CPython-3.12 native extension is not loaded in Python 3.14.
IMAGE=sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961
SOURCE=/home/dz-user/dz-harness-health-plugin/integrations/hermes-health
CORE=/home/dz-user/dz-harness-health-recognized/packages/@dzhechkov/health-advisor
run_cov() {
  sudo -n docker run --rm --init --network none --user 1000:1001 \
    --tmpfs /test:rw,exec,mode=0700,uid=1000,gid=1001 \
    -e HOME=/test -e TMPDIR=/test -e PYTHONPATH=/covlib:/opt/hermes \
    -e COVERAGE_CORE=pytrace -e COVERAGE_FILE=/results/.coverage -e HERMES_HOME=/test/hermes \
    -v /tmp/hermes-fleet-coverage-lib:/covlib:ro \
    -v /tmp/hermes-fleet-coverage-results:/results \
    -v "$SOURCE":/plugin:ro \
    -v "$CORE":/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor:ro \
    --entrypoint python3 "$IMAGE" -m coverage "$@"
}
run_cov run --branch --source=/plugin -m unittest discover -s /plugin/tests -p 'test_*.py'
run_cov json -o /results/unit-coverage.json
run_cov run --append --branch --source=/plugin /plugin/tests/integration_recognized_confirm.py
run_cov json -o /results/combined-coverage.json
