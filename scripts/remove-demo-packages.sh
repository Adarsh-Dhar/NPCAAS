#!/usr/bin/env bash
set -euo pipefail

# Safe removal/archival script for demo packages
# - creates an archival git branch
# - moves `demo/` to `archive/demo-removed-<ts>` using git mv
# - generates a grep report of references left in the repo
# - does NOT run destructive global replacements; prints guidance

TS=$(date +%Y%m%d-%H%M%S)
BRANCH="archive/remove-demo-${TS}"
ARCHIVE_DIR="archive/demo-removed-${TS}"
REPORT="scripts/demo-deletion-report-${TS}.txt"

echo "Preparing to archive demo/ -> ${ARCHIVE_DIR} on branch ${BRANCH}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required. Aborting." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash changes before running this script." >&2
  git status --porcelain
  exit 1
fi

read -p "Proceed with creating branch ${BRANCH} and moving demo/ to ${ARCHIVE_DIR}? (y/N) " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted by user."; exit 1
fi

echo "Creating branch ${BRANCH}..."
git checkout -b "${BRANCH}"

mkdir -p "${ARCHIVE_DIR%/*}"
echo "Moving demo/ to ${ARCHIVE_DIR} (git mv)..."
git mv demo "${ARCHIVE_DIR}"

echo "Committing move..."
git commit -m "chore: archive demo/ -> ${ARCHIVE_DIR}"

echo "Generating reference report to ${REPORT}..."
{
  echo "=== Repo references to demo-related packages, files, and keywords (generated ${TS}) ==="
  echo "(This lists files that mention demo/lib, demo/artifacts, or package names like api-client-react/api-zod)"
  echo
  # using ripgrep if available, fallback to grep -R
  if command -v rg >/dev/null 2>&1; then
    rg "demo/|demo/lib|demo/artifacts|api-client-react|api-zod|api-spec|@workspace/db|@workspace/api-client-react|mockup-sandbox|neocity-game|phase5-integration" --hidden --no-ignore -S || true
  else
    grep -R --line-number -E "demo/|demo/lib|demo/artifacts|api-client-react|api-zod|api-spec|@workspace/db|@workspace/api-client-react|mockup-sandbox|neocity-game|phase5-integration" . || true
  fi
} > "${REPORT}"

echo
echo "Report generated: ${REPORT}"
echo "Review the report for any remaining references that need manual changes (imports, pnpm/workspace aliases, tsconfig references)."
echo
echo "Recommended next steps:"
echo "  1) Inspect ${REPORT} and fix code that imports demo packages (replace or remove imports)."
echo "  2) Run 'pnpm -w install' to refresh workspace (optional)."
echo "  3) When satisfied, push branch and open PR for archival: git push -u origin ${BRANCH}"

exit 0
