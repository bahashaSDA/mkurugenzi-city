import * as THREE from 'three';

// Hidden objects keep their matrices as they were. three recomputes the matrix of EVERY object in
// the scene every frame, hidden or not: here ~13 800 objects, most of them the bones of pooled
// people and props that are switched off (only ~230 of 1 100 meshes are shown at a time). That was
// 15 % of a frame's CPU on a PC and far more on a phone. A hidden subtree is skipped; the first
// frame it is shown again it is fully recomputed (so it can never appear at a stale place).
// Code that needs a hidden object's world position asks for it with getWorldPosition /
// updateWorldMatrix, which take their own path and still work.
// Imported once, before the renderer starts (app/Game).

type Skippable = THREE.Object3D & { __mkStale?: boolean };

const proto = THREE.Object3D.prototype as Skippable;
const original = proto.updateMatrixWorld;

proto.updateMatrixWorld = function (this: Skippable, force?: boolean) {
  // only the per-frame pass (no force): an explicit updateMatrixWorld(true) still does everything,
  // and a moving parent still forces its hidden children along
  if (!force && !this.visible && !(this as unknown as THREE.Light).isLight && !(this as unknown as THREE.Camera).isCamera) {
    this.__mkStale = true;
    return;
  }
  if (this.__mkStale) {
    this.__mkStale = false;
    force = true;
  }
  original.call(this, force);
};
