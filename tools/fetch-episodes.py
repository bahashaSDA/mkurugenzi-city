#!/usr/bin/env python3
"""Refresh the episode list in public/content/content.json from Abel's official YouTube channel.

Reads metadata only (titles, IDs, durations) with yt-dlp's --flat-playlist. No video is ever
downloaded or re-hosted; the game plays videos through the YouTube IFrame API (SPEC 2.5).

    pip install yt-dlp
    python tools/fetch-episodes.py            # writes public/content/content.json in place

Non-episode fields in content.json (links, merch, contact...) are preserved.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

CHANNEL = "https://www.youtube.com/@mkurugenziii"
CONTENT = Path(__file__).resolve().parent.parent / "public" / "content" / "content.json"

# Order matters: first match wins.
SHOWS = [
    ("Mkurugenzi Minisodes", r"mini?s?odes?|minsode"),
    ("Mkurugenzi Diastories", r"diastor"),
    ("Young and Stupid", r"young\s*(&|and|n)\s*stupid"),
    ("Headline Hitters", r"headline\s*hitters?"),
    ("Stories of My Life", r"stories\s*of\s*my\s*life"),
    ("Celebrity First Encounters", r"first\s*encounter"),
    ("The Play House", r"play\s*house"),
    ("Shorts", r"#shorts"),
]
# SPEC 2.5 privacy: nothing about his home or private purchases goes into the world.
PRIVATE = re.compile(r"own a home|home owners|closing day|best purchase ever", re.I)


def ytdlp(url):
    cmd = [sys.executable, "-m", "yt_dlp", "--flat-playlist", "--skip-download", "-J", url]
    return json.loads(subprocess.run(cmd, check=True, capture_output=True, text=True, encoding="utf-8").stdout)


def classify(title):
    for name, rx in SHOWS:
        if re.search(rx, title, re.I):
            return name
    return "Other Stories"


def season_episode(title):
    m = re.search(r"(\d+)\s*(?:\|\||-|,)?\s*ep(?:isode)?\.?\s*(\d+)", title, re.I)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"ep(?:isode)?\.?\s*(\d+)", title, re.I)
    return (None, int(m.group(1))) if m else (None, None)


def main():
    episodes, dropped = [], []
    for tab, forced_show in (("videos", None), ("streams", "Live Streams")):
        data = ytdlp(f"{CHANNEL}/{tab}")
        for e in data.get("entries", []):
            title = re.sub(r"\s+", " ", e["title"]).replace("�", "'").strip()
            if PRIVATE.search(title):
                dropped.append(title)
                continue
            season, ep = season_episode(title)
            episodes.append({
                "youtubeId": e["id"],
                "title": title,
                "show": forced_show or classify(title),
                "season": season,
                "episode": ep,
                "durationSec": int(e["duration"]) if e.get("duration") else None,
            })
        if tab == "videos":
            subs = data.get("channel_follower_count")

    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    content.pop("_note", None)
    content["episodes"] = episodes  # newest first, as YouTube lists them
    content["shows"] = sorted({e["show"] for e in episodes})
    if subs:
        content.setdefault("stats", {})["youtubeSubscribers"] = subs
    CONTENT.write_text(json.dumps(content, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(episodes)} episodes to {CONTENT}; skipped for privacy: {dropped}")


if __name__ == "__main__":
    main()
