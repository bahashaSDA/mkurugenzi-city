"""Orthographic side views of the real vehicles, in the exact frame build_real_kit.py bakes them in
(forward -Y, +X = left / kerb side, metres, wheels on z = 0), to read door outlines off for the
`door_boxes` config. Writes <out>/<piece>_left.png / _right.png and <out>/<piece>.json (the view
extents) for tools/door-grid.py to draw a metre grid on.

  blender -b --factory-startup -P blender/scripts/door_sideviews.py -- <out> rv_corolla,rv_cruiser,...
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(__file__)
src = open(os.path.join(HERE, "build_real_kit.py"), encoding="utf8").read()
src = src[: src.rindex("main()")]  # load the pipeline's functions and configs without running it
sys.argv = [a for a in sys.argv if a != "--"] + ["--"]  # build_real_kit parses its own args
ns = {"__file__": os.path.join(HERE, "build_real_kit.py"), "__name__": "kit"}
exec(compile(src, "build_real_kit.py", "exec"), ns)

# our own arguments (after "--"): <out> <pieces>
tail = sys.orig_argv[sys.orig_argv.index("--") + 1:]
OUT, PIECES = tail[0], tail[1].split(",")
os.makedirs(OUT, exist_ok=True)
cfgs = {k: v for kit in ns["MODELS"].values() for k, v in kit.items()}

for piece in PIECES:
    cfg = cfgs[piece]
    ns["reset"]()
    ob = ns["import_joined"](os.path.join(ns["SRC"], cfg["file"] + ".glb"), None, cfg.get("strip", r"airbag"),
                             ns["PAINT"], False, cfg.get("texfix"), cfg.get("recalc", False), None)
    if cfg.get("drop_ground"):
        ns["drop_ground"](ob)
    ns["normalise"](ob, cfg)
    d = ob.dimensions
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.display.shading.show_cavity = True
    sc.render.resolution_x, sc.render.resolution_y = 1600, int(1600 * (d.z * 1.3) / (d.y * 1.12))
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = d.y * 1.12
    info = {"length": d.y, "width": d.x, "height": d.z, "ortho": d.y * 1.12, "px": sc.render.resolution_x, "py": sc.render.resolution_y, "zc": d.z * 0.5}
    for side, sx in (("left", 1), ("right", -1)):
        cam.location = Vector((sx * 20, 0, d.z * 0.5))
        cam.rotation_euler = (math.radians(90), 0, math.radians(90 if sx > 0 else -90))
        sc.render.filepath = os.path.join(OUT, f"{piece}_{side}.png")
        bpy.ops.render.render(write_still=True)
    json.dump(info, open(os.path.join(OUT, f"{piece}.json"), "w"))
    print(f"[sideviews] {piece}: {d.x:.2f} W x {d.y:.2f} L x {d.z:.2f} H")
