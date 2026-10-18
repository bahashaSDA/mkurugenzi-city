#!/bin/sh
# 1080p sharing copies under ~48 MB (WhatsApp / email), two-pass so each just fits.
#   sh tools/film/share.sh <marketingDir>
D="$1"; O="$D/share_1080p"; mkdir -p "$O"
cd "$D" || exit 1
for f in *_ambience.mp4; do
  n="${f%_ambience.mp4}"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  vb=$(awk -v d="$dur" 'BEGIN { b = int(46 * 8192 / d) - 160; if (b > 8000) b = 8000; print b }')
  echo "$n ${dur}s -> ${vb}k"
  ffmpeg -loglevel error -y -i "$f" -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -b:v ${vb}k -pass 1 -passlogfile "$O/_p" -an -f mp4 NUL
  ffmpeg -loglevel error -y -i "$f" -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -b:v ${vb}k -pass 2 -passlogfile "$O/_p" -c:a aac -b:a 128k -movflags +faststart "$O/${n}_1080p.mp4"
done
rm -f "$O"/_p*
ls -la "$O"
