#!/usr/bin/env bash

set -euo pipefail

# Auto git add/commit/push script

COMMIT_MESSAGE="${1:-}"
TARGET_BRANCH="${2:-}"

if [ -z "$COMMIT_MESSAGE" ]; then
  read -r -p "Enter commit message: " COMMIT_MESSAGE
fi

if [ -z "$COMMIT_MESSAGE" ]; then
  echo "[ERROR] Commit message cannot be empty."
  echo "Usage: ./push.sh \"your commit message\" [branch]"
  echo "Example: ./push.sh \"fix auth bug\" main"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[ERROR] This script must be run inside a git repository."
  exit 1
fi

if [ -z "$TARGET_BRANCH" ]; then
  TARGET_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "[INFO] No changes detected. Nothing to commit."
  exit 0
fi

git add -A

if git diff --cached --quiet; then
  echo "[INFO] No staged changes after add. Nothing to commit."
  exit 0
fi

git commit -m "$COMMIT_MESSAGE"
git push origin "$TARGET_BRANCH"

echo "[OK] Code pushed successfully to '$TARGET_BRANCH'."
