"""Abel's wardrobe and hairstyles (session 12, Parts 9 and 10).

Builds Abel exactly as build_humans.py does (same MPFB2 spec, same game_engine rig, same body), once
per outfit with that outfit's MakeHuman CC0 garments fitted to him, and exports per outfit:
  wd_<id>_<n>      the garments (skinned to the rig)
  wd_<id>_skin     the skin that outfit shows but Abel's shipped body doesn't have: build_humans
                   culls body faces under the tweed suit (cull_hidden_body), so a T-shirt would show
                   holes at the forearms and neck without it. Computed as the faces left by culling
                   under THIS outfit minus the faces left under the suit (matched by position).
and per hairstyle:
  wd_hair_<id>     the MPFB2 hair mesh fitted to his head (his painted buzz cut stays under it)

The game binds these meshes to Abel's own skeleton by bone name and uses his own inverse bind
matrices (systems/player/wardrobe), so nothing here has to match abel.glb's bone axes, only its
bind space (same body, same origin). `--probe` also exports the suit jacket from this fresh build so
tools can check that.

  blender -b -P blender/scripts/build_wardrobe.py -- --out public/models/raw/wardrobe [--only id,id] [--probe]
(NOT --factory-startup: MPFB is a user extension.) Then:
  node tools/optimize-assets.mjs public/models/raw/wardrobe public/models/wardrobe
"""
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
# build_humans.py builds every character at import: load its definitions only
_src = open(os.path.join(HERE, "build_humans.py"), encoding="utf8").read()
_src = _src[: _src.index("\nfor name, spec in CHARACTERS.items():")]
ns = {"__file__": os.path.join(HERE, "build_humans.py"), "__name__": "humans"}
exec(compile(_src, "build_humans.py", "exec"), ns)
from abel_look import _find, _mesh_objects, cull_hidden_body  # noqa: E402
from npc_look import merch_outfit, recolour_outfit  # noqa: E402

ARGS = ns["ARGS"]
OUT = ARGS[ARGS.index("--out") + 1] if "--out" in ARGS else "public/models/raw/wardrobe"
ONLY = set(ARGS[ARGS.index("--only") + 1].split(",")) if "--only" in ARGS else None
ROOT = ns["ROOT"]
ABEL = ns["CHARACTERS"]["abel"]
BLACK, SAND, COFFEE, BURGUNDY, NAVY, WHITE, DENIM, CHARCOAL = (ns[k] for k in ("BLACK", "SAND", "COFFEE", "BURGUNDY", "NAVY", "WHITE", "DENIM", "CHARCOAL"))
W_LOGO, B_LOGO, BR_LOGO = ns["W_LOGO"], ns["B_LOGO"], ns["BR_LOGO"]
KHAKI, OLIVE, OVERALL_BLUE = (0.28, 0.22, 0.12), (0.09, 0.11, 0.05), (0.03, 0.07, 0.17)

# id -> (MakeHuman garments, dress function or None). Prices/names live in src/game/wardrobe.ts.
OUTFITS = {
    "hoodie_black": (("male_casualsuit02", "shoes04"), lambda: merch_outfit("male_casualsuit02", BLACK, BLACK, "wd_black_excellence", W_LOGO)),
    "hoodie_sand": (("male_casualsuit02", "shoes01"), lambda: merch_outfit("male_casualsuit02", SAND, DENIM, "wd_desert_sand", BR_LOGO)),
    "tee_burgundy": (("male_casualsuit04", "shoes04"), lambda: merch_outfit("male_casualsuit04", BURGUNDY, DENIM, "wd_burgundy_bliss", W_LOGO)),
    "tee_botanical": (("male_casualsuit06", "shoes02"), lambda: merch_outfit("male_casualsuit06", WHITE, DENIM, "wd_botanical", B_LOGO, pattern="merch_botanical.png")),
    "track_coffee": (("male_casualsuit02", "shoes01"), lambda: merch_outfit("male_casualsuit02", COFFEE, COFFEE, "wd_coffee", W_LOGO)),
    "casual_khaki": (("male_casualsuit01", "shoes02"), lambda: recolour_outfit("male_casualsuit01", (0.6, 0.6, 0.58), KHAKI, "wd_khaki_shirt", "wd_khaki_trousers")),
    "casual_navy": (("male_casualsuit03", "shoes03"), lambda: recolour_outfit("male_casualsuit03", NAVY, CHARCOAL, "wd_navy_top", "wd_charcoal_trousers")),
    "overalls": (("male_worksuit01", "shoes02"), lambda: recolour_outfit("male_worksuit01", OVERALL_BLUE, OVERALL_BLUE, "wd_overall_top", "wd_overall_bottom")),
}
# hairstyle id -> MPFB2 hair asset (fitted to his head; colour from finish_materials: near-black)
HAIR = {"short_natural": "short02", "taper": "short04", "classic": "short01", "textured": "short03", "afro": "afro01"}

