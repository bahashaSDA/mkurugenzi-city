// Contact sheet of preview shots: one row per shot (first, middle, last frame).
//   node tools/film/sheet.mjs <dir> <prefix> <out.jpg>
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [dir, prefix, out] = process.argv.slice(2);
const shots = readdirSync(dir).filter((d) => d.startsWith(prefix + '_') && !d.includes('.')).sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()));
const inputs = [];
for (const s of shots) {
  const fr = readdirSync(`${dir}/${s}`).filter((f) => f.endsWith('.jpg')).sort();
  for (const f of [fr[0], fr[Math.floor(fr.length / 2)], fr[fr.length - 1]]) inputs.push(`${dir}/${s}/${f}`);
}
const args = ['-y', '-loglevel', 'error'];
for (const i of inputs) args.push('-i', i);
const n = inputs.length;
const filt = inputs.map((_, i) => `[${i}:v]scale=480:270,drawtext=fontfile=BebasNeue-Regular.ttf:text='${Math.floor(i / 3) + 1}':x=8:y=8:fontsize=28:fontcolor=yellow[v${i}]`).join(';') +
  ';' + inputs.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${n}:layout=` + inputs.map((_, i) => `${(i % 3) * 480}_${Math.floor(i / 3) * 270}`).join('|') + '[o]';
args.push('-filter_complex', filt, '-map', '[o]', '-frames:v', '1', out);
execFileSync('ffmpeg', args, { stdio: 'inherit', cwd: new URL('../../blender/fonts/', import.meta.url) });
console.log(shots.length, 'shots');
