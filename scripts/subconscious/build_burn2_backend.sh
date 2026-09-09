#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
context="$(mktemp -d)"
trap 'rm -rf "$context"' EXIT
cp -R backend/onyx/server/query_and_chat/burn2 "$context/burn2"
find "$context" -type d -name __pycache__ -prune -exec rm -r '{}' +
cp backend/onyx/db/burn2_brief.py "$context/"
cp scripts/subconscious/patch_burn2_backend.py "$context/"
cp docs/subconscious/Dockerfile.burn2 "$context/Dockerfile"
docker build -t "${1:-onyx-burn2:preview}" "$context"
