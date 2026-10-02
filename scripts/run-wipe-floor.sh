#!/bin/sh
# Plesk/nodenv: plain `node` is not on PATH — use Node 22 from nodenv.
export CONFIRM_FLOOR_WIPE=YES
cd "$(dirname "$0")/.." || exit 1

if command -v nodenv >/dev/null 2>&1; then
  exec nodenv exec 22 node scripts/wipe-floor-live.mjs
fi

if [ -x /opt/plesk/node/22/bin/node ]; then
  exec /opt/plesk/node/22/bin/node scripts/wipe-floor-live.mjs
fi

exec node scripts/wipe-floor-live.mjs
