#!/usr/bin/env node
// Find far LODs that were never reduced and simplify them. Each <piece>_LOD1 / _LOD2 primitive is
// compared with the LOD0 primitive of the same material; if it is still heavier than the budget
// (LOD1 40 %, LOD2 12 % of LOD0) it is simplified with meshoptimizer (a mesh shared with LOD0 is
// cloned first so LOD0 keeps its detail). Found by profiling: the acacia's bark was 3,770 verts
// at every LOD, 800k triangles for the distant trees alone.
//   node tools/fix-lods.mjs public/models/real_trees_kit.glb [more.glb ...] [--dry]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantizePrimitive, meshopt, prune, simplifyPrimitive, weldPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const BUDGET = { 1: 0.4, 2: 0.12 };
const tris = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;

for (const file of files) {
  const doc = await io.read(file);
  const nodes = doc.getRoot().listNodes();
  // LOD0 triangles per piece + material (the LOD nodes are empties with mesh children, or meshes)
  const meshesUnder = (n) => {
    const out = [];
    n.traverse((c) => c.getMesh() && out.push(c));
    return out;
  };
  const byName = new Map(nodes.map((n) => [n.getName(), n]));
  let fixed = 0;
  for (const n of nodes) {
    const m = /^(.*)_LOD([12])$/.exec(n.getName());
    if (!m) continue;
    const lod0 = byName.get(`${m[1]}_LOD0`);
    if (!lod0) continue;
    const ref = new Map();
    for (const c of meshesUnder(lod0)) for (const p of c.getMesh().listPrimitives()) {
      const k = p.getMaterial()?.getName() ?? '';
      ref.set(k, (ref.get(k) ?? 0) + tris(p));
    }
    const lod0Meshes = new Set(meshesUnder(lod0).map((c) => c.getMesh()));
    for (const c of meshesUnder(n)) {
      let mesh = c.getMesh();
      for (let i = 0; i < mesh.listPrimitives().length; i++) {
        const p = mesh.listPrimitives()[i];
        const k = p.getMaterial()?.getName() ?? '';
        const full = ref.get(k);
        if (!full) continue;
        const have = tris(p);
        const want = full * BUDGET[m[2]];
        if (have <= want * 1.15 || have - want < 1500) continue; // only real waste (thousands of triangles)
        console.log(`[lods] ${file.split('/').pop()} ${n.getName()} ${k}: ${have} tris (LOD0 ${full}) -> ~${Math.round(want)}`);
        if (dry) continue;
        if (lod0Meshes.has(mesh)) {
          // shared with LOD0: give this LOD its own copy
          mesh = mesh.clone();
          c.setMesh(mesh);
        }
        let q = mesh.listPrimitives()[i];
        if (q === p || [...lod0Meshes].some((lm) => lm.listPrimitives().includes(q))) {
          const cp = q.clone();
          for (const s of q.listSemantics()) cp.setAttribute(s, q.getAttribute(s).clone());
          if (q.getIndices()) cp.setIndices(q.getIndices().clone());
          mesh.removePrimitive(q);
          mesh.addPrimitive(cp);
          q = cp;
        }
        dequantizePrimitive(q, { pattern: /.*/ });
        weldPrimitive(q, {});
        simplifyPrimitive(q, { simplifier: MeshoptSimplifier, ratio: Math.max(0.01, want / tris(q)), error: m[2] === '2' ? 0.2 : 0.05, lockBorder: false });
        console.log(`        -> ${tris(q)} tris`);
        fixed++;
      }
    }
  }
  if (!dry && fixed) {
    await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(file, doc);
    console.log(`[lods] ${file}: ${fixed} primitives simplified`);
  } else console.log(`[lods] ${file}: ${fixed ? fixed + ' would be simplified' : 'all LODs within budget'}`);
}
