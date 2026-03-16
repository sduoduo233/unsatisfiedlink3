#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

OUT="${1:-release.zip}"
zip -r "$OUT" . \
  -x ".git/*" \
  -x ".vscode/*" \
  -x "uploads/*" \
  -x "uploads_tmp/*" \
  -x "db.sqlite" \
  -x "*.zip"

echo "Created $OUT"
