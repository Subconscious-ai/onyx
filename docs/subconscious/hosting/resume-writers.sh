#!/usr/bin/env bash
set -euo pipefail
for container in burn2-api_server-1 burn2-background-1; do
  paused=$(docker inspect -f '{{.State.Paused}}' "$container")
  if [ "$paused" = true ]; then docker unpause "$container" >/dev/null; fi
done
