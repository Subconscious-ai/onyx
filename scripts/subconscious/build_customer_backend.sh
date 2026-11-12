#!/usr/bin/env bash
# Reconcile a deployed fork overlay with a clean, committed customer backend.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: $0 BASE_IMAGE BASE_SOURCE_REVISION IMAGE_TAG [EXPORT_CONTEXT_DIR]" >&2
  exit 2
fi
base_image="$1"
base_source="$(git rev-parse --verify "$2^{commit}")"
image_tag="$3"
source_revision="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain -- backend/onyx scripts/subconscious/build_customer_backend.sh docs/subconscious/Dockerfile.customer-backend)" ]]; then
  echo "Commit the backend and build recipe before preparing a release." >&2
  exit 1
fi
context="${4:-$(mktemp -d)}"
if [[ $# -eq 3 ]]; then
  trap 'rm -rf "$context"' EXIT
fi
mkdir -p "$context"
if [[ -n "$(ls -A "$context")" ]]; then
  echo "The release context directory must be empty." >&2
  exit 1
fi
# Copy only committed fork changes. Retain the deployed upstream and auth layers.
git diff --name-only --diff-filter=ACM -z "$base_source" HEAD -- backend/onyx > "$context/files.nul"
if [[ ! -s "$context/files.nul" ]]; then
  echo "No customer backend changes found." >&2
  exit 1
fi
mapfile -d '' files < "$context/files.nul"
git archive HEAD "${files[@]}" > "$context/source.tar"
tar -xf "$context/source.tar" -C "$context"
rm "$context/source.tar"
cp docs/subconscious/Dockerfile.customer-backend "$context/Dockerfile"
printf '%s\n' "$source_revision" > "$context/SOURCE_REVISION"
printf '%s\n' "$base_source" > "$context/BASE_SOURCE_REVISION"
printf '%s\n' "$base_image" > "$context/BASE_IMAGE"
tr '\0' '\n' < "$context/files.nul" > "$context/SOURCE_FILES"
rm "$context/files.nul"
if [[ $# -eq 4 ]]; then
  echo "Release context: $context ($source_revision)"
  exit 0
fi
docker build --build-arg "BASE_IMAGE=$base_image" \
  --build-arg "SOURCE_REVISION=$source_revision" -t "$image_tag" "$context"
