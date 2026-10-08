#!/usr/bin/env python3
"""Measure real colours from the reference photos (median-cut quantisation of a chosen region).
Regions are fractions of the image (x0, y0, x1, y1), picked by eye on the photo.
    pip install pillow && python tools/sample-palettes.py > research/visual-references/PALETTES.md
"""
from pathlib import Path
from PIL import Image

REF = Path(__file__).resolve().parent.parent / "research" / "visual-references"
SAMPLES = [
    ("Kibera roofs (rusted mabati)", "informal-settlement/Kibera_rooftops_and_streets.jpg", (0.0, 0.75, 1.0, 1.0)),
    ("Kibera roofs mid-distance", "informal-settlement/Kibera_rooftops_and_streets.jpg", (0.0, 0.42, 1.0, 0.72)),
    ("Kibera murram path", "informal-settlement/Kibera_rooftops_and_streets.jpg", (0.45, 0.22, 0.6, 0.45)),
    ("Patched mabati walls", "informal-settlement/Houses_in_riparian_land_in_Kibra_slums.jpg", (0.72, 0.0, 1.0, 0.5)),
    ("Concrete block wall", "informal-settlement/Houses_in_riparian_land_in_Kibra_slums.jpg", (0.48, 0.2, 0.7, 0.33)),
    ("Wet murram + rail", "railway-kibera/Kibera_Slum_Railway_Tracks_Nairobi_Kenya_July_2012.jpg", (0.3, 0.55, 0.7, 1.0)),
    ("Kiosk steel body (red)", "kiosks/Kiosk_in_Nairobi_Argwings_Khodek_Rd.jpg", (0.08, 0.55, 0.85, 0.8)),
    ("Kiosk dusty ground", "kiosks/Kiosk_in_Nairobi_Argwings_Khodek_Rd.jpg", (0.0, 0.88, 1.0, 1.0)),
    ("Roadside murram (Chaka Rd)", "kiosks/Another_Kiosk_in_Nairobi_Chaka_Rd.jpg", (0.0, 0.82, 1.0, 1.0)),
    ("Tarmac (Tigoni Rd)", "kiosks/Kiosks_in_Nairobi_Tigoni_Road.jpg", (0.1, 0.86, 0.9, 0.94)),
    ("Nairobi street trees", "kiosks/Kiosks_in_Nairobi_Tigoni_Road.jpg", (0.0, 0.2, 1.0, 0.5)),
]


def palette(img, box, n=6):
    w, h = img.size
    crop = img.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))).convert("RGB")
    crop.thumbnail((300, 300))
    q = crop.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    counts = sorted(q.getcolors(), reverse=True)
    total = sum(c for c, _ in counts)
    return [("#%02X%02X%02X" % tuple(pal[i * 3:i * 3 + 3]), c / total) for c, i in counts]


print("# Measured palettes from reference photos\n")
print("Median-cut quantisation of hand-picked regions (`tools/sample-palettes.py`). Share = fraction of region.\n")
for name, f, box in SAMPLES:
    cols = palette(Image.open(REF / f), box)
    print(f"**{name}** ({f})  ")
    print(" ".join(f"`{hx}` {share:.0%}" for hx, share in cols) + "\n")
