#!/bin/sh
# Low-res previews of every video + contact sheets.  sh tools/film/preview-all.sh <dir> [videos...]
D="$1"; shift
V="${*:-v1-day v2-night v3-wheel v4-matatu v5-kibera v6-coast v7-gameplay}"
for v in $V; do
  echo "== $v"
  FILM_PREVIEW=1 node tools/film/$v.mjs "$D" 2>&1 | grep -v "^  " | tail -3
  node tools/film/sheet.mjs "$D" "${v%%-*}" "$D/sheet_${v%%-*}.jpg" 2>&1 | tail -1
done
