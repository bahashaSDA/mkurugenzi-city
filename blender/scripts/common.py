"""Shared helpers for the headless Blender pipeline (SPEC 5.1/5.2).

Run any script with:  blender -b <file.blend> -P blender/scripts/<script>.py -- [args]
Conventions:
  * 1 unit = 1 metre. Blender is Z-up; the glTF exporter converts to Y-up.
  * Render objects:   <name>_LOD0, <name>_LOD1, <name>_LOD2
  * Collision meshes: COL_<name>  (boxes / hulls only, never exported with materials)
  * Objects with the custom property  no_collider = True  are exempt from the audit (small clutter).
"""
import sys
import bpy


def script_args():
    """Arguments after the `--` separator."""
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def base_name(obj_name: str) -> str:
    for suffix in ("_LOD0", "_LOD1", "_LOD2"):
        if obj_name.endswith(suffix):
            return obj_name[: -len(suffix)]
    return obj_name


def render_objects(collection=None):
    objs = collection.all_objects if collection else bpy.context.scene.objects
    return [o for o in objs if o.type == "MESH" and not o.name.startswith("COL_")]


def lod0_objects(collection=None):
    return [o for o in render_objects(collection) if o.name.endswith("_LOD0")]


def ensure_collection(name: str, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def deselect_all():
    for o in bpy.context.selected_objects:
        o.select_set(False)
