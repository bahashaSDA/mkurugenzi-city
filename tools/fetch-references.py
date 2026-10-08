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
WIDTH = 2560  # HD study images (original size if smaller)
# Public domain / CC0 files may also be used as textures (SPEC 2B R.1); everything else is study only.
TEXTURE_OK = re.compile(r"^(CC0|Public domain)$", re.I)

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
    # owner's element list (session 4)
    "shop-fronts": ["Nairobi shop front", "Eastlands Nairobi shops", "Kenya shop storefront street", "Kawangware shops",
                    "Githurai shops", "Kenya hardware shop", "Kenya butchery shop", "Kenya barber shop"],
    "street-views": ["Nairobi street shops", "Kayole Nairobi", "Umoja Nairobi estate", "Kangemi Nairobi", "Kibera main road"],
    "poles-cables": ["electricity pole Kenya", "power lines Nairobi", "Kenya Power pole", "street light Nairobi"],
    "trees": ["Jacaranda Nairobi", "Jacaranda mimosifolia Kenya", "Spathodea campanulata Kenya", "Bougainvillea Kenya",
              "Nairobi street trees", "Croton megalocarpus"],
    "ground-roads": ["pothole Kenya road", "murram road Kenya", "dirt road Nairobi", "speed bump Kenya", "drainage Nairobi"],
    "matatu-interior": ["matatu interior", "matatu seats", "Kenya minibus interior"],
    "people-street-life": ["Nairobi street vendor", "mama mboga", "hawker Nairobi", "Nairobi pedestrians", "Kenya school uniform students"],
    "food-stalls": ["roasted maize Kenya", "chips stall Kenya", "mkokoteni", "handcart Nairobi", "charcoal jiko"],
    "housing-plots": ["mabati house Kenya", "corrugated iron house Kenya", "Mathare houses", "Kenya steel gate", "Kibera alley"],
    "street-clutter": ["plastic chairs Kenya", "water tank Kenya rooftop", "jerrican Kenya", "newspaper vendor Nairobi"],
    "boda-detail": ["boda boda rider reflective", "boda boda seat"],
}
# Search hits that are off-topic (checked by eye after the first run).
SKIP = re.compile(r"weaving|manhole|toilet|pineapple|Africa 118|bicycle boda|cows|students celebrating|backpack|jewelry|archaeology|printing the past", re.I)


def api(params):
    params.update(format="json")
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    for attempt in range(6):  # back off on HTTP 429 like downloads do
        try:
            time.sleep(1.0)
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(15 * 2 ** attempt)
    raise RuntimeError(f"search gave up: {url}")


def download(url, dest):
    """Polite download: 1.5 s between files, exponential backoff on HTTP 429 (Wikimedia policy)."""
    for attempt in range(6):
        try:
            time.sleep(3.0)  # HD files: stay well under Wikimedia's rate limits
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
                         gsrlimit=12, prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=WIDTH))
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
                    try:
                        download(ii["thumburl"], dest)
                    except Exception as e:  # one stubborn file must not stop the whole library
                        print(f"[ref] skipped {title}: {e}")
                        continue
                rows.append((safe, title, strip_html(meta.get("Artist", {}).get("value")), lic, ii["descriptionurl"]))
        with open(out / "SOURCES.md", "w", encoding="utf-8") as f:
            f.write(f"# {topic}: reference photos\n\n")
            f.write("Only rows marked 'texture OK' (CC0 / public domain) may be used as textures; the rest are study only.\n\n")
            f.write("| File | Original title | Author | Licence | Use | Source |\n|---|---|---|---|---|---|\n")
            for safe, title, author, lic, url in rows:
                use = "texture OK" if TEXTURE_OK.match(lic.strip()) else "study only"
                f.write("| " + " | ".join(x.replace("|", "/") for x in (safe, title, author, lic, use, url)) + " |\n")
        print(f"[ref] {topic}: {len(rows)} photos")


if __name__ == "__main__":
    main()
