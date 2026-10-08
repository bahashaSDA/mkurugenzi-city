#!/usr/bin/env node
// Web optimisation pipeline (SPEC 5.3).
//   node tools/optimize-assets.mjs [inDir=public/models/raw] [outDir=public/models]
// dedup → prune → weld → instance → resize textures (2048 hero / 1024 other) →
// KTX2 (ETC1S for colour/roughness/metalness, UASTC for normal maps) → meshopt.
// Needs KTX-Software (`toktx`) on PATH or in its default install folder.
// Fails if any output exceeds its budget.
import { readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, instance, meshopt, textureCompress } from '@gltf-transform/functions';
import { toktx, Mode } from '@gltf-transform/cli';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const inDir = process.argv[2] ?? 'public/models/raw';
const outDir = process.argv[3] ?? 'public/models';

// Default KTX-Software install locations, so a fresh shell without PATH changes still works.
for (const dir of ['C:\\Program Files\\KTX-Software\\bin', '/usr/local/bin', '/opt/homebrew/bin']) {
  if (existsSync(dir) && !process.env.PATH.includes(dir)) process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
}

const MB = 1024 * 1024;
// Budgets by filename prefix (SPEC 5.3).
const budgetFor = (name) => {
  if (name.startsWith('abel')) return { bytes: 2.5 * MB, tex: 2048 };
  if (name.startsWith('npc_')) return { bytes: 0.6 * MB, tex: 1024 };
  return { bytes: 4 * MB, tex: 1024 }; // district chunks and kits
};

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

let failed = 0;
for (const f of files) {
  const budget = budgetFor(f);
  const doc = await io.read(path.join(inDir, f));
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    instance({ min: 3 }),
    // Normal maps at half resolution: UASTC is ~1 byte/px, and SPEC 5.1 texel density for
    // background assets (256 px/m on 2 m tiles) is 512 px. Roughness/metal are low-frequency
    // too. Colour stays sharper at full size.
    textureCompress({ slots: /^(normalTexture|metallicRoughnessTexture)$/, resize: [budget.tex / 2, budget.tex / 2] }),
    textureCompress({ slots: /^(?!normalTexture|metallicRoughnessTexture).*$/, resize: [budget.tex, budget.tex] }),
    toktx({ mode: Mode.UASTC, slots: /^normalTexture$/, level: 2, rdo: 4, zstd: 22 }),
    toktx({ mode: Mode.ETC1S, slots: /^(?!normalTexture).*$/, quality: 160 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const outPath = path.join(outDir, f);
  await io.write(outPath, doc);
  const size = (await stat(outPath)).size;
  const ok = size <= budget.bytes;
  if (!ok) failed++;
  console.log(`[optimize] ${ok ? 'OK  ' : 'FAIL'} ${f}: ${(size / MB).toFixed(2)} MB (budget ${(budget.bytes / MB).toFixed(1)} MB)`);
}

if (failed) {
  console.error(`[optimize] ${failed} file(s) over budget`);
  process.exit(1);
}
