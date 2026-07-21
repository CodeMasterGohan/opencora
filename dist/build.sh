#!/usr/bin/env bash
# =============================================================================
# build.sh — opencora distribuable build script (Linux / macOS)
# =============================================================================
# Usage:
#   ./dist/build.sh [OPTIONS]
#
# Options:
#   --single           Build only for the current platform/arch (fast local dev)
#   --baseline         Include AVX2-baseline binary when combined with --single
#   --skip-install     Skip cross-platform bun install step
#   --skip-embed-web-ui  Skip building and embedding the Web UI
#   --sourcemaps       Emit linked source maps alongside binaries
#   --test             Run package-level unit tests after the build
#   --help             Show this help message
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo root (script lives in dist/, so go one level up)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"; pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.."; pwd)"
OPENCODE_PKG="$REPO_ROOT/packages/opencode"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[build.sh] $*"; }
err()  { echo "[build.sh] ERROR: $*" >&2; exit 1; }

usage() {
  sed -n '/^# Usage/,/^# ===/p' "${BASH_SOURCE[0]}" | head -n -1 | sed 's/^# //'
  exit 0
}

# ---------------------------------------------------------------------------
# Parse flags — collect any build.ts-compatible flags to pass through
# ---------------------------------------------------------------------------
RUN_TESTS=false
BUILD_FLAGS=()

for arg in "$@"; do
  case "$arg" in
    --help)             usage ;;
    --test)             RUN_TESTS=true ;;
    --single|--baseline|--skip-install|--skip-embed-web-ui|--sourcemaps)
                        BUILD_FLAGS+=("$arg") ;;
    *) err "Unknown argument: $arg" ;;
  esac
done

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
log "Checking prerequisites…"

if ! command -v bun &>/dev/null; then
  err "'bun' not found. Install it from https://bun.sh and ensure it is on PATH."
fi

BUN_VERSION=$(bun --version 2>/dev/null || true)
log "bun version: $BUN_VERSION"

REQUIRED_BUN="1.3.14"
# Simple semver prefix check: major.minor must match or exceed
if [[ "$(printf '%s\n%s' "$REQUIRED_BUN" "$BUN_VERSION" | sort -V | head -1)" != "$REQUIRED_BUN" ]]; then
  err "bun >= $REQUIRED_BUN required (found $BUN_VERSION). Run: bun upgrade"
fi

# ---------------------------------------------------------------------------
# Install workspace dependencies
# ---------------------------------------------------------------------------
log "Installing workspace dependencies from repo root…"
cd "$REPO_ROOT"
bun install

# ---------------------------------------------------------------------------
# Run the TypeScript build orchestrator
# ---------------------------------------------------------------------------
log "Starting build via packages/opencode/script/build.ts…"
cd "$OPENCODE_PKG"
bun run script/build.ts "${BUILD_FLAGS[@]+${BUILD_FLAGS[@]}}"

# ---------------------------------------------------------------------------
# Post-build verification
# ---------------------------------------------------------------------------
DIST_DIR="$OPENCODE_PKG/dist"
if [[ ! -d "$DIST_DIR" ]]; then
  err "dist/ directory was not created — build may have failed."
fi

log "Build artifacts:"
find "$DIST_DIR" -name 'opencode*' -type f | sort | while read -r f; do
  SIZE=$(du -sh "$f" 2>/dev/null | cut -f1)
  log "  $SIZE  $f"
done

# ---------------------------------------------------------------------------
# Optional: run tests
# ---------------------------------------------------------------------------
if $RUN_TESTS; then
  log "Running unit tests…"
  cd "$OPENCODE_PKG"
  bun test --timeout 30000 --only-failures
  log "Tests complete."
fi

log "Done. Distributables are in $DIST_DIR"
