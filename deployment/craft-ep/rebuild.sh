#!/usr/bin/env bash
# Rebuild the Craft stack and the Expected Parrot sandbox image from this checkout, then apply the admin settings.
# Usage (on the Craft host, from any directory): deployment/craft-ep/rebuild.sh
# Needs: Docker with buildx, deployment/docker_compose/.env (see README), and ~/craft-ep/admin.env with
# CRAFT_ADMIN_EMAIL and CRAFT_ADMIN_PASSWORD. Keeps the database and file store volumes.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
COMPOSE="$REPO/deployment/docker_compose"
TAG=fork-$(git -C "$REPO" rev-parse --short=9 HEAD)
AGENT_MODEL=${CRAFT_AGENT_MODEL:-minimax.minimax-m2.5}
B=http://localhost:${HOST_PORT:-3390}/api
SANDBOX=craft-ep/sandbox:$TAG-edsl1.0.9
echo "tag $TAG"

docker build -q -t "craft-ep/onyx-backend:$TAG" -f "$REPO/backend/Dockerfile" "$REPO/backend"
docker build -q -t "craft-ep/onyx-web-server:$TAG" -f "$REPO/web/Dockerfile" "$REPO/web"
docker build -q -t "craft-ep/sandbox-base:$TAG" "$REPO/backend/onyx/server/features/build/sandbox/image"
docker build -q --build-arg "BASE=craft-ep/sandbox-base:$TAG" -t "$SANDBOX" "$HERE/sandbox"
docker run --rm --entrypoint /workspace/.venv/bin/python "$SANDBOX" -c "import edsl; print('edsl', edsl.__version__)"

# One-time host setup the Compose file expects.
docker network inspect onyx_craft_sandbox >/dev/null 2>&1 || docker network create onyx_craft_sandbox
docker volume inspect sandbox_proxy_ca >/dev/null 2>&1 || docker volume create sandbox_proxy_ca
MINIO=minio/minio:RELEASE.2025-07-23T15-54-02Z-cpuv1
docker image inspect "$MINIO" >/dev/null 2>&1 || { docker pull onyxdotapp/minio:RELEASE.2025-07-23T15-54-02Z-cpuv1 && docker tag onyxdotapp/minio:RELEASE.2025-07-23T15-54-02Z-cpuv1 "$MINIO"; }

set_env() { if grep -q "^$1=" "$COMPOSE/.env"; then sed -i "s|^$1=.*|$1=$2|" "$COMPOSE/.env"; else echo "$1=$2" >> "$COMPOSE/.env"; fi; }
set_env ONYX_BACKEND_IMAGE "craft-ep/onyx-backend:$TAG"
set_env ONYX_WEB_SERVER_IMAGE "craft-ep/onyx-web-server:$TAG"
set_env SANDBOX_CONTAINER_IMAGE "$SANDBOX"
# MiniMax M2.5 can go quiet for minutes while it writes a long tool call; the 60 s default cuts it off.
set_env LLM_SOCKET_READ_TIMEOUT 600
set_env OPENCODE_PROMPT_INACTIVITY_TIMEOUT_SECONDS 1800
# docker-compose.craft.yml adds the sandbox egress proxy and the api_server settings that point at it.
(cd "$COMPOSE" && docker compose -f docker-compose.yml -f docker-compose.craft.yml up -d)
# nginx resolves api_server once at start; a re-created api_server leaves it returning 502.
docker restart "$(cd "$COMPOSE" && docker compose ps -q nginx)" >/dev/null

# Sandboxes on an older image are re-created by Craft on the user's next session. This removes every
# sandbox-* container on the host not on the new image, live sessions included: run it on a quiet stack.
for c in $(docker ps -a --format '{{.Names}} {{.Image}}' | awk -v img="$SANDBOX" '$1 ~ /^sandbox-/ && $2 != img {print $1}'); do
  docker rm -f "$c" >/dev/null && echo "removed old sandbox $c"
done

for _ in $(seq 1 60); do curl -sf "$B/health" >/dev/null && break; sleep 5; done
curl -sf "$B/health" >/dev/null || { echo "API not healthy after 5 minutes"; exit 1; }
set -a
# shellcheck source=/dev/null
. ~/craft-ep/admin.env
set +a
JAR=$(mktemp)
curl -sf -c "$JAR" -o /dev/null --data-urlencode "username=$CRAFT_ADMIN_EMAIL" --data-urlencode "password=$CRAFT_ADMIN_PASSWORD" "$B/auth/login"
PROVIDER=$(curl -sf -b "$JAR" "$B/admin/llm/provider" | python3 -c "import sys,json; d=json.load(sys.stdin); d=d.get('providers',d) if isinstance(d,dict) else d; print(next((p['id'] for p in d if p['provider']=='bedrock'),''))")
[ -n "$PROVIDER" ] || { echo "no Bedrock provider: run test/copy_bedrock.py once (README)"; exit 1; }
curl -sf -o /dev/null -b "$JAR" -H "Content-Type: application/json" -d "{\"provider_id\":$PROVIDER,\"model_name\":\"$AGENT_MODEL\"}" "$B/admin/llm/default-craft"
python3 -c "import json,sys; print(json.dumps({'craft_instructions': open(sys.argv[1]).read()}))" "$HERE/craft-instructions.md" \
  | curl -sf -b "$JAR" -X PATCH -H "Content-Type: application/json" -d @- -o /dev/null "$B/admin/settings"
rm -f "$JAR"
echo "DONE $TAG agent=$AGENT_MODEL sandbox=$SANDBOX"
