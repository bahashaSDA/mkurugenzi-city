#!/usr/bin/env node
// Merges per-piece GLBs (blender/cache/real/*.glb from build_real_kit.py) into one kit GLB with a
// single scene, so useKit() sees every <piece>_LOD0/1/2 node.
//   node tools/merge-kit.mjs <out.glb> <prefix[,prefix...]> [dir=blender/cache/real]
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, dedup, prune } from '@gltf-transform/functions';

const [out, prefix = 'rv_', dir = 'blender/cache/real'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const prefixes = prefix.split(','); // several prefixes: rv_hiace,rv_ma3,...
const files = readdirSync(dir).filter((f) => prefixes.some((p) => f.startsWith(p)) && f.endsWith('.glb')).sort();
if (!files.length) throw new Error(`no ${prefix}*.glb in ${dir}`);
const doc = await io.read(path.join(dir, files[0]));
const root = doc.getRoot();
const scene = root.listScenes()[0];
for (const f of files.slice(1)) {
  const map = mergeDocuments(doc, await io.read(path.join(dir, f)));
  for (const s of root.listScenes()) {
    if (s === scene) continue;
    for (const n of s.listChildren()) scene.addChild(n);
    s.dispose();
  }
  void map;
}
root.setDefaultScene(scene);

// Variants (<base>_<n>_...) differ only in material: point their primitives at variant 0's
// vertex data so the geometry ships once (dedup/prune then drop the copies).
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
let shared = 0;
for (const n of root.listNodes()) {
  const m = /^(.+?)_(\d+)(_.*)$/.exec(n.getName());
  if (!m || m[2] === '0' || !n.getMesh()) continue;
  const src = byName.get(`${m[1]}_0${m[3]}`)?.getMesh();
  const dst = n.getMesh();
  if (!src) continue;
  const a = src.listPrimitives();
  const b = dst.listPrimitives();
  if (a.length !== b.length) continue;
  b.forEach((pb, i) => {
    const pa = a[i];
    if (pa.getAttribute('POSITION')?.getCount() !== pb.getAttribute('POSITION')?.getCount()) return;
    for (const sem of pa.listSemantics()) pb.setAttribute(sem, pa.getAttribute(sem));
    pb.setIndices(pa.getIndices());
    shared++;
  });
}
console.log(`[merge] ${shared} variant primitives share variant-0 geometry`);
await doc.transform(unpartition(), dedup(), prune());
await io.write(out, doc);
console.log(`[merge] ${files.length} pieces -> ${out}`);
