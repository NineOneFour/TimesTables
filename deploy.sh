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

# Every ssh call gets a connect timeout. Without one, a host that accepts no
# connections — an sshd hiccup, or a rate limiter tripped by this script's own
# five connections — leaves a bare `ssh` hanging indefinitely, which reads as the
# deploy being stuck on whichever step it had just announced.
SSH_OPTS=(-o ConnectTimeout=25 -o ServerAliveInterval=15)

# Checked before anything is built or copied: the app refuses to serve without
# SESSION_SECRET, so deploying to a box that has none takes the site down until
# someone notices. .env is excluded from the rsync, so this reads the box's own.
echo "==> checking server config"
ssh "${SSH_OPTS[@]}" "$HOST" "
  grep -qE '^SESSION_SECRET=.{16,}' $REMOTE/.env 2>/dev/null ||
  systemctl show timestables.service -p Environment 2>/dev/null | grep -q SESSION_SECRET
" || {
  echo "FAIL: SESSION_SECRET is not set on $HOST, and the app will not serve"
  echo "      without it. On the box, write $REMOTE/.env containing:"
  echo "        SESSION_SECRET=<openssl rand -base64 32>"
  echo "        INSECURE_COOKIES=1     # only if served over plain http"
  echo "      chmod it 600, restart timestables.service, then deploy again."
  exit 1
}
echo "  SESSION_SECRET present"

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
ssh "${SSH_OPTS[@]}" "$HOST" "cd $REMOTE && npm ci --omit=dev --ignore-scripts"

echo "==> verifying turbopack external symlink"
# ssh exits 255 when it could not connect at all, which must not be reported as
# a broken symlink: it sends you looking at the build when the real problem is
# reachability, and it means the check never ran. Worth distinguishing because at
# this point the sync has already happened, so the box holds new files that the
# running service has not picked up.
# rc is captured with || rather than read from $? after `if !`, where $? holds the
# negated status (0) and never the real exit code.
rc=0
ssh "${SSH_OPTS[@]}" "$HOST" "test -e $REMOTE/.next/node_modules/better-sqlite3-*/package.json" || rc=$?
if [ "$rc" -ne 0 ]; then
  if [ "$rc" -eq 255 ]; then
    echo "FAIL: could not reach $HOST over ssh, so the symlink was NOT checked."
    echo "      The sync already completed: $HOST has the new files but has not"
    echo "      been restarted, and is still serving the previous build."
    echo "      Re-run this script once ssh is reachable."
  else
    echo "FAIL: .next/node_modules symlink missing or broken"
  fi
  exit 1
fi

echo "==> restarting service"
ssh "${SSH_OPTS[@]}" "$HOST" 'systemctl restart timestables.service'
sleep 5
ssh "${SSH_OPTS[@]}" "$HOST" 'systemctl is-active timestables.service'

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
