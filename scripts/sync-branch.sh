#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
export GIT_TERMINAL_PROMPT=0

TARGET_BRANCH="${1:-}"
CURRENT_BRANCH="$(git branch --show-current)"

echo "==> 1. Ensuring local Docker services (Postgres 18 + SeaweedFS S3) are running..."
if command -v docker >/dev/null 2>&1; then
  docker compose -f docker-compose.local.yml up -d
else
  echo "WARNING: docker CLI not found on PATH. Start Docker Desktop if DB/S3 are stopped."
fi

echo "==> 2. Fetching latest branches from origin (GitHub)..."
git fetch origin --prune

BEFORE_HEAD="$(git rev-parse HEAD)"

if [[ -n "$TARGET_BRANCH" ]]; then
  echo "==> 3. Merging origin/${TARGET_BRANCH} into ${CURRENT_BRANCH} (preserves local branch DB)..."
  git merge --no-edit "origin/${TARGET_BRANCH}"
else
  echo "==> 3. Pulling latest origin/${CURRENT_BRANCH}..."
  git pull --ff-only origin "${CURRENT_BRANCH}" || git merge --no-edit "origin/${CURRENT_BRANCH}"
fi

AFTER_HEAD="$(git rev-parse HEAD)"

if [[ "$BEFORE_HEAD" != "$AFTER_HEAD" ]]; then
  CHANGED_FILES="$(git diff --name-only "$BEFORE_HEAD" "$AFTER_HEAD")"

  if echo "$CHANGED_FILES" | grep -qE "(package\.json|pnpm-lock\.yaml)"; then
    echo "==> 4. Dependencies changed — running pnpm install..."
    pnpm install
  else
    echo "==> 4. Dependencies unchanged — skipping pnpm install."
  fi

  if echo "$CHANGED_FILES" | grep -q "packages/db/prisma/"; then
    echo "==> 5. Prisma schema/migrations changed — regenerating client & applying migrations..."
    pnpm --filter @rakazo/db prisma generate
    pnpm --filter @rakazo/db prisma migrate deploy || true
  else
    echo "==> 5. Prisma schema unchanged — skipping migrations."
  fi
else
  echo "==> Already up to date at $(git log -1 --oneline)."
fi

echo ""
echo "Sync complete on branch: $(git branch --show-current) ($(git rev-parse --short HEAD))"
echo "Next step: restart 'pnpm dev' (or let Antigravity restart it) and refresh http://127.0.0.1:5173/"
