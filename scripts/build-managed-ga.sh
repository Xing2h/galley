#!/usr/bin/env bash
set -euo pipefail

# Build the source-tree managed GA code payload from a local GenericAgent
# checkout. This script copies code only; user state and secrets are excluded.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-$HOME/Documents/GenericAgent}"
DEST="$ROOT/managed-ga/code"
EXPECTED_COMMIT="$(python3 - "$ROOT/managed-ga/manifest.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    print(json.load(f)["upstream"]["commit"])
PY
)"

if [[ ! -d "$SOURCE/.git" ]]; then
  echo "Source is not a git checkout: $SOURCE" >&2
  exit 2
fi

ACTUAL_COMMIT="$(git -C "$SOURCE" rev-parse HEAD)"
if [[ "$ACTUAL_COMMIT" != "$EXPECTED_COMMIT" ]]; then
  echo "GenericAgent baseline mismatch:" >&2
  echo "  expected: $EXPECTED_COMMIT" >&2
  echo "  actual:   $ACTUAL_COMMIT" >&2
  echo "Update managed-ga/manifest.json only after a baseline audit." >&2
  exit 2
fi

if [[ -n "$(git -C "$SOURCE" status --porcelain)" ]]; then
  echo "GenericAgent source checkout must be clean before building managed GA." >&2
  echo "Use a clean temporary clone at the audited upstream commit." >&2
  git -C "$SOURCE" status --short >&2
  exit 2
fi

mkdir -p "$DEST"
find "$DEST" -mindepth 1 -maxdepth 1 \
  ! -name '.gitignore' \
  ! -name 'README.md' \
  -exec rm -rf {} +

rsync -a \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '.venv' \
  --exclude 'venv' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude 'mykey.py' \
  --exclude 'mykey.json' \
  --exclude 'memory' \
  --exclude 'sop' \
  --exclude 'skills' \
  --exclude 'temp' \
  --exclude 'model_responses' \
  "$SOURCE"/ "$DEST"/

shopt -s nullglob
for patch in "$ROOT"/managed-ga/patches/*.patch; do
  (cd "$ROOT" && git apply --whitespace=nowarn --directory=managed-ga/code "$patch")
  echo "Applied managed GA patch: $(basename "$patch")"
done

# Upstream sometimes ships incidental trailing spaces. Keep the generated
# checked-in payload compatible with Galley's `git diff --check` gate without
# baking whitespace-only removals into patch files that would fail that same gate.
perl -0pi -e 's/[ \t]+$//mg' "$DEST/agentmain.py" "$DEST/llmcore.py"

echo "Managed GA code copied to $DEST"
