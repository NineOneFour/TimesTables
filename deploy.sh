#!/usr/bin/env bash
# Deploy a locally-built app to a server over ssh.
#
# Usage:  ./deploy.sh [ssh-host] [http-base-url]
#   ssh-host       ssh target or alias           (default: $DEPLOY_HOST or "timestables")
#   http-base-url  used only for the smoke test  (default: $DEPLOY_URL or http://<ssh-host>)
#
# The build happens HERE, not on the box: `.next` is portable JS, and the box
# is small. Nothing is compiled remotely — better-sqlite3 ships a prebuilt
# linux-x64 N-API binary, which is why npm ci runs with --ignore-scripts (npm
# would otherwise auto-run node-gyp because the package has a binding.gyp).
#
# The excludes MUST stay anchored with a leading slash. An unanchored
# 'node_modules/' also matches .next/node_modules/, which holds the symlink
# Turbopack needs to resolve serverExternalPackages:
#   .next/node_modules/better-sqlite3-<hash> -> ../../node_modules/better-sqlite3
# Without it the app starts, listens, and 500s on every route touching the DB.
set -euo pipefail

HOST="${1:-${DEPLOY_HOST:-timestables}}"
BASE_URL="${2:-${DEPLOY_URL:-http://$HOST}}"
REMOTE="${DEPLOY_PATH:-/opt/timestables}"

echo "==> building locally"
npm run build

echo "==> syncing to $HOST:$REMOTE"
# data/ is excluded so the box keeps its own database.
rsync -az --delete \
  --exclude '/node_modules/' \
  --exclude '/data/' \
  --exclude '/.next/dev/' \
  --exclude '/.next/cache/' \
  --exclude '*.tsbuildinfo' \
  --exclude '/deploy.sh' \
  -e 'ssh -o ServerAliveInterval=15 -o ConnectTimeout=25' \
  ./ "$HOST:$REMOTE/"

echo "==> installing production deps"
ssh "$HOST" "cd $REMOTE && npm ci --omit=dev --ignore-scripts"

echo "==> verifying turbopack external symlink"
ssh "$HOST" "test -e $REMOTE/.next/node_modules/better-sqlite3-*/package.json" \
  || { echo "FAIL: .next/node_modules symlink missing or broken"; exit 1; }

echo "==> restarting service"
ssh "$HOST" 'systemctl restart timestables.service'
sleep 5
ssh "$HOST" 'systemctl is-active timestables.service'

echo "==> smoke test"
for p in / /table /settings /trends /api/settings; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$p")
  printf '  %-16s %s\n' "$p" "$code"
  [ "$code" = "200" ] || { echo "FAIL: $p returned $code"; exit 1; }
done
echo "==> deployed: $BASE_URL"
