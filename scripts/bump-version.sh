#!/usr/bin/env bash
# Usage: ./scripts/bump-version.sh [patch|minor|major]
# Bumps the version across all Pulse manifest files and prints the new version.

set -euo pipefail

BUMP="${1:-patch}"
ROOT="${PULSE_VERSION_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

FILES=(
  "$ROOT/.claude-plugin/plugin.json"
  "$ROOT/.codex-plugin/plugin.json"
  "$ROOT/.agents/plugins/marketplace.json"
  "$ROOT/.claude-plugin/marketplace.json"
)
README_FILE="$ROOT/README.md"

for FILE in "${FILES[@]}" "$README_FILE"; do
  if [[ ! -f "$FILE" ]]; then
    echo "Error: required version surface not found: $FILE" >&2
    exit 1
  fi
done

# Read current version from first file
CURRENT=$(grep '"version"' "${FILES[0]}" | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')

if [[ -z "$CURRENT" ]]; then
  echo "Error: could not read current version from ${FILES[0]}" >&2
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *)
    echo "Usage: $0 [patch|minor|major]" >&2
    exit 1
    ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"

for FILE in "${FILES[@]}"; do
  TMP_FILE="${FILE}.pulse-version.$$"
  if [[ -e "$TMP_FILE" ]]; then
    echo "Error: temporary path already exists: $TMP_FILE" >&2
    exit 1
  fi
  cp -p "$FILE" "$TMP_FILE"
  sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$NEW\"/g" "$FILE" > "$TMP_FILE"
  mv "$TMP_FILE" "$FILE"
  echo "  updated: $FILE"
done

TMP_FILE="${README_FILE}.pulse-version.$$"
if [[ -e "$TMP_FILE" ]]; then
  echo "Error: temporary path already exists: $TMP_FILE" >&2
  exit 1
fi
cp -p "$README_FILE" "$TMP_FILE"
sed -E "s/version-[0-9]+\.[0-9]+\.[0-9]+-/version-$NEW-/g" "$README_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$README_FILE"
echo "  updated: $README_FILE"

echo ""
echo "$CURRENT → $NEW"
