import { WORLD_HALF } from '../config/world';

// The satellite map (GTA V's aerial view): the city photographed from straight above by
// tools/render-map.mjs and stitched by tools/stitch-map.py into public/map/sat. One 2048 px overview
// of the whole world, and 8 x 8 detail tiles of 1024 px (500 m each) that load only when the map is
// zoomed in on them. Nothing is fetched until the map is first opened.

const BASE = `${import.meta.env.BASE_URL}map/sat/`;
const DETAIL = 8;
const TILE = (WORLD_HALF * 2) / DETAIL;

type Img = { img: HTMLImageElement; ready: boolean; failed: boolean };
const cache = new Map<string, Img>();

function get(name: string): Img {
  let e = cache.get(name);
  if (!e) {
    const img = new Image();
    img.decoding = 'async';
    e = { img, ready: false, failed: false };
    const entry = e;
    img.onload = () => {
      // decode off the main thread before the first draw, so panning onto a new tile never hitches
      (img.decode ? img.decode() : Promise.resolve()).then(
        () => (entry.ready = true),
        () => (entry.ready = true),
      );
    };
    img.onerror = () => (entry.failed = true);
    img.src = BASE + name;
    cache.set(name, e);
  }
  return e;
}

/** True once the overview has loaded (false if the map was never rendered: draw the vector map). */
export function satReady(): boolean {
  return get('overview.webp').ready;
}
export function satAvailable(): boolean {
  return !get('overview.webp').failed;
}

/**
 * Draw the aerial photo under the map. `xf` is MapUI's world->screen transform
 * (screen = c + R(rot) * scale * (world - p)); `view` is the visible world rectangle.
 */
export function drawSat(
  g: CanvasRenderingContext2D,
  xf: { cx: number; cy: number; scale: number; rot: number; px: number; pz: number },
  view: { x0: number; z0: number; x1: number; z1: number },
): boolean {
  const ov = get('overview.webp');
  if (!ov.ready) return false;
  g.save();
  g.translate(xf.cx, xf.cy);
  g.rotate(xf.rot);
  g.scale(xf.scale, xf.scale);
  g.translate(-xf.px, -xf.pz);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(ov.img, -WORLD_HALF, -WORLD_HALF, WORLD_HALF * 2, WORLD_HALF * 2);
  // zoomed in past the overview's resolution (~0.5 px per metre): sharper tiles where visible
  if (xf.scale > 0.6) {
    const i0 = Math.max(0, Math.floor((view.x0 + WORLD_HALF) / TILE));
    const i1 = Math.min(DETAIL - 1, Math.floor((view.x1 + WORLD_HALF) / TILE));
    const j0 = Math.max(0, Math.floor((view.z0 + WORLD_HALF) / TILE));
    const j1 = Math.min(DETAIL - 1, Math.floor((view.z1 + WORLD_HALF) / TILE));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const t = get(`${i}_${j}.webp`);
        if (t.ready) g.drawImage(t.img, -WORLD_HALF + i * TILE, -WORLD_HALF + j * TILE, TILE, TILE);
      }
  }
  g.restore();
  return true;
}

/** Start fetching the overview (call when the map opens). */
export function preloadSat() {
  get('overview.webp');
}