KEEP_OUT = ("low-poly", "eyebrow", "eyelash", "short0", "afro", "braid", "bob", "long0", "ponytail")


def body_faces(ob):
    """Face centroids (world, mm) of the body proxy: identifies faces across builds."""
    mw = ob.matrix_world
    return {tuple(round(c * 1000) for c in (mw @ p.center)) for p in ob.data.polygons}


def build_abel(clothes, hair=""):
    spec = dict(ABEL, clothes=[f"{c}/{c}.mhclo" for c in clothes], hair=f"{hair}/{hair}.mhclo" if hair else ABEL["hair"])
    ns["build"](spec)
    ns["finish_materials"]("abel")


def export(objs, name):
    os.makedirs(os.path.join(ROOT, OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.select_set(True)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    path = os.path.join(ROOT, OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_skins=True, export_animations=False, export_def_bones=False, export_materials="EXPORT", export_image_format="AUTO",
    )
    print(f"[wardrobe] exported {path} ({', '.join(o.name for o in objs)})")


# ---- the suit's culled body: what the shipped Abel already has
build_abel(("male_elegantsuit01", "shoes03"))
cull_hidden_body()
SUIT = body_faces(_find("male_generic"))
print(f"[wardrobe] shipped body keeps {len(SUIT)} faces under the suit")
if "--probe" in ARGS:
    jacket = _find("male_elegantsuit01")
    jacket.name = "wd_probe_suit"
    export([jacket], "wd_probe")

for oid, (clothes, dress) in OUTFITS.items():
    if ONLY and oid not in ONLY:
        continue
    print(f"[wardrobe] outfit {oid}")
    build_abel(clothes)
    body = _find("male_generic")
    full = body.copy()
    full.data = body.data.copy()
    full.name = "wd_fullskin"
    bpy.context.scene.collection.objects.link(full)
    full.hide_set(True)  # not a garment: cull_hidden_body only looks at visible meshes
    cull_hidden_body()
    shows = body_faces(body)
    # the skin patch: faces this outfit leaves visible that the suit body doesn't have
    bm = bmesh.new()
    bm.from_mesh(full.data)
    mw = full.matrix_world
    dead = [f for f in bm.faces if (lambda k: k not in shows or k in SUIT)(tuple(round(c * 1000) for c in (mw @ f.calc_center_median())))]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(full.data)
    bm.free()
    patch_faces = len(full.data.polygons)
    if dress:
        dress()
    garments = [o for o in _mesh_objects() if o is not body and o is not full and not any(k in o.name for k in KEEP_OUT)]
    for i, g in enumerate(garments):
        g.name = f"wd_{oid}_{i}"
    out = list(garments)
    if patch_faces:
        full.name = f"wd_{oid}_skin"
        out.append(full)
    print(f"[wardrobe]   garments {[g.name for g in garments]}, skin patch {patch_faces} faces")
    export(out, f"wd_{oid}")

for hid, asset in HAIR.items():
    if ONLY and f"hair_{hid}" not in ONLY:
        continue
    print(f"[wardrobe] hair {hid} <- {asset}")
    build_abel(("male_elegantsuit01", "shoes03"), hair=asset)
    hair = _find(asset)
    if not hair:
        print(f"[wardrobe]   no hair object for {asset}")
        continue
    hair.name = f"wd_hair_{hid}"
    export([hair], f"wd_hair_{hid}")
