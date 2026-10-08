"""Bake AO + lightmaps for static LOD0 geometry into UV channel 2 (SPEC 5.1 / 5.2.2).

Usage: blender -b district.blend -P blender/scripts/bake_lighting.py -- --out public/textures/<district> [--size 2048] [--samples 128]
Each static object gets a 'Lightmap' UV layer (smart project, packed into a shared atlas per district).
Writes <district>_lightmap.png; convert to KTX2 with tools/optimize-assets.mjs.
"""
import os as _os
import sys as _sys

_sys.path.append(_os.path.dirname(_os.path.abspath(__file__)))

import os
import bpy
from common import script_args, lod0_objects, deselect_all

args = script_args()


def arg(name, default):
    return args[args.index(name) + 1] if name in args else default


OUT = arg("--out", "//bake")
SIZE = int(arg("--size", 2048))
SAMPLES = int(arg("--samples", 128))


def main():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.device = "GPU" if bpy.context.preferences.addons.get("cycles") else "CPU"

    objs = [o for o in lod0_objects() if not o.get("dynamic")]
    if not objs:
        print("[bake] nothing to bake")
        return

    # 1. Second UV channel, packed into one atlas for the whole district.
    deselect_all()
    for o in objs:
        uvs = o.data.uv_layers
        if "Lightmap" not in uvs:
            uvs.new(name="Lightmap")
        uvs.active = uvs["Lightmap"]
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.003)
    bpy.ops.uv.pack_islands(margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")

    # 2. Shared bake target image, plugged as the active (unconnected) node on every material.
    district = os.path.splitext(os.path.basename(bpy.data.filepath))[0] or "district"
    img = bpy.data.images.new(f"{district}_lightmap", SIZE, SIZE, float_buffer=False)
    for o in objs:
        for slot in o.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue
            node = mat.node_tree.nodes.get("LIGHTMAP_TARGET") or mat.node_tree.nodes.new("ShaderNodeTexImage")
            node.name = "LIGHTMAP_TARGET"
            node.image = img
            mat.node_tree.nodes.active = node

    # 3. Bake diffuse lighting (direct + indirect, no colour) = lightmap incl. AO.
    bake = scene.render.bake
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_color = False
    bake.margin = 4
    bpy.ops.object.bake(type="DIFFUSE")

    out_dir = bpy.path.abspath(OUT)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{district}_lightmap.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    print(f"[bake] wrote {path}")


main()
