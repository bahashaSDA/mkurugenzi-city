#!/usr/bin/env node
// Fix two vehicles in real_vehicles2_kit.glb that build_real_kit.py baked facing the wrong way
// (its rotation table maps a "+x"/"-x" source front to Blender +Y = game -Z, i.e. backwards):
//   rv_graffiti  baked with forward="+y" but the source faces -X: shipped turned 90 degrees (driving
//                sideways) and scaled to its WIDTH (10.9 m long, 5.2 m tall) -> turn -90, scale to 5.1 m
//   rv_boda      baked with forward="-x": shipped facing backwards (tail first)  -> turn 180
// build_real_kit.py now has forward="+x" for both, so a full rebake comes out right too.
// Run BEFORE tools/split-wheels.mjs (the wheels are split in the corrected frame).
// Idempotent (marks the nodes in extras).
//   node tools/fix-vehicle-facing.mjs [kit.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const file = process.argv[2] ?? 'public/models/real_vehicles2_kit.glb';
const doc = await io.read(file);

const LENGTH = 5.1;
let fixed = 0;
/** Premultiply every node of a piece (not its LOD groups) by `fix`. */
function apply(piece, fix) {
  for (const n of doc.getRoot().listNodes()) {
    if (!(n.getName().startsWith(`${piece}_`) || n.getName().startsWith(`COL_${piece}`)) || /_LOD\d$/.test(n.getName())) continue;
    if (n.getExtras()?.fixedFacing) continue;
    const m = fix.clone().multiply(new THREE.Matrix4().fromArray(n.getMatrix()));
    const t = new THREE.Vector3();
    const r = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(t, r, s);
    n.setTranslation(t.toArray()).setRotation(r.toArray()).setScale(s.toArray());
    n.setExtras({ ...(n.getExtras() ?? {}), fixedFacing: true });
    fixed++;
  }
}
apply('rv_boda', new THREE.Matrix4().makeRotationY(Math.PI));
// current length along X of the LOD0 body (to compute the scale)
const body0 = doc.getRoot().listNodes().find((n) => n.getName() === 'rv_graffiti_body_L0');
if (!body0) throw new Error('rv_graffiti_body_L0 not found');
let minX = Infinity;
let maxX = -Infinity;
{
  const T = body0.getTranslation();
  const S = body0.getScale();
  for (const prim of body0.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const p = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p);
      minX = Math.min(minX, p[0] * S[0] + T[0]);
      maxX = Math.max(maxX, p[0] * S[0] + T[0]);
    }
  }
}
const k = LENGTH / (maxX - minX);
if (!body0.getExtras()?.fixedFacing) apply('rv_graffiti', new THREE.Matrix4().makeRotationY(-Math.PI / 2).multiply(new THREE.Matrix4().makeScale(k, k, k)));
await io.write(file, doc);
console.log(`[facing] fixed ${fixed} nodes (graffiti x${k.toFixed(3)}: ${(maxX - minX).toFixed(2)} m -> ${LENGTH} m; boda turned 180)`);
