#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="${LIBRETV_NAS_ROOT:-/vol1/docker/libretv-nas}"
REPO="$ROOT/project"
cd "$ROOT"
exec 9>update.lock
flock -n 9 || exit 0

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
COMPOSE=("${DOCKER[@]}" compose -p libretv-nas -f "$ROOT/compose.yml")
export GIT_TERMINAL_PROMPT=0

if [[ ! -d "$REPO/.git" ]]; then
  git clone --depth 1 https://github.com/gituxx/libretv.git "$REPO"
fi
if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]]; then
  echo 'Local source changes detected; keeping the running deployment.' >&2
  exit 1
fi
git -C "$REPO" pull --ff-only origin main
commit="$(git -C "$REPO" rev-parse HEAD)"
candidate="libretv-nas:${commit:0:12}"
check_name="libretv-nas-check-${commit:0:12}"

install -m 0644 "$REPO/deploy/nas/compose.yml" "$ROOT/compose.yml.tmp"
mv -f "$ROOT/compose.yml.tmp" "$ROOT/compose.yml"
if [[ ! -f "$ROOT/.env" ]]; then install -m 0600 "$REPO/deploy/nas/.env.example" "$ROOT/.env"; fi
[[ -s "$ROOT/.secrets/tunnel-token" ]] || { echo 'Tunnel token file is missing.' >&2; exit 1; }

if ! "${DOCKER[@]}" image inspect "$candidate" >/dev/null 2>&1; then
  "${DOCKER[@]}" build --build-arg NEXT_BUILD_CPUS=1 \
    --label "org.opencontainers.image.source=https://github.com/gituxx/libretv" \
    --label "org.opencontainers.image.revision=$commit" \
    -t "$candidate" "$REPO"
fi

cleanup() { "${DOCKER[@]}" rm -f "$check_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
"${DOCKER[@]}" run -d --name "$check_name" --network none \
  --memory 768m --cpus 1 --env-file "$ROOT/.env" \
  -e NODE_OPTIONS=--max-old-space-size=512 "$candidate" >/dev/null
"${DOCKER[@]}" exec -i "$check_name" node --input-type=module - http://127.0.0.1:8080 \
  < "$REPO/scripts/check-public-access.mjs"
cleanup

previous_app="$("${DOCKER[@]}" image inspect libretv-nas:current --format '{{.Id}}' 2>/dev/null || true)"
previous_tunnel="$("${DOCKER[@]}" image inspect libretv-nas-tunnel:current --format '{{.Id}}' 2>/dev/null || true)"
if "${DOCKER[@]}" pull cloudflare/cloudflared:latest; then
  "${DOCKER[@]}" tag cloudflare/cloudflared:latest libretv-nas-tunnel:current
elif [[ -z "$previous_tunnel" ]]; then
  echo 'Cannot download cloudflared; keeping the running deployment.' >&2
  exit 1
else
  echo 'cloudflared update unavailable; reusing the installed tunnel image.' >&2
fi
"${DOCKER[@]}" tag "$candidate" libretv-nas:current

rollback() {
  echo 'Deployment check failed; restoring previous images when available.' >&2
  [[ -z "$previous_app" ]] || "${DOCKER[@]}" tag "$previous_app" libretv-nas:current
  [[ -z "$previous_tunnel" ]] || "${DOCKER[@]}" tag "$previous_tunnel" libretv-nas-tunnel:current
  "${COMPOSE[@]}" up -d --no-build || true
  exit 1
}

"${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 120 || rollback
"${DOCKER[@]}" exec -i libretv-nas node --input-type=module - http://127.0.0.1:8080 \
  < "$REPO/scripts/check-public-access.mjs" || rollback

tunnel_ready=false
for attempt in $(seq 1 30); do
  if "${DOCKER[@]}" exec libretv-nas node -e "fetch('http://cloudflared:2000/ready',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    tunnel_ready=true
    break
  fi
  sleep 2
done
[[ "$tunnel_ready" == true ]] || rollback

python3 - "$ROOT" "$commit" "$candidate" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path
root = Path(sys.argv[1])
state = {'commit': sys.argv[2], 'image': sys.argv[3], 'status': 'healthy',
         'updated_at': datetime.now(timezone.utc).isoformat()}
temporary = root / 'deployment.json.tmp'
temporary.write_text(json.dumps(state, indent=2), encoding='utf-8')
temporary.replace(root / 'deployment.json')
print(json.dumps(state))
PY
install -m 0700 "$REPO/deploy/nas/update.sh" "$ROOT/update.sh.tmp"
mv -f "$ROOT/update.sh.tmp" "$ROOT/update.sh"
