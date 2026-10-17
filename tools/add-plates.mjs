#!/usr/bin/env node
// Cover the real registration plates on the scanned graffiti matatu (rv_graffiti) with fictional
// Kenyan plates (white front, yellow rear, "KMK 254M"). The scan's texture atlas is shredded into
// thousands of islands, so the plate can't be repainted in the texture; instead a thin plate mesh
// is mounted 1 cm proud of each original, found by tools/_plate analysis (bright plate-coloured
// faces at the front and rear bumpers). Positions are in the model's original (pre-fix) frame and
// each plate node carries the same turn + scale as the body (tools/fix-vehicle-facing.mjs).
// Run after fix-vehicle-facing. Idempotent.
//   node tools/add-plates.mjs [kit.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const file = process.argv[2] ?? 'public/models/real_vehicles2_kit.glb';
const doc = await io.read(file);
const root = doc.getRoot();
if (root.listNodes().some((n) => n.getName().startsWith('rv_graffiti_plate'))) {
  console.log('[plates] already added');
  process.exit(0);
}
const body = root.listNodes().find((n) => n.getName() === 'rv_graffiti_body_L0');
if (!body?.getExtras()?.fixedFacing) throw new Error('run tools/fix-vehicle-facing.mjs first');
// the same turn and scale as the body (tools/fix-vehicle-facing.mjs): plate positions are in the
// ORIGINAL model's units and frame
const fix = new THREE.Matrix4().makeRotationY(-Math.PI / 2).multiply(new THREE.Matrix4().makeScale(0.467, 0.467, 0.467));

const buffer = root.listBuffers()[0];
const PLATE_W = 0.52 / 0.467; // Kenyan plate 520 x 114 mm, in the original model's units
const PLATE_H = 0.114 / 0.467;
// detected plate centres (original model units; front faces +X, rear -X)
const PLATES = [
  { name: 'front', x: 5.44 + 0.022, y: 1.36, z: -0.105, nx: 1, tex: 'blender/plates/plate_front.png' },
  { name: 'rear', x: -5.27 - 0.022, y: 2.07, z: 0.03, nx: -1, tex: 'blender/plates/plate_rear.png' },
];

function plateMesh(p) {
  const tex = doc.createTexture(`plate_${p.name}`).setImage(readFileSync(p.tex)).setMimeType('image/png');
  const mat = doc.createMaterial(`rv_graffiti_plate_${p.name}`).setBaseColorTexture(tex).setRoughnessFactor(0.45).setMetallicFactor(0.1);
  // quad in the YZ plane facing +X or -X; u runs left-to-right as seen from outside
  const hw = PLATE_W / 2;
  const hh = PLATE_H / 2;
  const s = p.nx; // facing
  const pos = new Float32Array([p.x, p.y - hh, p.z + hw * s, p.x, p.y - hh, p.z - hw * s, p.x, p.y + hh, p.z - hw * s, p.x, p.y + hh, p.z + hw * s]);
  const nrm = new Float32Array([s, 0, 0, s, 0, 0, s, 0, 0, s, 0, 0]);
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
  return doc.createMesh(`rv_graffiti_plate_${p.name}`).addPrimitive(prim);
}

const t = new THREE.Vector3();
const r = new THREE.Quaternion();
const sc = new THREE.Vector3();
fix.decompose(t, r, sc);
let added = 0;
for (const p of PLATES) {
  const mesh = plateMesh(p);
  for (const lod of [0, 1]) {
    const parent = root.listNodes().find((n) => n.getName() === `rv_graffiti_LOD${lod}`);
    if (!parent) continue;
    const node = doc
      .createNode(`rv_graffiti_plate_${p.name}_L${lod}`)
      .setMesh(mesh)
      .setTranslation(t.toArray())
      .setRotation(r.toArray())
      .setScale(sc.toArray())
      .setExtras({ fixedFacing: true });
    parent.addChild(node);
    added++;
  }
}
await io.write(file, doc);
console.log(`[plates] added ${added} plate nodes (front white, rear yellow: KMK 254M)`);
