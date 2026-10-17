#!/usr/bin/env node
// Give the scanned graffiti matatu (rv_graffiti, a Hiace-type van) real, spinning wheels.
// Its scan has no usable wheels: the bottoms of the tyres are loose fragments and the tops are
// fused into the arches, so tools/split-wheels.mjs can't cut them out. Instead:
//   1. the scan's tyre fragments (islands inside each wheel's cylinder) are cut out of the body
//   2. the clean wheels of the Toyota Hiace model (same van class, already split) are mounted at the
//      graffiti van's measured axles, scaled to its tyre size, with the same wheel extras the game
//      reads (index, radius, front, centre), on LOD0 and LOD1
// Run after fix-vehicle-facing and split-wheels. Idempotent.
//   node tools/transplant-wheels.mjs [kit.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const file = process.argv[2] ?? 'public/models/real_vehicles2_kit.glb';
const doc = await io.read(file);
const root = doc.getRoot();
const byName = (n) => root.listNodes().find((x) => x.getName() === n);
if (byName('rv_graffiti_wheel_0_L0')) {
  console.log('[transplant] already done');
  process.exit(0);
}

// the graffiti van's axles, measured from its tyre fragments in the corrected frame (front +Z):
// rear tyres z -1.79..-1.04, front 1.03..1.71, outer faces at |x| 0.72..1.00, tyre radius ~0.31 m
const R = 0.31;
const AXLES = [
  { x: 0.86, z: 1.37, front: true },
  { x: -0.86, z: 1.37, front: true },
  { x: 0.86, z: -1.42, front: false },
  { x: -0.86, z: -1.42, front: false },
];

for (const lod of [0, 1]) {
  const lodNode = byName(`rv_graffiti_LOD${lod}`);
  if (!lodNode) continue;
  // 1. cut the scan's tyre fragments out of the body
  for (const node of lodNode.listChildren().filter((c) => c.getName().includes('_body_'))) {
    const M = new THREE.Matrix4().fromArray(node.getMatrix());
    const v = new THREE.Vector3();
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const n = pos.getCount();
      const P = new Float32Array(n * 3);
      const p = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, p);
        v.set(p[0], p[1], p[2]).applyMatrix4(M);
        P.set([v.x, v.y, v.z], i * 3);
      }
      const ia = prim.getIndices().getArray();
      const keep = [];
      let cut = 0;
      for (let t = 0; t < ia.length; t += 3) {
        // a triangle goes if all three corners are inside a wheel's cylinder (tyre, not the arch)
        const inWheel = AXLES.some((a) =>
          [0, 1, 2].every((k) => {
            const j = ia[t + k] * 3;
            const dy = P[j + 1] - R;
            const dz = P[j + 2] - a.z;
            return Math.hypot(dy, dz) < R * 1.08 && Math.abs(P[j] - a.x) < 0.2;
          }),
        );
        if (inWheel) cut++;
        else keep.push(ia[t], ia[t + 1], ia[t + 2]);
      }
      const Arr = n > 65535 ? Uint32Array : Uint16Array;
      prim.setIndices(prim.getIndices().clone().setArray(new Arr(keep)));
      console.log(`[transplant] ${node.getName()}: cut ${cut} tyre triangles`);
    }
  }
  // 2. mount the Hiace's wheels (same corner: front-left = its wheel 0, ...)
  const donor = byName(`rv_hiace_0_LOD${lod}`) ?? byName('rv_hiace_0_LOD0');
  const wheels = donor.listChildren().filter((c) => /_wheel_\d_L/.test(c.getName()));
  for (let i = 0; i < AXLES.length; i++) {
    const a = AXLES[i];
    // the donor wheel on the same corner (sign of x, front/back)
    const src = wheels.find((w) => {
      const e = w.getExtras();
      return e.front === a.front && Math.sign(e.center[0]) === Math.sign(a.x);
    });
    if (!src) continue;
    const e = src.getExtras();
    const k = R / e.radius;
    const s = src.getScale();
    // the donor node: translation = its axle centre, scale = its quantisation; keep the mesh centred
    const node = doc
      .createNode(`rv_graffiti_wheel_${i}_L${lod}`)
      .setMesh(src.getMesh())
      .setTranslation([a.x, R, a.z])
      .setScale([s[0] * k, s[1] * k, s[2] * k])
      .setExtras({ wheel: i, radius: R, front: a.front, center: [a.x, R, a.z], fixedFacing: true, donor: src.getName() });
    lodNode.addChild(node);
  }
}
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(file, doc);
console.log('[transplant] graffiti matatu: 4 Hiace wheels on LOD0 + LOD1');
