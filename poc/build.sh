#!/usr/bin/env bash
# Builds poc/loadbearing.html from src/ (plain concatenation, no tooling).
# Order matters: engine modules first, then UI, then main.js.
set -euo pipefail
cd "$(dirname "$0")"
FILES="lang.js run.js infra.js sim.js starter.js map.js ui-core.js ui-build.js ui-debug.js ui-deploy.js ui-sim.js ui-play.js main.js"
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">'
  cat src/shell.html
  echo '<script>'
  for f in $FILES; do grep -v "^if (typeof module !== 'undefined')" "src/$f"; done
  echo '</script></body></html>'
} > loadbearing.html
# Syntax check the script with Node if available.
if command -v node >/dev/null 2>&1; then
  sed -n '/^<script>$/,/^<\/script>/p' loadbearing.html | sed '1d;$d' > .check.js
  node --check .check.js && rm -f .check.js && echo "built loadbearing.html (syntax OK)"
else
  echo "built loadbearing.html (node not found; syntax not checked)"
fi
