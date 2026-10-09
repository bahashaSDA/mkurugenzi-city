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
import { dedup, prune, weld, instance, meshopt, textureCompress, resample, simplify } from '@gltf-transform/functions';
import { toktx, Mode } from '@gltf-transform/cli';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

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
  if (name.startsWith('npc_fan_')) return { bytes: 0.65 * MB, tex: 1024 }; // merch prints (botanical) compress less
  if (name.startsWith('npc_')) return { bytes: 0.6 * MB, tex: 1024 };
  // real Sketchfab vehicles stream in after the splash (own Suspense boundary), shared by every vehicle
  if (name.startsWith('real_')) return { bytes: 6 * MB, tex: 1024 };
  return { bytes: 4 * MB, tex: 1024 }; // district chunks and kits
};

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

let files = [];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
try {
  files = (await readdir(inDir)).filter((f) => f.endsWith('.glb') && (!ONLY || ONLY.test(f)));
} catch {
  console.log(`[optimize] no input dir ${inDir}; nothing to do`);
  process.exit(0);
}
await mkdir(outDir, { recursive: true });

// Characters: the face/skin is what players look at, so only the skin keeps the hero size;
// clothes and hair drop to 1024 and normal maps to 512 (VISUAL_OVERHAUL 33: detail per MB).
function textureSteps(name, budget) {
  const isChar = name.startsWith('abel') || name.startsWith('npc_');
  if (!isChar) {
    return [
      textureCompress({ slots: /^(normalTexture|metallicRoughnessTexture)$/, resize: [budget.tex / 2, budget.tex / 2] }),
      textureCompress({ slots: /^(?!normalTexture|metallicRoughnessTexture).*$/, resize: [budget.tex, budget.tex] }),
    ];
  }
  if (name.startsWith('npc_')) {
    // Pedestrians are seen from a few metres away: 512 colour, 256 normals.
    return [
      textureCompress({ slots: /^(normalTexture|metallicRoughnessTexture)$/, resize: [256, 256] }),
      textureCompress({ slots: /^(?!normalTexture|metallicRoughnessTexture).*$/, resize: [512, 512] }),
      textureCompress({ slots: /^baseColorTexture$/, pattern: /eye|brow/i, resize: [256, 256] }), // a few pixels on screen
    ];
  }
  return [
    textureCompress({ slots: /^(normalTexture|metallicRoughnessTexture)$/, resize: [512, 512] }),
    textureCompress({ slots: /^baseColorTexture$/, pattern: /skin/i, resize: [budget.tex, budget.tex] }),
    textureCompress({ slots: /^baseColorTexture$/, pattern: /^(?!.*skin).*$/i, resize: [1024, 1024] }),
    textureCompress({ slots: /^baseColorTexture$/, pattern: /eye|lash|brow/i, resize: [512, 512] }), // a few cm across
  ];
}

/** Baked skeletal clips key T/R/S for every bone, but bones only rotate (except the pelvis/root,
 * which also translates). Dropping static scale/translation channels cuts clip data ~2/3. */
function stripStaticChannels() {
  return (doc) => {
    for (const anim of doc.getRoot().listAnimations()) {
      for (const ch of anim.listChannels()) {
        const path = ch.getTargetPath();
        const node = ch.getTargetNode()?.getName() ?? '';
        if (path === 'scale' || (path === 'translation' && !/^(pelvis|Root)$/i.test(node))) {
          const sampler = ch.getSampler();
          ch.dispose();
          sampler?.dispose();
        }
      }
    }
  };
}

/** Pedestrians: no normal maps (little visible gain on a ~5k-tri crowd character). */
function dropNormalMaps() {
  return (doc) => {
    for (const m of doc.getRoot().listMaterials()) m.setNormalTexture(null);
  };
}

let failed = 0;
for (const f of files) {
  const budget = budgetFor(f);
  const doc = await io.read(path.join(inDir, f));
  const isChar = f.startsWith('abel') || f.startsWith('npc_');
  await doc.transform(
    ...(isChar ? [stripStaticChannels()] : []),
    ...(f.startsWith('npc_') ? [dropNormalMaps()] : []),
    dedup(),
    prune(),
    weld(),
    instance({ min: 3 }),
    // Pedestrians: seam-preserving simplification (meshoptimizer) to crowd budget (~25%)
    ...(f.startsWith('npc_') ? [simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.004 })] : []),
    resample(), // drop redundant animation keys (baked clips are sampled every frame)
    // Normal maps at half resolution: UASTC is ~1 byte/px, and SPEC 5.1 texel density for
    // background assets (256 px/m on 2 m tiles) is 512 px. Roughness/metal are low-frequency
    // too. Colour stays sharper at full size.
    ...textureSteps(f, budget),
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
