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
# data/ is excluded so the box keeps its own database, and .env so it keeps its
# own SESSION_SECRET — without that exclude, --delete removes the server's
# secret and every existing sign-in cookie stops verifying.
rsync -az --delete \
  --exclude '/node_modules/' \
  --exclude '/data/' \
  --exclude '/.env' \
  --exclude '/.env.local' \
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

# Every page is behind sign-in now, so a 200 on one would be the failure. Each
# entry is a path and the codes that are correct for it: /signin answers 200 once
# the instance is set up and 307 to /setup before that, and /api/settings must
# refuse an unauthenticated caller rather than serve anything.
echo "==> smoke test"
smoke() {
  path="$1"; shift
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$path")
  for want in "$@"; do
    if [ "$code" = "$want" ]; then
      printf '  %-16s %s\n' "$path" "$code"
      return 0
    fi
  done
  echo "FAIL: $path returned $code, expected one of: $*"
  exit 1
}
smoke /              307
smoke /table         307
smoke /trends        307
smoke /settings      307
smoke /kids          307
smoke /api/settings  401
smoke /signin        200 307
echo "==> deployed: $BASE_URL"
