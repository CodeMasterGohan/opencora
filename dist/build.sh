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
# Install system prerequisites (C/C++ build tools, pkg-config, etc.)
# ---------------------------------------------------------------------------
install_system_deps() {
  log "Installing system build dependencies…"

  if command -v apt-get &>/dev/null; then
    # Debian/Ubuntu
    sudo apt-get update -qq
    sudo apt-get install -y -qq build-essential pkg-config curl wget
  elif command -v yum &>/dev/null; then
    # RHEL/CentOS/Fedora
    sudo yum install -y -q gcc gcc-c++ make pkgconfig curl wget
  elif command -v dnf &>/dev/null; then
    # Fedora (newer)
    sudo dnf install -y -q gcc gcc-c++ make pkgconfig curl wget
  elif command -v pacman &>/dev/null; then
    # Arch/Manjaro
    sudo pacman -S --noconfirm --needed base-devel pkg-config curl wget
  elif command -v brew &>/dev/null; then
    # macOS
    brew install pkg-config curl wget
  else
    err "Cannot determine package manager. Please install build-essential, gcc, g++, pkg-config, curl, and wget manually."
  fi

  log "System dependencies installed."
}

# Check what's missing and install it
NEED_INSTALL=false

for cmd in pkg-config gcc g++ make curl wget; do
  if ! command -v "$cmd" &>/dev/null; then
    log "Missing prerequisite: $cmd"
    NEED_INSTALL=true
    break
  fi
done

if $NEED_INSTALL; then
  install_system_deps
fi

# ---------------------------------------------------------------------------
# Install bun if not present or outdated
# ---------------------------------------------------------------------------
if ! command -v bun &>/dev/null; then
  log "bun not found. Installing bun…"
  if curl --version &>/dev/null; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    if ! command -v bun &>/dev/null; then
      err "Failed to install bun. Please install it manually from https://bun.sh"
    fi
  else
    err "curl not found. Please install curl first, or install bun manually from https://bun.sh"
  fi
fi

BUN_VERSION=$(bun --version 2>/dev/null || true)
log "bun version: $BUN_VERSION"

REQUIRED_BUN="1.3.14"
if [[ "$(printf '%s\n%s' "$REQUIRED_BUN" "$BUN_VERSION" | sort -V | head -1)" != "$REQUIRED_BUN" ]]; then
  log "bun version too old (need >= $REQUIRED_BUN, found $BUN_VERSION). Upgrading…"
  bun upgrade || err "Failed to upgrade bun. Please upgrade manually."
  BUN_VERSION=$(bun --version 2>/dev/null || true)
  log "bun version: $BUN_VERSION"
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

# Clear bun cache to avoid stale dependency issues
bun cache --yes 2>/dev/null || true

# Install all workspace dependencies (needed before building)
log "Installing all workspace dependencies…"
bun install 2>&1

# Install any missing transitive dependencies that the build needs
# These are catalog entries used by packages/core and packages/opencode
log "Ensuring all build-time dependencies are installed…"

# Add missing catalog packages that the build needs
bun add --save-dev \
  "@effect/opentelemetry@4.0.0-beta.83" \
  "@effect/platform-node@4.0.0-beta.83" \
  "@opentelemetry/api" \
  "@opentelemetry/sdk-trace-base" \
  "@opentelemetry/exporter-trace-otlp-http" \
  "@opentelemetry/context-async-hooks" \
  "@opentelemetry/core" \
  2>&1 || true

# Verify critical dependencies exist
if [[ ! -L "$REPO_ROOT/packages/opencode/node_modules/@opentui/core" ]]; then
  err "node_modules/@opentui/core not found after install. Run 'bun install' at repo root and try again."
fi

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