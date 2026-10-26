#!/bin/sh
set -eu

# Run inside the container; polling also works with bind mounts and atomic saves.
cd "${DEV_WATCH_ROOT:-/app}"
interval=${DEV_WATCH_INTERVAL:-5}
target=${DEV_WATCH_PID:-1}

fingerprint() {
  find packages/sql/migrations packages/sql/src/prisma packages/sql/prisma.config.ts \
    -type d -name refs -prune -o -type f -exec sha256sum {} \; |
    LC_ALL=C sort | sha256sum
}

baseline=$(fingerprint)
previous=$baseline
while sleep "$interval"; do
  current=$(fingerprint)
  # Wait for two identical observations so multi-file writes can settle.
  if [ "$current" != "$baseline" ] && [ "$current" = "$previous" ]; then
    echo 'Migration/schema files changed; restarting development container to apply migrations.'
    kill -TERM "$target"
    exit 0
  fi
  previous=$current
done
