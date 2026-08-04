#!/usr/bin/env bash
# Usage: ./scripts/bump-version.sh [patch|minor|major]
# Bumps the version across all Pulse manifest files and prints the new version.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
exec node "$SCRIPT_DIR/bump-version.mjs" "${1:-patch}"
