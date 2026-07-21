#!/usr/bin/env bash
# =============================================================================
# build.sh — opencora distributable build script (Linux / macOS)
# =============================================================================
# Usage:
#   ./dist/build.sh [OPTIONS]
#
# Options:
#   --single           Build only for the current platform/arch (fast local dev)
#   --baseline         Include AVX2-baseline binary when combined with --single
#   --skip-install     Skip cross-platform bun install step
#   --embed-web-ui     Opt-in to building and embedding the Web UI (requires packages/app)
#   --sourcemaps       Emit linked source maps alongside binaries
#   --test             Run package-level unit tests after the build
#   --help             Show this help message
#
# NOTE: Web UI embedding is SKIPPED by default because packages/app is not
#       present in this repo. Pass --embed-web-ui to enable it if/when the
#       app package is added.
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
  grep '^#' "${BASH_SOURCE[0]}" | grep -v '^#!/' | sed 's/^# \?//'
  exit 0
}

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
RUN_TESTS=false
EMBED_WEB_UI=false
BUILD_FLAGS=()

for arg in "$@"; do
  case "$arg" in
    --help)             usage ;;
    --test)             RUN_TESTS=true ;;
    --embed-web-ui)     EMBED_WEB_UI=true ;;
    --single|--baseline|--skip-install|--sourcemaps)
                        BUILD_FLAGS+=("$arg") ;;
    *) err "Unknown argument: $arg" ;;
  esac
done

# Always skip Web UI embed unless explicitly opted in
if ! $EMBED_WEB_UI; then
  BUILD_FLAGS+=("--skip-embed-web-ui")
  log "Web UI embedding skipped (pass --embed-web-ui to enable)."
fi

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
if [[ "$(printf '%s\n%s' "$REQUIRED_BUN" "$BUN_VERSION" | sort -V | head -1)" != "$REQUIRED_BUN" ]]; then
  err "bun >= $REQUIRED_BUN required (found $BUN_VERSION). Run: bun upgrade"
fi

# If --embed-web-ui was requested, verify packages/app actually exists
if $EMBED_WEB_UI && [[ ! -d "$REPO_ROOT/packages/app" ]]; then
  err "--embed-web-ui requested but packages/app does not exist in this repo."
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
bun run script/build.ts "${BUILD_FLAGS[@]}"

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
