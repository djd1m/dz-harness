#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/srv/hermes-dz-health
CONTAINER=hermes-dz-health
ENV_FILE=/etc/corp-infra/backup/local.env
CENTRAL_BACKUP=/opt/corp-infra/backup/scripts/backup.sh
LOCK=/run/lock/hermes-dz-health-backup.lock

usage() {
  printf 'Usage: %s --check|--run\n' "$0"
}

if [[ $# -ne 1 ]]; then usage; exit 2; fi
case "$1" in --check|--run) MODE="$1" ;; *) usage; exit 2 ;; esac
if [[ $(id -u) -ne 0 ]]; then echo 'Run as root' >&2; exit 1; fi
exec 9>"$LOCK"
flock -n 9 || { echo 'Health backup already running' >&2; exit 1; }

for path in "$ROOT/medical" "$ROOT/archives" "$ROOT/hermes-home" "$ROOT/compose.yaml" "$ROOT/Dockerfile" "$ROOT/.dockerignore" "$ROOT/patch-mattermost-attachment-provenance.py" "$ROOT/install-health-runtime-node22.sh" "$ROOT/package.json" "$ROOT/runtime-package-lock.json" "$ROOT/.env" "$ROOT/source-dzhechkov-health-advisor-1.10.8.tgz" "$ROOT/source-dzhechkov-harness-core-0.5.4.tgz" "$ROOT/verify-health-workspace.py" "$ENV_FILE" "$CENTRAL_BACKUP"; do
  [[ -e "$path" ]] || { echo "Missing required path: $path" >&2; exit 1; }
done
command -v docker >/dev/null
command -v restic >/dev/null

# Read-only doctor: check the encrypted repository without displaying credentials.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
restic snapshots --latest 1 >/dev/null
if [[ "$MODE" == --check ]]; then echo 'health backup prerequisites: OK'; exit 0; fi

was_running=0
restart_container() {
  if [[ "$was_running" -eq 1 ]]; then
    docker start "$CONTAINER" >/dev/null
    was_running=0
  fi
}
trap restart_container EXIT

if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  if [[ $(docker inspect -f '{{.State.Running}}' "$CONTAINER") == true ]]; then
    was_running=1
    docker stop --time 90 "$CONTAINER" >/dev/null
  fi
fi

# The agent is stopped while restic reads the SQLite database, index and map.
python3 "$ROOT/verify-health-workspace.py" "$ROOT/medical"
# A failed capture never reports success; EXIT trap still restores service.
timeout --signal=TERM --kill-after=20s 300s restic backup --tag hermes-dz-health --tag corp-infra \
  "$ROOT/medical" "$ROOT/archives" "$ROOT/hermes-home" \
  "$ROOT/compose.yaml" "$ROOT/Dockerfile" "$ROOT/.dockerignore" "$ROOT/patch-mattermost-attachment-provenance.py" "$ROOT/install-health-runtime-node22.sh" "$ROOT/package.json" \
  "$ROOT/runtime-package-lock.json" "$ROOT/.env" \
  "$ROOT/source-dzhechkov-health-advisor-1.10.8.tgz" \
  "$ROOT/source-dzhechkov-harness-core-0.5.4.tgz" "$ROOT/verify-health-workspace.py" \
  "$ROOT/releases" "$ROOT/backup-health.sh" "$ROOT/backup-restore.md"
restart_container
trap - EXIT

# The central workflow mirrors the encrypted local repository to primary S3.
"$CENTRAL_BACKUP" --yes --service platform --quiet
printf 'health backup and primary offsite sync: OK\n'
