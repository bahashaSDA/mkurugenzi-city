// Downloads the curated free Sketchfab models (tools/sketchfab-models.json) into sketchfab/.
//
//   SKETCHFAB_TOKEN=xxxx node tools/sketchfab-fetch.mjs        (or put SKETCHFAB_TOKEN=xxxx in .env.local)
//
// Your token: sketchfab.com -> Settings -> Password & API -> "API token". Downloads need a (free)
// account; searching does not. Every model's licence is re-checked against the API before
// download: only CC-BY and CC0 are fetched (owner-supplied files already in sketchfab/ are skipped).
// Credits are appended to sketchfab/CREDITS.md (copy them into ASSETS.md).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = path.resolve('.');
const outDir = path.join(root, 'sketchfab');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools/sketchfab-models.json'), 'utf8'));

function token() {
  if (process.env.SKETCHFAB_TOKEN) return process.env.SKETCHFAB_TOKEN.trim();
  for (const f of ['.env.local', '.env']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const m = /^SKETCHFAB_TOKEN\s*=\s*(.+)$/m.exec(fs.readFileSync(p, 'utf8'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const OK = /(CC Attribution$|CC0|Public Domain)/i;
const only = process.argv.slice(2);

async function main() {
  const tok = token();
  if (!tok) {
    console.error('No SKETCHFAB_TOKEN. Get it at https://sketchfab.com/settings/password and put SKETCHFAB_TOKEN=... in .env.local');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const credits = [];
  for (const m of manifest.models) {
    if (only.length && !only.includes(m.file)) continue;
    const dest = path.join(outDir, `${m.file}.glb`);
    if (fs.existsSync(dest)) {
      console.log(`skip ${m.file} (already here)`);
      continue;
    }
    const info = await (await fetch(`https://api.sketchfab.com/v3/models/${m.uid}`)).json();
    const lic = info.license?.label ?? '?';
    if (!OK.test(lic) || /NonCommercial|NoDeriv/i.test(lic)) {
      console.log(`REFUSED ${m.file}: licence "${lic}" is not CC-BY/CC0`);
      continue;
    }
    const res = await fetch(`https://api.sketchfab.com/v3/models/${m.uid}/download`, { headers: { Authorization: `Token ${tok}` } });
    if (!res.ok) {
      console.log(`FAILED ${m.file}: HTTP ${res.status} ${res.status === 401 ? '(bad token)' : ''}`);
      continue;
    }
    const dl = await res.json();
    if (dl.glb?.url) {
      fs.writeFileSync(dest, Buffer.from(await (await fetch(dl.glb.url)).arrayBuffer()));
    } else if (dl.gltf?.url) {
      // zipped glTF: unpack in a fresh temp dir, then pack to one .glb with gltf-transform
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-'));
      const zip = path.join(tmp, 'model.zip');
      fs.writeFileSync(zip, Buffer.from(await (await fetch(dl.gltf.url)).arrayBuffer()));
      execFileSync('tar', ['-xf', zip, '-C', tmp]);
      const gltf = fs.readdirSync(tmp, { recursive: true }).map(String).find((f) => f.endsWith('.gltf'));
      if (!gltf) {
        console.log(`FAILED ${m.file}: no .gltf in archive`);
        continue;
      }
      execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['gltf-transform', 'copy', path.join(tmp, gltf), dest], { stdio: 'ignore', shell: process.platform === 'win32' });
      fs.rmSync(tmp, { recursive: true, force: true });
    } else {
      console.log(`FAILED ${m.file}: no glTF download offered`);
      continue;
    }
    const mb = (fs.statSync(dest).size / 1e6).toFixed(1);
    console.log(`ok   ${m.file} (${mb} MB, ${lic}, ${info.user?.displayName ?? info.user?.username})`);
    credits.push(`- **${info.name}** by ${info.user?.displayName ?? info.user?.username} (https://sketchfab.com/${info.user?.username}), ${lic}, ${info.viewerUrl}. Used as: ${m.role}.`);
  }
  if (credits.length) fs.appendFileSync(path.join(outDir, 'CREDITS.md'), credits.join('\n') + '\n');
  console.log('\nNext: blender -b -P blender/scripts/build_real_kit.py   (bakes and decimates them into game kits)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
