"""List the loose mesh islands of each real vehicle (in build_real_kit's baked frame) that are
shaped like a door skin: thin across the car, door-sized along it, on the side between the axles.
Many Sketchfab cars model each door as its own island even when all panels share one object.

  blender -b --factory-startup -P blender/scripts/find_door_islands.py -- rv_corolla,rv_probox
"""
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(__file__)
src = open(os.path.join(HERE, "build_real_kit.py"), encoding="utf8").read()
src = src[: src.rindex("main()")]
sys.argv = [a for a in sys.argv if a != "--"] + ["--"]
ns = {"__file__": os.path.join(HERE, "build_real_kit.py"), "__name__": "kit"}
exec(compile(src, "build_real_kit.py", "exec"), ns)
PIECES = sys.orig_argv[sys.orig_argv.index("--") + 1].split(",")
cfgs = {k: v for kit in ns["MODELS"].values() for k, v in kit.items()}

for piece in PIECES:
    cfg = cfgs[piece]
    ns["reset"]()
    ob = ns["import_joined"](os.path.join(ns["SRC"], cfg["file"] + ".glb"), None, cfg.get("strip", r"airbag"),
                             ns["PAINT"], False, cfg.get("texfix"), cfg.get("recalc", False), None)
    ns["normalise"](ob, cfg)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    seen = set()
    islands = []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, isl = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        vs = {v for g in isl for v in g.verts}
        xs = [v.co.x for v in vs]
        ys = [v.co.y for v in vs]
        zs = [v.co.z for v in vs]
        islands.append((len(isl), min(xs), max(xs), min(ys), max(ys), min(zs), max(zs),
                        ob.data.materials[isl[0].material_index].name if ob.data.materials else ""))
    d = ob.dimensions
    print(f"[islands] {piece}: {len(islands)} islands, body {d.x:.2f} x {d.y:.2f} x {d.z:.2f}")
    for n, x0, x1, y0, y1, z0, z1, mat in sorted(islands, key=lambda t: -t[0]):
        w, l, h = x1 - x0, y1 - y0, z1 - z0
        if w < 0.45 and 0.5 < l < 1.6 and 0.35 < h < 1.4 and max(abs(x0), abs(x1)) > 0.55 and z0 > 0.05:
            print(f"  DOOR? faces={n:5d} x[{x0:+.2f},{x1:+.2f}] y[{y0:+.2f},{y1:+.2f}] z[{z0:.2f},{z1:.2f}] {mat}")
    big = sorted(islands, key=lambda t: -t[0])[:6]
    for n, x0, x1, y0, y1, z0, z1, mat in big:
        print(f"  big   faces={n:5d} x[{x0:+.2f},{x1:+.2f}] y[{y0:+.2f},{y1:+.2f}] z[{z0:.2f},{z1:.2f}] {mat}")
    bm.free()
