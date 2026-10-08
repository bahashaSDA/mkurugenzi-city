#!/usr/bin/env node
// Downloads the CC0 PBR source textures used by the Blender kit scripts into blender/textures/.
// All from ambientCG (CC0 1.0). Logged in ASSETS.md. Sources only: the game ships the
// Blender-baked, optimised GLBs, never these raw files.
//   node tools/fetch-textures.mjs
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const TEXTURES = {
  CorrugatedSteel005: 'mabati, weathered galvanised (all roofs; rust is added as vertex colour)',
  CorrugatedSteel006A: 'mabati walls, green paint with rust',
  CorrugatedSteel007A: 'mabati walls, blue paint',
  Plaster007: 'old broken plaster over mud walls',
  PaintedPlaster017: 'painted plaster (shops, block flats)',
  Concrete040: 'rough brown concrete (plinths, block walls)',
  Planks021: 'raw rough timber (doors, shutters, benches)',
  Ground048: 'brown soil, tinted to red murram',
  Metal021: 'old leaking rusty metal (grilles, tanks)',
  Ground109: 'dry beige-brown dirt: base murram (runtime ground)',
  Ground102: 'compressed dry dirt: worn paths (runtime ground)',
  Asphalt031: 'light grey asphalt: sun-bleached Nairobi tarmac (runtime road)',
};

const RES = process.env.TEX_RES ?? '1K';
const root = path.resolve('blender/textures');
await mkdir(root, { recursive: true });

for (const id of Object.keys(TEXTURES)) {
  const dir = path.join(root, id);
  try {
    if ((await readdir(dir)).some((f) => f.endsWith('.jpg'))) {
      console.log(`[tex] ${id} cached`);
      continue;
    }
  } catch {}
  await mkdir(dir, { recursive: true });
  const url = `https://ambientcg.com/get?file=${id}_${RES}-JPG.zip`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const zip = path.join(dir, 'src.zip');
  await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  // Python's zipfile is the most portable unzip (GNU tar can't read zips; Git Bash tar mangles C:\).
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zip, dir]);
  await rm(zip);
  console.log(`[tex] ${id} downloaded`);
}
