#!/usr/bin/env node
// Web optimisation pipeline (SPEC 5.3).
//   node tools/optimize-assets.mjs [inDir=public/models/raw] [outDir=public/models]
// dedup → prune → weld → instance → (simplify off: LODs come from Blender) → meshopt,
// textures resized (2048 hero / 1024 other) and converted to KTX2 when the `toktx`
// binary (KTX-Software) is on PATH. Fails if any output exceeds its budget.
import { readdir, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, instance, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const inDir = process.argv[2] ?? 'public/models/raw';
const outDir = process.argv[3] ?? 'public/models';

const MB = 1024 * 1024;
// Budgets by filename prefix (SPEC 5.3).
const budgetFor = (name) => {
  if (name.startsWith('abel')) return { bytes: 2.5 * MB, tex: 2048 };
  if (name.startsWith('npc_')) return { bytes: 0.6 * MB, tex: 1024 };
  return { bytes: 4 * MB, tex: 1024 }; // district chunks
};

function hasToktx() {
  try {
    execFileSync('toktx', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

let files = [];
try {
  files = (await readdir(inDir)).filter((f) => f.endsWith('.glb'));
} catch {
  console.log(`[optimize] no input dir ${inDir}; nothing to do`);
  process.exit(0);
}
await mkdir(outDir, { recursive: true });
const ktx = hasToktx();
if (!ktx) console.warn('[optimize] WARNING: toktx not found, textures stay PNG/JPEG (resized). Install KTX-Software for KTX2.');

let failed = 0;
for (const f of files) {
  const budget = budgetFor(f);
  const doc = await io.read(path.join(inDir, f));
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    instance({ min: 3 }),
    textureCompress({ resize: [budget.tex, budget.tex] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const outPath = path.join(outDir, f);
  await io.write(outPath, doc);
  if (ktx) {
    // ETC1S for colour/roughness, UASTC for normal maps (gltf-transform CLI handles slot detection).
    execFileSync('npx', ['gltf-transform', 'etc1s', outPath, outPath, '--slots', '{baseColorTexture,metallicRoughnessTexture,emissiveTexture}'], { stdio: 'inherit', shell: true });
    execFileSync('npx', ['gltf-transform', 'uastc', outPath, outPath, '--slots', 'normalTexture'], { stdio: 'inherit', shell: true });
  }
  const size = (await stat(outPath)).size;
  const ok = size <= budget.bytes;
  if (!ok) failed++;
  console.log(`[optimize] ${ok ? 'OK  ' : 'FAIL'} ${f}: ${(size / MB).toFixed(2)} MB (budget ${(budget.bytes / MB).toFixed(1)} MB)`);
}

if (failed) {
  console.error(`[optimize] ${failed} file(s) over budget`);
  process.exit(1);
}
