#!/usr/bin/env node
// Builds standalone KTX2 textures used directly by runtime materials (ground, road), from the
// CC0 sources fetched by tools/fetch-textures.mjs. Colour: ETC1S sRGB 1024. Normal: UASTC
// linear 512 (+zstd). Roughness: ETC1S linear 512. All with mipmaps.
//   node tools/build-runtime-textures.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

for (const dir of ['C:\\Program Files\\KTX-Software\\bin', '/usr/local/bin', '/opt/homebrew/bin']) {
  if (existsSync(dir) && !process.env.PATH.includes(dir)) process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
}

const SRC = 'blender/textures';
const OUT = 'public/textures';
mkdirSync(OUT, { recursive: true });

// runtime name -> ambientCG source id
const SETS = { murram: 'Ground109', murram_path: 'Ground102', asphalt: 'Asphalt031', rock: 'Rock030', sand: 'Ground054',
  th_stone: 'Tiles143', th_concrete: 'Concrete046', th_carpet: 'Carpet015', th_fabric: 'Fabric016', th_wood: 'Wood051', th_terrazzo: 'Terrazzo005', th_stage: 'WoodFloor064', paving: 'PavingStones070' };

const MAPS = [
  // [suffix in source, output map, args]
  ['Color', 'color', ['--encode', 'etc1s', '--qlevel', '160', '--assign_oetf', 'srgb', '--resize', '1024x1024']],
  ['NormalGL', 'normal', ['--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '19', '--assign_oetf', 'linear', '--resize', '512x512']],
  ['Roughness', 'rough', ['--encode', 'etc1s', '--qlevel', '128', '--assign_oetf', 'linear', '--resize', '512x512']],
];

let total = 0;
const ONLY = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const [name, id] of Object.entries(SETS)) {
  if (ONLY && !ONLY.test(name)) continue;
  for (const [suffix, map, args] of MAPS) {
    const src = path.join(SRC, id, `${id}_1K-JPG_${suffix}.jpg`);
    if (!existsSync(src)) throw new Error(`missing ${src}: run node tools/fetch-textures.mjs`);
    const out = path.join(OUT, `${name}_${map}.ktx2`);
    execFileSync('toktx', ['--t2', '--genmipmap', ...args, out, src], { stdio: 'inherit' });
    const kb = statSync(out).size / 1024;
    total += kb;
    console.log(`[tex] ${out} ${kb.toFixed(0)} KB`);
  }
}
console.log(`[tex] total ${(total / 1024).toFixed(2)} MB`);
