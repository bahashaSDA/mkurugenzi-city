#!/usr/bin/env node
// Collider audit (SPEC 9): every render mesh in a district GLB needs a matching COL_<name>,
// unless its node extras say { "no_collider": true }. Exits non-zero on any miss.
//   node tools/collider-audit.mjs [dir=public/models]
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const dir = process.argv[2] ?? 'public/models';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const baseName = (n) => n.replace(/_LOD[0-2]$/, '');
// Dynamic / character assets are exempt: they get colliders from code (capsules, rigid bodies).
const EXEMPT_FILE = /^(abel|npc_|vehicle_)/;

let files = [];
try {
  files = (await readdir(dir)).filter((f) => f.endsWith('.glb') && !EXEMPT_FILE.test(f));
} catch {
  console.log(`[audit] no dir ${dir}`);
  process.exit(0);
}

let missing = 0;
for (const f of files) {
  const doc = await io.read(path.join(dir, f));
  const nodes = doc.getRoot().listNodes();
  const colliders = new Set(nodes.filter((n) => n.getName().startsWith('COL_')).map((n) => n.getName().slice(4).replace(/__\d+$/, '')));
  const need = new Set();
  for (const n of nodes) {
    const name = n.getName();
    if (!n.getMesh() || name.startsWith('COL_')) continue;
    if (n.getExtras()?.no_collider) continue;
    need.add(baseName(name));
  }
  const miss = [...need].filter((b) => !colliders.has(b));
  missing += miss.length;
  console.log(`[audit] ${f}: ${need.size} objects, ${miss.length ? 'MISSING ' + miss.join(', ') : 'all have colliders'}`);
}

if (missing) {
  console.error(`[audit] FAIL: ${missing} mesh(es) without colliders`);
  process.exit(1);
}
console.log('[audit] PASS');
