#!/usr/bin/env bash
# Luckland build — assembles a clean, upload-ready static site in build/.
#
# There is no bundler or transpiler: the game is plain ES modules and
# canvas. "Building" means copying exactly the files the app needs at
# runtime (leaving out .git, CI config, dev scripts and notes), then
# verifying that everything the service worker promises to cache is
# actually present.
#
# Usage:  ./scripts/build.sh            (from anywhere in the repo)
# Output: build/  — upload its CONTENTS to your web host.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/build"

cd "$ROOT"

echo "🍀 Building Luckland…"
rm -rf "$OUT"
mkdir -p "$OUT"

# Runtime files only.
cp index.html styles.css manifest.json sw.js "$OUT/"
cp -R src "$OUT/src"
cp -R icons "$OUT/icons"
cp -R lucklianIndex "$OUT/lucklianIndex"   # the Lucklian Index reference page

# Every path the service worker pre-caches must exist, or the PWA will
# fail to install offline on first load.
missing=0
while IFS= read -r f; do
  [ "$f" = "." ] && continue
  if [ ! -f "$OUT/$f" ]; then
    echo "  ✗ missing file listed in sw.js: $f"
    missing=$((missing + 1))
  fi
done < <(sed -n "/^const SHELL = \[/,/^\];/p" sw.js | sed -n "s/^[[:space:]]*'\([^']*\)',*$/\1/p")

if [ "$missing" -gt 0 ]; then
  echo "Build failed: $missing file(s) referenced by sw.js are not in the build." >&2
  exit 1
fi

version="$(sed -n "s/^const CACHE_VERSION = '\(.*\)';$/\1/p" sw.js)"
files="$(find "$OUT" -type f | wc -l | tr -d ' ')"
size="$(du -sh "$OUT" | cut -f1)"

echo "✅ Build complete — $files files, $size  (cache: $version)"
echo "   Output: $OUT"
echo "   Preview locally:  cd build && python3 -m http.server 8000"
echo "   Then upload the CONTENTS of build/ to your host."
