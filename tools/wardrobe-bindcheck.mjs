#!/usr/bin/env node
// Wardrobe rig check (session 12). Wardrobe meshes (blender/scripts/build_wardrobe.py) are driven by
// ABEL'S bones but keep their OWN inverse bind matrices (the optimiser folds each file's position
// dequantisation into them). That is only right if both files have the same rest pose, so check:
//   1. every wardrobe GLB has Abel's 53 joints, with the same rest local rotation/translation and
//      world position (shipped, optimised files)
//   2. the suit jacket rebuilt with --probe sits exactly where the shipped one does (RAW files, in
//      metres: the optimised ones store positions quantised)
//   node tools/wardrobe-bindcheck.mjs
import { readdirSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
let ok = true;
const rest = async (f) => { const d = await io.read(f); const m = new Map(); for (const j of d.getRoot().listSkins()[0].listJoints()) m.set(j.getName(), { r: j.getRotation(), t: j.getTranslation(), w: j.getWorldMatrix() }); return m; };
const abel = await rest('public/models/abel.glb');
for (const f of readdirSync('public/models/wardrobe').filter((x) => x.endsWith('.glb'))) {
  const b = await rest(`public/models/wardrobe/${f}`);
  let rot = 0, tr = 0, missing = 0;
  for (const [n, x] of abel) {
    const y = b.get(n);
    if (!y) { missing++; continue; }
    const dot = Math.abs(x.r[0] * y.r[0] + x.r[1] * y.r[1] + x.r[2] * y.r[2] + x.r[3] * y.r[3]);
    rot = Math.max(rot, (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI);
    tr = Math.max(tr, Math.hypot(x.w[12] - y.w[12], x.w[13] - y.w[13], x.w[14] - y.w[14]));
  }
  const pass = !missing && rot < 0.5 && tr < 0.002;
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${f.padEnd(28)} joints ${b.size}, missing ${missing}, rest rotation diff ${rot.toFixed(3)} deg, joint position diff ${(tr * 1000).toFixed(2)} mm`);
}
async function box(file, match) {
  const doc = await io.read(file);
  const node = doc.getRoot().listNodes().find((n) => n.getMesh() && match.test(n.getName()));
  const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const b = new THREE.Box3(); const v = new THREE.Vector3(); const el = [];
  for (const p of node.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, el); b.expandByPoint(v.set(el[0], el[1], el[2]).applyMatrix4(m)); } }
  return b;
}
const a = await box('public/models/raw/abel.glb', /male_elegantsuit01/);
const p = await box('public/models/raw/wardrobe/wd_probe.glb', /wd_probe_suit/);
const off = Math.max(a.min.distanceTo(p.min), a.max.distanceTo(p.max));
const pass = off < 0.005;
ok &&= pass;
console.log(`${pass ? 'PASS' : 'FAIL'} probe jacket vs shipped jacket (raw, metres): box corners within ${(off * 1000).toFixed(2)} mm`);
process.exit(ok ? 0 : 1);
