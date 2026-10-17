#!/usr/bin/env node
// Split the real wheel meshes out of the baked vehicle kits so they can spin, steer and follow the
// suspension at runtime (the Sketchfab bodies were joined into one mesh by build_real_kit.py).
//   node tools/split-wheels.mjs [kit.glb ...]   (default: both real vehicle kits, edited in place)
//
// For every rv_*_LOD0 / _LOD1 piece:
//   1. weld + connected components of the body mesh (each tyre, rim, hub is one or more islands)
//   2. tyres = islands that touch the ground and are about as long as they are tall
//   3. tyres cluster into wheels by side and axle (dual rear tyres become one wheel)
//   4. every island inside a wheel's bounding cylinder (rim, spokes, hub, disc) joins it
//   5. the wheel triangles move into a new node `<piece>_wheel_<i>_L<lod>`, origin at the axle,
//      extras { wheel: i, radius, front }; the body keeps the rest
// Wheel order is stable between LODs: front first, then left (+X) before right.
// Idempotent: pieces that already have wheel nodes are skipped. LOD2 (far) stays one mesh.
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

const files = process.argv.slice(2).length ? process.argv.slice(2) : ['public/models/real_vehicles_kit.glb', 'public/models/real_vehicles2_kit.glb'];

function islands(P, ia, n) {
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const key = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(P[i * 3] * 500)},${Math.round(P[i * 3 + 1] * 500)},${Math.round(P[i * 3 + 2] * 500)}`;
    const j = key.get(k);
    if (j === undefined) key.set(k, i);
    else parent[find(i)] = find(j);
  }
  for (let t = 0; t < ia.length; t += 3) {
    const a = find(ia[t]);
    parent[find(ia[t + 1])] = a;
    parent[find(ia[t + 2])] = a;
  }
  const comps = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let c = comps.get(r);
    if (!c) comps.set(r, (c = { root: r, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }));
    for (let k = 0; k < 3; k++) {
      c.min[k] = Math.min(c.min[k], P[i * 3 + k]);
      c.max[k] = Math.max(c.max[k], P[i * 3 + k]);
    }
  }
  return { comps: [...comps.values()], find };
}

function detectWheels(comps, ground) {
  const tyres = comps.filter((c) => {
    const h = c.max[1] - c.min[1];
    const l = c.max[2] - c.min[2];
    return c.min[1] < ground + 0.06 && h > 0.25 && h < 1.3 && l > 0.6 * h && l < 1.25 * h + 0.05;
  });
  // cluster by side and axle
  const wheels = [];
  for (const t of tyres) {
    const cz = (t.min[2] + t.max[2]) / 2;
    const cx = (t.min[0] + t.max[0]) / 2;
    let w = wheels.find((w) => Math.abs(w.cz - cz) < 0.35 && Math.sign(w.cx || 1e-6) === Math.sign(cx || 1e-6) && Math.abs(w.cx - cx) < 0.6);
    if (!w) wheels.push((w = { cx, cz, min: [...t.min], max: [...t.max] }));
    for (let k = 0; k < 3; k++) {
      w.min[k] = Math.min(w.min[k], t.min[k]);
      w.max[k] = Math.max(w.max[k], t.max[k]);
    }
    w.cx = (w.min[0] + w.max[0]) / 2;
    w.cz = (w.min[2] + w.max[2]) / 2;
  }
  for (const w of wheels) {
    w.r = Math.max(w.max[1] - ground, w.max[2] - w.min[2]) / 2;
    w.cy = ground + w.r;
  }
  // a real wheel set: 2 (motorbike) or 4+ wheels, every one a sensible size
  const ok = wheels.filter((w) => w.r > 0.15 && w.r < 0.65);
  if (!(ok.length === 2 || ok.length === 4 || ok.length === 6)) return [];
  // sanity: wheels pair up left/right (or sit on the centre line for a motorbike), one radius per axle
  for (const w of ok) {
    if (ok.length === 2 ? Math.abs(w.cx) > 0.2 : !ok.some((o) => o !== w && Math.abs(o.cx + w.cx) < 0.25 && Math.abs(o.cz - w.cz) < 0.2)) return [];
    if (ok.some((o) => Math.abs(o.cz - w.cz) < 0.3 && Math.abs(o.r - w.r) > 0.06)) return [];
  }
  return ok;
}

for (const file of files) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  let split = 0;
  const cache = new Map(); // shared source accessors + same triangles -> same wheel accessors
  /** One wheel primitive: compacted vertices, positions int16-normalised around the axle (node scale q). */
  function wheelPrim(w, tris, wh) {
    const pos = w.prim.getAttribute('POSITION');
    const key = `${pos.getName()}|${root.listAccessors().indexOf(pos)}|${tris.length}|${tris.slice(0, 30).join(',')}|${wh.cx.toFixed(3)},${wh.cz.toFixed(3)}`;
    let hit = cache.get(key);
    if (!hit) {
      const remap = new Map();
      const order = [];
      const idx = tris.map((v) => {
        let j = remap.get(v);
        if (j === undefined) {
          remap.set(v, (j = order.length));
          order.push(v);
        }
        return j;
      });
      let q = 0;
      for (const v of order) {
        q = Math.max(q, Math.abs(w.P[v * 3] - wh.cx), Math.abs(w.P[v * 3 + 1] - wh.cy), Math.abs(w.P[v * 3 + 2] - wh.cz));
      }
      q = q * 1.0001 || 1;
      const attrs = {};
      for (const sem of w.prim.listSemantics()) {
        const src = w.prim.getAttribute(sem);
        const size = src.getElementSize();
        let acc;
        if (sem === 'POSITION') {
          const out = new Int16Array(order.length * 3);
          order.forEach((v, j) => {
            out[j * 3] = Math.round(((w.P[v * 3] - wh.cx) / q) * 32767);
            out[j * 3 + 1] = Math.round(((w.P[v * 3 + 1] - wh.cy) / q) * 32767);
            out[j * 3 + 2] = Math.round(((w.P[v * 3 + 2] - wh.cz) / q) * 32767);
          });
          acc = doc.createAccessor().setType('VEC3').setArray(out).setNormalized(true);
        } else if (w.R && (sem === 'NORMAL' || sem === 'TANGENT')) {
          // a turned body: the wheel's directions turn with it (float, renormalised)
          const out = new Float32Array(order.length * size);
          const e = new Array(size).fill(0);
          const d = new THREE.Vector3();
          order.forEach((vi, j) => {
            src.getElement(vi, e);
            d.set(e[0], e[1], e[2]).applyMatrix3(w.R).normalize();
            out[j * size] = d.x;
            out[j * size + 1] = d.y;
            out[j * size + 2] = d.z;
            if (size === 4) out[j * size + 3] = e[3];
          });
          acc = doc.createAccessor().setType(src.getType()).setArray(out);
        } else {
          // raw copy keeps the source quantisation (bodies are uniformly scaled, so normals hold)
          const raw = src.getArray();
          const out = new raw.constructor(order.length * size);
          order.forEach((v, j) => {
            for (let k = 0; k < size; k++) out[j * size + k] = raw[v * size + k];
          });
          acc = doc.createAccessor().setType(src.getType()).setArray(out).setNormalized(src.getNormalized());
        }
        attrs[sem] = acc.setBuffer(buffer);
      }
      const Arr = order.length > 65535 ? Uint32Array : Uint16Array;
      hit = { attrs, indices: doc.createAccessor().setType('SCALAR').setArray(new Arr(idx)).setBuffer(buffer), q };
      cache.set(key, hit);
    }
    const prim = doc.createPrimitive().setMaterial(w.prim.getMaterial()).setMode(w.prim.getMode()).setIndices(hit.indices);
    for (const [sem, acc] of Object.entries(hit.attrs)) prim.setAttribute(sem, acc);
    return { prim, scale: hit.q };
  }
  for (const lodNode of root.listNodes()) {
    const m = /^(rv_.+)_LOD([01])$/.exec(lodNode.getName());
    if (!m) continue;
    const [, piece, lod] = m;
    if (lodNode.listChildren().some((c) => c.getName().includes('_wheel_'))) continue;
    // all vertices of the piece (to find the ground) and the body primitives
    const bodies = lodNode.listChildren().filter((c) => c.getMesh() && c.getName().includes('_body_'));
    let ground = 1e9;
    const work = [];
    for (const node of bodies) {
      // the node's full transform (tools/fix-vehicle-facing.mjs turns some bodies)
      const M = new THREE.Matrix4().fromArray(node.getMatrix());
      const R = new THREE.Matrix3().getNormalMatrix(M);
      const rotated = Math.abs(node.getRotation()[3]) < 0.99999;
      const v = new THREE.Vector3();
      for (const prim of node.getMesh().listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const n = pos.getCount();
        const P = new Float32Array(n * 3);
        const p = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          pos.getElement(i, p);
          v.set(p[0], p[1], p[2]).applyMatrix4(M);
          P[i * 3] = v.x;
          P[i * 3 + 1] = v.y;
          P[i * 3 + 2] = v.z;
          ground = Math.min(ground, v.y);
        }
        work.push({ node, prim, P, n, R: rotated ? R : null });
      }
    }
    let wheels = null;
    const perPrim = [];
    for (const w of work) {
      const ia = w.prim.getIndices().getArray();
      const { comps, find } = islands(w.P, ia, w.n);
      const found = detectWheels(comps, ground);
      perPrim.push({ ...w, ia, comps, find });
      if (found.length && !wheels) wheels = found;
    }
    if (!wheels) {
      console.log(`[wheels] ${piece} L${lod}: no wheels found, left as is`);
      continue;
    }
    // stable order: front axle first, then +X before -X
    wheels.sort((a, b) => b.cz - a.cz || b.cx - a.cx);
    const front = Math.max(...wheels.map((w) => w.cz));
    const wheelTris = wheels.map(() => []); // per wheel: { prim, tris[] }
    for (const w of perPrim) {
      const owner = new Map(); // island root -> wheel index
      for (const c of w.comps) {
        wheels.forEach((wh, i) => {
          const r = wh.r + 0.04;
          const inside =
            c.min[1] > ground - 0.03 && c.max[1] < wh.cy + r && c.min[2] > wh.cz - r && c.max[2] < wh.cz + r &&
            c.min[0] > wh.min[0] - 0.16 && c.max[0] < wh.max[0] + 0.16;
          if (inside && !owner.has(c.root)) owner.set(c.root, i);
        });
      }
      if (!owner.size) continue;
      const keep = [];
      const taken = wheels.map(() => []);
      for (let t = 0; t < w.ia.length; t += 3) {
        const o = owner.get(w.find(w.ia[t]));
        if (o === undefined) keep.push(w.ia[t], w.ia[t + 1], w.ia[t + 2]);
        else taken[o].push(w.ia[t], w.ia[t + 1], w.ia[t + 2]);
      }
      const Arr = w.n > 65535 ? Uint32Array : Uint16Array;
      // colour variants share accessors (dedup): never edit one in place
      const src = w.prim.getIndices();
      const ckey = `idx|${root.listAccessors().indexOf(src)}|${keep.length}`;
      let cl = cache.get(ckey);
      if (!cl) cache.set(ckey, (cl = src.clone().setArray(new Arr(keep))));
      w.prim.setIndices(cl);
      taken.forEach((tris, i) => tris.length && wheelTris[i].push({ w, tris }));
    }
    wheels.forEach((wh, i) => {
      const parts = wheelTris[i];
      if (!parts.length) return;
      const mesh = doc.createMesh(`${piece}_wheel_${i}_L${lod}`);
      let q = 0;
      for (const { w, tris } of parts) {
        const { prim, scale } = wheelPrim(w, tris, wh);
        q = scale;
        mesh.addPrimitive(prim);
      }
      const node = doc
        .createNode(`${piece}_wheel_${i}_L${lod}`)
        .setMesh(mesh)
        .setTranslation([wh.cx, wh.cy, wh.cz])
        .setScale([q, q, q])
        .setExtras({ wheel: i, radius: +wh.r.toFixed(3), front: Math.abs(wh.cz - front) < 0.3, center: [wh.cx, wh.cy, wh.cz].map((v) => +v.toFixed(4)) });
      lodNode.addChild(node);
    });
    split++;
    console.log(`[wheels] ${piece} L${lod}: ${wheels.length} wheels, r=${wheels.map((w) => w.r.toFixed(2)).join('/')} axles z=${[...new Set(wheels.map((w) => w.cz.toFixed(2)))].join(',')}`);
  }
  // same compression as tools/optimize-assets.mjs (the new accessors are plain until encoded)
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(file, doc);
  console.log(`[wheels] ${file}: ${split} LODs split`);
}
