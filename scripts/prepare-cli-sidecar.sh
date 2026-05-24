#!/usr/bin/env bash
set -euo pipefail

# Build the Galley CLI and copy it to the target-triple-suffixed filename
# Tauri expects for bundle.externalBin.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROFILE="release"
TARGET=""

usage() {
  cat <<'USAGE'
Usage: scripts/prepare-cli-sidecar.sh [--profile debug|release] [--target <triple>]

Examples:
  scripts/prepare-cli-sidecar.sh
  scripts/prepare-cli-sidecar.sh --profile debug
  scripts/prepare-cli-sidecar.sh --target aarch64-apple-darwin
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$TARGET" ]]; then
        TARGET="$1"
        shift
      else
        echo "[prepare-cli-sidecar] unexpected argument: $1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
done

if [[ "$PROFILE" != "debug" && "$PROFILE" != "release" ]]; then
  echo "[prepare-cli-sidecar] --profile must be debug or release" >&2
  exit 2
fi

if [[ -z "$TARGET" && -n "${TAURI_ENV_TARGET_TRIPLE:-}" ]]; then
  TARGET="$TAURI_ENV_TARGET_TRIPLE"
fi

if [[ -z "$TARGET" ]]; then
  TARGET="$(rustc -vV | awk '/^host:/ {print $2}')"
fi

if [[ -z "$TARGET" ]]; then
  echo "[prepare-cli-sidecar] could not resolve Rust target triple" >&2
  exit 1
fi

BIN_EXT=""
if [[ "$TARGET" == *windows* ]]; then
  BIN_EXT=".exe"
fi

CARGO_ARGS=(
  build
  --manifest-path "${REPO_ROOT}/core/Cargo.toml"
  -p galley-cli
  --target "$TARGET"
)

if [[ "$PROFILE" == "release" ]]; then
  CARGO_ARGS+=(--release)
fi

DEST_DIR="${REPO_ROOT}/core/target/tauri-sidecars"
DEST="${DEST_DIR}/galley-${TARGET}${BIN_EXT}"
PLACEHOLDER_CREATED=0

cleanup_placeholder() {
  local status=$?
  if [[ "$status" -ne 0 && "$PLACEHOLDER_CREATED" -eq 1 ]]; then
    rm -f "$DEST"
  fi
  exit "$status"
}
trap cleanup_placeholder EXIT

# Building galley-cli also builds galley-core, whose Tauri build script
# validates bundle.externalBin before the CLI output exists. A temporary
# placeholder breaks that bootstrap cycle; the real CLI overwrites it below.
if [[ ! -f "$DEST" ]]; then
  mkdir -p "$DEST_DIR"
  printf '#!/usr/bin/env sh\nexit 1\n' > "$DEST"
  chmod 755 "$DEST" 2>/dev/null || true
  PLACEHOLDER_CREATED=1
fi

echo "[prepare-cli-sidecar] building galley-cli profile=${PROFILE} target=${TARGET}"
cargo "${CARGO_ARGS[@]}"

SOURCE="${REPO_ROOT}/core/target/${TARGET}/${PROFILE}/galley${BIN_EXT}"

if [[ ! -f "$SOURCE" ]]; then
  echo "[prepare-cli-sidecar] missing built CLI: ${SOURCE}" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SOURCE" "$DEST"
chmod 755 "$DEST" 2>/dev/null || true
PLACEHOLDER_CREATED=0
trap - EXIT

echo "[prepare-cli-sidecar] sidecar ready: ${DEST}"
