import * as THREE from 'three';

// Phase 0 procedural textures (no external assets). Replaced by KTX2 PBR sets from
// Poly Haven / ambientCG in Phase 1 (logged as placeholders in PROGRESS.md).

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function finish(c: HTMLCanvasElement, repeat: number, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let murram: THREE.Texture | null = null;
export function murramTexture(): THREE.Texture {
  if (murram) return murram;
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#9C4A2A';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 4000; i++) {
    const v = r();
    ctx.fillStyle = v < 0.5 ? `rgba(110,52,32,${r() * 0.35})` : `rgba(184,112,63,${r() * 0.35})`;
    const s = 1 + r() * 4;
    ctx.fillRect(r() * 256, r() * 256, s, s);
  }
  // pebbles
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(200,180,160,${0.3 + r() * 0.3})`;
    ctx.beginPath();
    ctx.arc(r() * 256, r() * 256, 0.6 + r() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  murram = finish(c, 1);
  return murram;
}

let tarmac: THREE.Texture | null = null;
export function tarmacTexture(): THREE.Texture {
  if (tarmac) return tarmac;
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#3A3A3C';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 6000; i++) {
    const g = 40 + r() * 50;
    ctx.fillStyle = `rgba(${g},${g},${g + 2},0.5)`;
    ctx.fillRect(r() * 256, r() * 256, 1, 1);
  }
  // red murram dust creeping in from the edges
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(156,74,42,0.45)');
  grad.addColorStop(0.12, 'rgba(156,74,42,0)');
  grad.addColorStop(0.88, 'rgba(156,74,42,0)');
  grad.addColorStop(1, 'rgba(156,74,42,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  // faded centre dashes
  ctx.fillStyle = 'rgba(230,225,210,0.55)';
  ctx.fillRect(126, 20, 4, 90);
  ctx.fillRect(126, 148, 4, 90);
  tarmac = finish(c, 1);
  return tarmac;
}

let mabati: { map: THREE.Texture; normal: THREE.Texture } | null = null;
/** Corrugated iron sheet, aged, with rust streaks. Corrugations run along V. */
export function mabatiTextures() {
  if (mabati) return mabati;
  const size = 256;
  const { c, ctx } = canvas(size);
  const n = canvas(size);
  const r = rng(3);
  const ribs = 16;
  for (let x = 0; x < size; x++) {
    const phase = Math.sin((x / size) * ribs * Math.PI * 2);
    const shade = 120 + phase * 18;
    ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 8})`;
    ctx.fillRect(x, 0, 1, size);
    // normal map: slope of the sine
    const slope = Math.cos((x / size) * ribs * Math.PI * 2);
    const nx = Math.round(128 + slope * 90);
    n.ctx.fillStyle = `rgb(${nx},128,255)`;
    n.ctx.fillRect(x, 0, 1, size);
  }
  // rust streaks from the lower edge and nail lines
  for (let i = 0; i < 40; i++) {
    const x = r() * size;
    const h = 30 + r() * 120;
    const g = ctx.createLinearGradient(0, size, 0, size - h);
    g.addColorStop(0, `rgba(138,75,35,${0.5 + r() * 0.4})`);
    g.addColorStop(1, 'rgba(138,75,35,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, size - h, 3 + r() * 12, h);
  }
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(94,46,20,${r() * 0.5})`;
    ctx.fillRect(r() * size, r() * size, 2 + r() * 5, 2 + r() * 5);
  }
  mabati = { map: finish(c, 1), normal: finish(n.c, 1, false) };
  return mabati;
}

let kerb: THREE.Texture | null = null;
/** Black-and-white painted kerb stripes (about 1 m per band). */
export function kerbTexture(): THREE.Texture {
  if (kerb) return kerb;
  const { c, ctx } = canvas(64);
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = 'rgba(156,74,42,0.35)';
  ctx.fillRect(0, 48, 64, 16);
  kerb = finish(c, 1);
  kerb.magFilter = THREE.NearestFilter;
  return kerb;
}
