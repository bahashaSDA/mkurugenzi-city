#!/usr/bin/env python3
"""Download real-world reference photos of Nairobi from Wikimedia Commons for modelling study
(SPEC 2B R.1: reference images are for study only and never go into the build as textures).

Only freely licensed files are kept (CC0, public domain, CC BY, CC BY-SA), at 1280 px wide,
into research/visual-references/<topic>/ with a SOURCES.md attribution file per topic.

    python tools/fetch-references.py
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "research" / "visual-references"
UA = {"User-Agent": "MkurugenziCity-research/1.0 (reference study; contact via project repo)"}
LICENSES = re.compile(r"^(CC0|Public domain|CC BY(-SA)? [0-9.]+)$", re.I)
PER_TOPIC = 10

TOPICS = {
    "kiosks": ["Kiosk in Nairobi", "M-Pesa kiosk Kenya", "Kiosks Nairobi road", "duka Kenya shop"],
    "informal-settlement": ["Kibera houses", "Kibera rooftops", "Kibera slum Nairobi", "Mathare Nairobi houses"],
    "railway-kibera": ["Kibera railway", "Kibera Slum Railway Tracks"],
    "matatus": ["matatu Nairobi", "matatu graffiti", "Matatu slogans"],
    "boda-boda": ["boda boda Kenya", "boda boda stage"],
    "cbd-streets": ["Moi Avenue Nairobi", "Kenyatta Avenue Nairobi", "Tom Mboya Street Nairobi"],
    "markets": ["Toi Market Nairobi", "Gikomba market", "Nairobi market vendors"],
    "roads-traffic": ["Nairobi traffic road", "Nairobi street pedestrians"],
    "landmarks": ["Kenyatta International Conference Centre", "Kenya National Theatre Nairobi"],
}
# Search hits that are off-topic (checked by eye after the first run).
SKIP = re.compile(r"weaving|manhole|toilet|pineapple|Africa 118|bicycle boda|cows|students celebrating|backpack|jewelry", re.I)


def api(params):
    params.update(format="json")
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))


def download(url, dest):
    """Polite download: 1.5 s between files, exponential backoff on HTTP 429 (Wikimedia policy)."""
    for attempt in range(6):
        try:
            time.sleep(1.5)
            dest.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read())
            return
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(10 * 2 ** attempt)
    raise RuntimeError(f"gave up on {url}")


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def main():
    for topic, queries in TOPICS.items():
        out = ROOT / topic
        out.mkdir(parents=True, exist_ok=True)
        seen, rows = set(), []
        for q in queries:
            if len(rows) >= PER_TOPIC:
                break
            d = api(dict(action="query", generator="search", gsrsearch=f"{q} filetype:bitmap", gsrnamespace=6,
                         gsrlimit=12, prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=1280))
            for p in sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0)):
                title = p["title"][5:]
                if title in seen or SKIP.search(title) or len(rows) >= PER_TOPIC:
                    continue
                ii = p["imageinfo"][0]
                meta = ii["extmetadata"]
                lic = meta.get("LicenseShortName", {}).get("value", "")
                if not LICENSES.match(lic.strip()):
                    continue
                seen.add(title)
                safe = re.sub(r"[^A-Za-z0-9._-]+", "_", title)[:90]
                dest = out / safe
                if not dest.exists():
                    download(ii["thumburl"], dest)
                rows.append((safe, title, strip_html(meta.get("Artist", {}).get("value")), lic, ii["descriptionurl"]))
        with open(out / "SOURCES.md", "w", encoding="utf-8") as f:
            f.write(f"# {topic}: reference photos (study only; not for use as textures)\n\n")
            f.write("| File | Original title | Author | Licence | Source |\n|---|---|---|---|---|\n")
            for r in rows:
                f.write("| " + " | ".join(x.replace("|", "/") for x in r) + " |\n")
        print(f"[ref] {topic}: {len(rows)} photos")


if __name__ == "__main__":
    main()
