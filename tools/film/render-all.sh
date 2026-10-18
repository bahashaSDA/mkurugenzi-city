#!/bin/sh
# Full 4K render of every video, then assembly.  sh tools/film/render-all.sh <shotDir> <outDir>
SH="$1"; OUT="$2"
for v in v1-day v2-night v3-wheel v4-matatu v5-kibera v6-coast v7-gameplay; do
  echo "== $v $(date +%H:%M)"
  node tools/film/$v.mjs "$SH" 2>&1 | grep -v "^  " | tail -2
done
echo "== assemble $(date +%H:%M)"
node tools/film/assemble.mjs "$SH" "$OUT"
echo "== finished $(date +%H:%M)"
