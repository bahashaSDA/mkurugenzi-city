// Assemble rendered shots into the finished marketing videos (4K H.264, 30 fps):
// a title card, crossfaded shots, an end card. Two files each: <name>.mp4 (silent master, for
// adding licensed music) and <name>_ambience.mp4 (the game's city ambience, preview only: those
// recordings are "used with the owner's permission", see ASSETS.md, confirm before release).
//   node tools/film/assemble.mjs <shotDir> <outDir> [only]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
const [SRC, OUT, ONLY] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const FONT_DIR = new URL('../../blender/fonts/', import.meta.url);
const AMB = (n) => new URL(`../../public/audio/amb/${n}.webm`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const W = 3840, H = 2160, XF = 0.7;
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit', cwd: FONT_DIR });
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30'];

/** A title card: big Bebas title, smaller line under it, fading in and out on black. */
function card(title, sub, secs, out) {
  const fade = `alpha='if(lt(t,0.5),t/0.5,if(gt(t,${secs - 0.5}),(${secs}-t)/0.5,1))'`;
  const vf = [
    `drawtext=fontfile=BebasNeue-Regular.ttf:text='${title}':fontsize=300:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-90:${fade}`,
    sub ? `drawtext=fontfile=BebasNeue-Regular.ttf:text='${sub}':fontsize=110:fontcolor=0xFFC629:x=(w-text_w)/2:y=(h/2)+150:${fade}` : null,
  ].filter(Boolean).join(',');
  ff(['-f', 'lavfi', '-i', `color=c=0x0E0E10:s=${W}x${H}:r=30:d=${secs}`, '-vf', vf, ...ENC, out]);
  return out;
}

/** Join clips with crossfades. clips: [{ file, start?, dur? }] */
function join(clips, out) {
  const args = [];
  const lens = [];
  for (const c of clips) {
    const d = c.dur ?? dur(c.file) - (c.start ?? 0);
    lens.push(d);
    args.push('-ss', String(c.start ?? 0), '-t', String(d), '-i', c.file);
  }
  let filt = clips.map((_, i) => `[${i}:v]settb=AVTB,fps=30,format=yuv420p,scale=${W}:${H}[s${i}]`).join(';');
  let last = 's0';
  let t = lens[0];
  for (let i = 1; i < clips.length; i++) {
    const o = i === clips.length - 1 ? 'vout' : `x${i}`;
    filt += `;[${last}][s${i}]xfade=transition=fade:duration=${XF}:offset=${(t - XF).toFixed(3)}[${o}]`;
    last = o;
    t += lens[i] - XF;
  }
  if (clips.length === 1) filt += `;[s0]null[vout]`;
  ff([...args, '-filter_complex', filt, '-map', '[vout]', ...ENC, '-movflags', '+faststart', out]);
  return t;
}

function withAmbience(video, amb, out, total) {
  ff(['-i', video, '-stream_loop', '-1', '-i', AMB(amb), '-filter_complex', `[1:a]volume=0.9,afade=t=in:d=1.5,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out]);
}

const shot = (v, n, start, d) => ({ file: `${SRC}/${v}_${n}.mp4`, start, dur: d });
const VIDEOS = {
  '01_City_by_Day': { title: 'MKURUGENZI CITY', sub: 'KARIBU MTAANI', amb: 'city_day', shots: [1, 2, 3, 4, 6, 7, 8, 9].map((n) => shot('v1', n)), end: ['EXPLORE EVERY MTAA', 'MKURUGENZI CITY'] },
  '02_City_by_Night': { title: 'AFTER DARK', sub: 'THE CITY NEVER SLEEPS', amb: 'city_night', shots: [1, 2, 3, 4, 5, 6].map((n) => shot('v2', n)), end: ['MKURUGENZI CITY', 'DAY AND NIGHT'] },
  '03_Behind_the_Wheel': { title: 'BEHIND THE WHEEL', sub: 'CARS AND BODA BODAS', amb: 'city_day_b', shots: [1, 2, 3, 4, 5, 6].map((n) => shot('v3', n)), end: ['TAKE THE WHEEL', 'MKURUGENZI CITY'] },
  '04_Ride_the_Matatu': { title: 'RIDE THE MATATU', sub: 'STAGE TO STAGE', amb: 'market', shots: [1, 2, 3, 4].map((n) => shot('v4', n)), end: ['PANDA MAT', 'MKURUGENZI CITY'] },
  '05_Kibera': { title: 'KIBERA', sub: 'WATCH YOUR POCKETS', amb: 'city_day', shots: [1, 2, 3, 4, 5].map((n) => shot('v5', n)), end: ['SURVIVE THE STREETS', 'MKURUGENZI CITY'] },
  '06_The_Coast': { title: 'THE COAST', sub: 'SUN, SAND AND SEA', amb: 'sea_diani', shots: [1, 2, 3, 4, 6].map((n) => shot('v6', n)), end: ['DIVE IN', 'MKURUGENZI CITY'] },
  '07_Gameplay': { title: 'GAMEPLAY', sub: 'MISSIONS AND MORE', amb: 'city_day', shots: [1, 2, 3].map((n) => shot('v7', n)), end: ['MKURUGENZI CITY', 'PLAY FREE IN YOUR BROWSER'] },
};

const tmp = `${OUT}/_parts`;
mkdirSync(tmp, { recursive: true });
for (const [name, v] of Object.entries(VIDEOS)) {
  if (ONLY && !name.includes(ONLY)) continue;
  const shots = v.shots.filter((s) => existsSync(s.file));
  if (!shots.length) continue;
  console.log(name, shots.length, 'shots');
  const a = card(v.title, v.sub, 3.2, `${tmp}/${name}_a.mp4`);
  const z = card(v.end[0], v.end[1], 3.6, `${tmp}/${name}_z.mp4`);
  const total = join([{ file: a }, ...shots, { file: z }], `${OUT}/${name}.mp4`);
  withAmbience(`${OUT}/${name}.mp4`, v.amb, `${OUT}/${name}_ambience.mp4`, total);
}

// ---- the launch trailer: the best moments, quick cuts, title beats ----
if (!ONLY || 'Trailer'.includes(ONLY)) {
  const c = (t, s, d, n) => ({ file: card(t, s, d, `${tmp}/tr_${n}.mp4`) });
  const pick = [
    c('MKURUGENZI CITY', '', 2.6, 'a'),
    shot('v1', 1, 1, 4), shot('v1', 2, 1, 4), shot('v1', 3, 1, 3.5),
    c('ONE CITY', 'EVERY MTAA', 2.2, 'b'),
    shot('v1', 4, 0.5, 3.5), shot('v4', 2, 0.5, 4.5), shot('v4', 4, 1, 3.5),
    c('TAKE THE WHEEL', '', 2.0, 'c'),
    shot('v3', 2, 2, 4), shot('v3', 4, 0.5, 3.5), shot('v3', 5, 1.5, 4),
    c('SURVIVE KIBERA', '', 2.0, 'd'),
    shot('v5', 1, 0.5, 3), shot('v5', 3, 3, 7), shot('v5', 4, 0, 3.5),
    c('THE COAST', '', 2.0, 'e'),
    shot('v6', 2, 2, 4), shot('v6', 3, 0.5, 3.5), shot('v6', 4, 0.5, 3),
    c('AFTER DARK', '', 2.0, 'f'),
    shot('v2', 1, 1, 4), shot('v2', 3, 1, 4), shot('v2', 5, 0.5, 3.5), shot('v1', 9, 0.5, 5),
    c('MKURUGENZI CITY', 'PLAY FREE IN YOUR BROWSER', 4.5, 'z'),
  ].filter((s) => existsSync(s.file));
  const total = join(pick, `${OUT}/00_Launch_Trailer.mp4`);
  withAmbience(`${OUT}/00_Launch_Trailer.mp4`, 'city_day', `${OUT}/00_Launch_Trailer_ambience.mp4`, total);
}
console.log('assembled into', OUT);
