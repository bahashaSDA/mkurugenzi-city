import { stations } from '../game/stations';
import { useEffect, useRef, useState } from 'react';
import { ROADS, TOWNS, TURNAROUNDS, type Road } from '../config/roads';
import { AREAS } from '../config/areas';
import { KIBERA, RIDGE, FIRE_HILL } from '../world/heights';
import { MARKET, getHubLayout } from '../districts/hub/layout';
import { LANDMARKS } from '../districts/towns/layout';
import { ROUTES } from '../systems/vehicles/routes';
import { playerPosition, playerView } from '../systems/player/playerState';
import { bike, drive } from '../systems/driving/state';
import { occ } from '../systems/vehicles/occupancy';
import { availableMissions, currentStep, MISSIONS, timeLeft, useMissions, type MissionDef } from '../game/missions';
import { useCutscene } from '../game/cutscene';
import { inputLock, input, onKeyPress } from '../systems/input';
import { drawSat, preloadSat, satAvailable } from './satMap';
import { WORLD_HALF } from '../config/world';
import { shoreX } from '../config/coast';
import { THEATRE } from '../game/places';
import { HOSPITALS } from '../game/health';
import { missionScratch } from '../game/missionData';
import { combatants } from '../systems/combat/combat';
import { findRoute, useNav, type NavTarget, type RouteResult } from '../game/navigation';
import { CHAPTER_CATEGORY, drawIcon, MARK, missionIcon, type IconKind } from './icons';

// GTA-style navigation: a rotating radar (bottom-left) and a full-screen map (M), drawn from the
// same vector data as the 3D world (config/roads, districts, stages, shops, missions) and the same
// GPS route (game/navigation). Roads are cased and coloured by class, junctions join cleanly
// (round joins), streets are named, and markers follow one colour + shape system (ui/icons MARK).

// ------------------------------------------------------------------ data
const ROAD_NAMES: Record<string, string> = {
  avenue: 'Mkurugenzi Avenue', expressway: 'Mkurugenzi Expressway', 'kibera-road': 'Kibera Road', 'stage-road': 'Stage Road',
  'north-street': 'North Street', 'east-road': 'East Road', 'ridge-track': 'Ridge Track', 'south-road': 'South Road',
  'kibera-main': 'Kibera Main Lane', 'kibera-rail': 'Railway Lane', 'kibera-cut': 'Mashamba Path', 'market-cut': 'Soko Path',
  'cbd-avenue': 'Tower Avenue', 'cbd-west': 'Kalamu Street', 'cbd-east': 'Sauti Street', 'arena-road': 'Arena Road', 'east-link': 'Studio Link',
  'east-st': 'Picha Street', 'east-st-2': 'Kamera Street', 'beach-road': 'Coast Road', 'arena-beach': 'Arena Beach Road',
  'estate-road': 'Utafraaaia Drive', 'sw-road': 'Mashinani Road', 'sw-st': 'Shule Road', 'sw-st-2': 'Darasa Street', 'hill-road': 'Hill Road',
  'fire-track': "Storyteller's Track",
};
const CBD_ST = ['Hadithi Street', 'Msanii Street', 'Jukwaa Street', 'Filamu Street', 'Tamthilia Street', 'Ubunifu Street'];
const ESTATE_ST = ['Mvule Close', 'Jacaranda Close', 'Mkuyu Close', 'Mwembe Close', 'Mninga Close'];
export function roadName(r: Road): string {
  const m = /^(cbd|estate)-st-(\d)$/.exec(r.id);
  if (m) return (m[1] === 'cbd' ? CBD_ST : ESTATE_ST)[Number(m[2])] ?? r.id;
  return ROAD_NAMES[r.id] ?? r.id;
}

type PoiKind = 'stage' | 'shop' | 'food' | 'hospital' | 'service' | 'theatre' | 'landmark';
interface Poi {
  kind: PoiKind;
  x: number;
  z: number;
  name: string;
  icon: IconKind;
  color: string;
}

const SHOP_NAMES: Record<string, [string, IconKind, PoiKind]> = {
  shop_hoteli: ['Chai Moto Hoteli', 'cup', 'food'],
  shop_butchery: ['Nyama Bora Butchery', 'cart', 'shop'],
  shop_boutique: ['Utafraaaia Boutique', 'cart', 'shop'],
  shop_barber: ['Barber', 'cart', 'shop'],
  shop_electronics: ['Electronics', 'cart', 'shop'],
  shop_hardware: ['Hardware', 'cart', 'shop'],
  shop_mshop: ['M-Shop', 'cart', 'shop'],
};

let poiCache: Poi[] | null = null;
function pois(): Poi[] {
  if (poiCache) return poiCache;
  const out: Poi[] = [];
  const seen = new Set<string>();
  for (const r of ROUTES)
    for (const s of r.stops) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      out.push({ kind: 'stage', x: s.x, z: s.z, name: `${s.name} stage`, icon: 'bus', color: '#f4b400' });
    }
  for (const p of getHubLayout()) {
    const def = SHOP_NAMES[p.piece];
    if (def) out.push({ kind: def[2], x: p.x, z: p.z, name: def[0], icon: def[1], color: def[2] === 'food' ? '#ff9b3d' : '#4fa3ff' });
  }
  out.push({ kind: 'food', x: MARKET[0] + 26, z: MARKET[1] + 26, name: 'Soko la Mkurugenzi', icon: 'cart', color: '#ff9b3d' });
  for (const h of HOSPITALS) out.push({ kind: 'hospital', x: h.x, z: h.z, name: h.name, icon: 'cross', color: '#ffffff' });
  for (const st of stations()) out.push({ kind: 'service', x: st.bay.x, z: st.bay.z, name: `${st.name}: fuel and garage`, icon: 'fuel', color: '#3fd17f' });
  out.push({ kind: 'theatre', x: THEATRE.x, z: THEATRE.z, name: 'Grand Theatre', icon: 'masks', color: '#d4a017' });
  for (const [name, p] of Object.entries(LANDMARKS)) out.push({ kind: 'landmark', x: p.x, z: p.z, name, icon: 'star', color: '#d4a017' });
  return (poiCache = out);
}

export interface Filters {
  missions: boolean;
  completed: boolean;
  stages: boolean;
  shops: boolean;
  services: boolean;
  landmarks: boolean;
}
const DEFAULT_FILTERS: Filters = { missions: true, completed: false, stages: true, shops: true, services: true, landmarks: true };

// ------------------------------------------------------------------ transform
type Xf = { cx: number; cy: number; scale: number; rot: number; px: number; pz: number };

function project(xf: Xf, x: number, z: number): [number, number] {
  const dx = (x - xf.px) * xf.scale;
  const dz = (z - xf.pz) * xf.scale;
  const c = Math.cos(xf.rot);
  const s = Math.sin(xf.rot);
  return [xf.cx + dx * c - dz * s, xf.cy + dx * s + dz * c];
}
function unproject(xf: Xf, sx: number, sy: number): { x: number; z: number } {
  const dx = sx - xf.cx;
  const dy = sy - xf.cy;
  const c = Math.cos(-xf.rot);
  const s = Math.sin(-xf.rot);
  return { x: xf.px + (dx * c - dy * s) / xf.scale, z: xf.pz + (dx * s + dy * c) / xf.scale };
}

// ------------------------------------------------------------------ base map
const PAL = {
  land: '#1d2226',
  country: '#212a24',
  town: '#2a3036',
  block: '#323941',
  kibera: '#3b3029',
  market: '#40372a',
  hill: '#283026',
  ridge: '#33342f',
  sand: '#6f6650',
  sea: '#17435a',
  seaDeep: '#123447',
  casing: '#0b0d10',
  highway: '#e8b54a',
  tarmac: '#cfd2d6',
  murram: '#a8744d',
};

function drawBase(g: CanvasRenderingContext2D, xf: Xf, full: boolean, sat = false, W = 0, H = 0) {
  // satellite view: the aerial photo of the city instead of the drawn land and roads
  if (sat) {
    g.fillStyle = '#0d2a3a';
    g.fillRect(0, 0, W, H);
    const a = unproject(xf, 0, 0);
    const b = unproject(xf, W, H);
    if (drawSat(g, xf, { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) })) {
      drawLabels(g, xf, full, true);
      return;
    }
  }
  const poly = (pts: [number, number][], fill: string) => {
    g.beginPath();
    pts.forEach(([x, z], i) => {
      const [sx, sy] = project(xf, x, z);
      if (i) g.lineTo(sx, sy);
      else g.moveTo(sx, sy);
    });
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const rect = (x0: number, z0: number, x1: number, z1: number, fill: string) => poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], fill);
  const circle = (x: number, z: number, r: number, fill: string) => {
    const [sx, sy] = project(xf, x, z);
    g.beginPath();
    g.arc(sx, sy, r * xf.scale, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };
  g.fillStyle = PAL.country;
  g.fillRect(-4000, -4000, 8000, 8000);
  // coast: sand, shallows, deep water
  const coast = (off: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let z = -2600; z <= 2600; z += 80) out.push([shoreX(z) + off, z]);
    return out;
  };
  poly([...coast(-140), [8000, 2600], [8000, -2600]], PAL.sand);
  poly([...coast(0), [8000, 2600], [8000, -2600]], PAL.sea);
  poly([...coast(160), [8000, 2600], [8000, -2600]], PAL.seaDeep);
  circle(FIRE_HILL.x, FIRE_HILL.z, FIRE_HILL.r, PAL.hill);
  circle(RIDGE.x, RIDGE.z, RIDGE.r, PAL.ridge);
  rect(KIBERA.x0, KIBERA.z0, KIBERA.x1, KIBERA.z1, PAL.kibera);
  for (const t of TOWNS) rect(t.x - t.rx, t.z - t.rz, t.x + t.rx, t.z + t.rz, PAL.town);
  rect(-30, -160, 40, 110, PAL.town); // the mtaa
  rect(MARKET[0], MARKET[1], MARKET[2], MARKET[3], PAL.market);
  // roads: casings first (so junctions merge), then fills, murram under tarmac under the expressway
  const stroke = (r: Road, w: number, color: string) => {
    g.beginPath();
    r.pts.forEach(([x, z], i) => {
      const [sx, sy] = project(xf, x, z);
      if (i) g.lineTo(sx, sy);
      else g.moveTo(sx, sy);
    });
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = color;
    g.lineWidth = w;
    g.stroke();
  };
  const width = (r: Road) => Math.max(r.kind === 'highway' ? 4 : r.kind === 'murram' ? 1.6 : 2.4, r.width * xf.scale);
  for (const kind of ['murram', 'tarmac', 'highway'] as const) for (const r of ROADS) if (r.kind === kind) stroke(r, width(r) + 2.4, PAL.casing);
  for (const kind of ['murram', 'tarmac', 'highway'] as const)
    for (const r of ROADS) if (r.kind === kind) stroke(r, width(r), kind === 'murram' ? PAL.murram : kind === 'highway' ? PAL.highway : PAL.tarmac);
  // roundabouts / turning circles
  for (const t of TURNAROUNDS) {
    circle(t.x, t.z, t.r + 1.2 / Math.max(xf.scale, 0.01), PAL.casing);
    circle(t.x, t.z, t.r, t.island ? PAL.highway : PAL.tarmac);
    if (t.island) circle(t.x, t.z, t.island, PAL.hill);
  }
  // expressway centre line (the median)
  if (xf.scale > 0.4)
    for (const r of ROADS) {
      if (r.kind !== 'highway') continue;
      g.setLineDash([]);
      stroke(r, Math.max(1, xf.scale * 1.2), '#8a6a24');
    }
  drawLabels(g, xf, full, false);
}

function drawLabels(g: CanvasRenderingContext2D, xf: Xf, full: boolean, sat: boolean) {
  if (!full) return;
  const halo = sat ? 4.5 : 3; // readable over the aerial photo
  const width = (r: Road) => Math.max(r.kind === 'highway' ? 4 : r.kind === 'murram' ? 1.6 : 2.4, r.width * xf.scale);
  // district names
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const a of AREAS) {
    if (a.r > 1000) continue;
    const [sx, sy] = project(xf, a.x, a.z);
    const big = a.r > 120;
    if (!big && xf.scale < 0.6) continue;
    g.font = `${big ? 700 : 600} ${big ? 13 : 11}px system-ui, sans-serif`;
    label(g, a.name.toUpperCase(), sx, sy, big ? '#e9e4d8' : '#c9c3b5', halo);
  }
  // street names along the longest segment, when zoomed in enough to read them
  if (xf.scale > 0.55) {
    g.font = '500 11px system-ui, sans-serif';
    for (const r of ROADS) {
      let best = 0;
      let bi = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const l = Math.hypot(r.pts[i + 1]![0] - r.pts[i]![0], r.pts[i + 1]![1] - r.pts[i]![1]);
        if (l > best) {
          best = l;
          bi = i;
        }
      }
      if (best * xf.scale < 120) continue;
      const [ax, az] = r.pts[bi]!;
      const [bx, bz] = r.pts[bi + 1]!;
      const [sx, sy] = project(xf, (ax + bx) / 2, (az + bz) / 2);
      const [ex, ey] = project(xf, bx, bz);
      let ang = Math.atan2(ey - sy, ex - sx);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      g.save();
      g.translate(sx, sy);
      g.rotate(ang);
      label(g, roadName(r), 0, -width(r) / 2 - 7, '#e6e2d6', halo);
      g.restore();
    }
  }
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, halo: number) {
  g.lineWidth = halo;
  g.strokeStyle = 'rgba(8,10,12,0.85)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

// ------------------------------------------------------------------ markers
export interface MapMarker {
  id: string;
  x: number;
  z: number;
  kind: 'available' | 'objective' | 'completed' | 'waypoint' | 'enemy' | 'poi';
  icon: IconKind;
  color: string;
  label: string;
  mission?: MissionDef;
  side?: boolean;
  poi?: Poi;
}

function markers(f: Filters, full: boolean): MapMarker[] {
  const out: MapMarker[] = [];
  const s = useMissions.getState();
  const nav = useNav.getState();
  for (const p of pois()) {
    const on = p.kind === 'stage' ? f.stages : p.kind === 'shop' || p.kind === 'food' ? f.shops : p.kind === 'hospital' || p.kind === 'service' ? f.services : f.landmarks;
    if (on) out.push({ id: `poi-${p.name}-${p.x}`, x: p.x, z: p.z, kind: 'poi', icon: p.icon, color: p.color, label: p.name, poi: p });
  }
  if (f.completed && full) {
    const done = new Set(s.completed);
    for (const m of MISSIONS) if (done.has(m.id)) out.push({ id: `done-${m.id}`, ...m.start(), kind: 'completed', icon: 'check', color: MARK.completed, label: m.title, mission: m, side: m.side });
  }
  if (s.active) {
    const cur = currentStep();
    const at = cur?.step.at?.();
    if (at && cur?.step.spawn?.kind !== 'chase')
      out.push({ id: 'objective', x: at.x, z: at.z, kind: 'objective', icon: missionIcon(cur!.mission.chapter, cur!.mission.title), color: MARK.active, label: cur!.mission.title, mission: cur!.mission });
    if (cur?.step.spawn?.kind === 'chase') out.push({ id: 'chase', ...missionScratch.chaseEnd, kind: 'enemy', icon: 'car', color: MARK.active, label: 'Target' });
    for (const c of combatants.values()) if (c.tag === 'mission' && c.state !== 'down') out.push({ id: `enemy-${c.id}`, x: c.x, z: c.z, kind: 'enemy', icon: 'fist', color: MARK.active, label: 'Opponent' });
  } else if (f.missions) {
    for (const m of availableMissions()) {
      const p = m.start();
      out.push({ id: `m-${m.id}`, x: p.x, z: p.z, kind: 'available', icon: missionIcon(m.chapter, m.title), color: MARK.available, label: m.title, mission: m, side: m.side });
    }
  }
  if (s.waypoint && nav.target?.kind !== 'mission') out.push({ id: 'waypoint', ...s.waypoint, kind: 'waypoint', icon: 'flag', color: MARK.waypoint, label: nav.target?.label ?? 'Waypoint' });
  return out;
}

/** One marker: shape by state (never colour alone), icon inside. */
function drawMarker(g: CanvasRenderingContext2D, m: MapMarker, sx: number, sy: number, size: number, t: number, selected = false) {
  g.save();
  g.translate(sx, sy);
  const r = size / 2;
  if (m.kind === 'objective') {
    // active objective: red diamond pin + pulsing ring
    const pulse = (t % 1400) / 1400;
    g.beginPath();
    g.arc(0, 0, r * (1.1 + pulse * 1.1), 0, Math.PI * 2);
    g.strokeStyle = `rgba(229,56,59,${0.7 * (1 - pulse)})`;
    g.lineWidth = 2;
    g.stroke();
    g.rotate(Math.PI / 4);
    g.fillStyle = MARK.active;
    g.strokeStyle = '#140405';
    g.lineWidth = 2;
    g.fillRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);
    g.strokeRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);
    g.rotate(-Math.PI / 4);
    drawIcon(g, m.icon, 0, 0, r * 1.05, '#fff');
  } else if (m.kind === 'available') {
    // available mission: green; main story = rounded square, side job = circle
    g.fillStyle = MARK.available;
    g.strokeStyle = '#06210f';
    g.lineWidth = 2;
    g.beginPath();
    if (m.side) g.arc(0, 0, r, 0, Math.PI * 2);
    else g.roundRect(-r, -r, r * 2, r * 2, r * 0.35);
    g.fill();
    g.stroke();
    drawIcon(g, m.icon, 0, 0, r * 1.15, '#fff');
  } else if (m.kind === 'completed') {
    g.globalAlpha = 0.6;
    g.fillStyle = MARK.availableDark;
    g.strokeStyle = MARK.completed;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    drawIcon(g, 'check', 0, 0, r * 0.9, MARK.completed);
  } else if (m.kind === 'waypoint') {
    g.fillStyle = MARK.waypoint;
    g.strokeStyle = '#1b0730';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, r * 0.85, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    drawIcon(g, 'flag', 0, 0, r * 0.95, '#fff');
  } else if (m.kind === 'enemy') {
    g.fillStyle = MARK.active;
    g.strokeStyle = '#140405';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    // points of interest: small dark disc, coloured icon
    g.fillStyle = 'rgba(14,16,20,0.88)';
    g.strokeStyle = m.color;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    drawIcon(g, m.icon, 0, 0, r * 0.82, m.color);
  }
  if (selected) {
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, r * 1.45, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

function drawRoute(g: CanvasRenderingContext2D, xf: Xf, route: RouteResult, color: string, from = 0, width = 5) {
  if (route.pts.length < 2) return;
  const path = () => {
    g.beginPath();
    let first = true;
    for (let i = Math.max(0, from); i < route.pts.length; i++) {
      const [x, z] = i === from && from > 0 ? [playerPosition.x, playerPosition.z] : route.pts[i]!;
      const [sx, sy] = project(xf, x, z);
      if (first) g.moveTo(sx, sy);
      else g.lineTo(sx, sy);
      first = false;
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  path();
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = width + 3;
  g.stroke();
  path();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}

function routeColor(t: NavTarget | null) {
  return t?.kind === 'objective' ? MARK.active : t?.kind === 'mission' ? MARK.available : MARK.waypoint;
}

/** The arrow for Abel (or his vehicle), pointing where he faces. */
function drawPlayer(g: CanvasRenderingContext2D, sx: number, sy: number, angle: number, size = 9) {
  g.save();
  g.translate(sx, sy);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, -size);
  g.lineTo(size * 0.68, size * 0.78);
  g.lineTo(0, size * 0.36);
  g.lineTo(-size * 0.68, size * 0.78);
  g.closePath();
  g.fillStyle = '#fff';
  g.strokeStyle = '#0b0d10';
  g.lineWidth = 2;
  g.fill();
  g.stroke();
  g.restore();
}

/** Heading of whatever Abel is in (vehicle yaw when seated), as a world angle with 0 = +Z. */
function playerHeading(): number {
  if (occ.phase !== 'walking' && occ.phase !== 'approaching') {
    const e = occ.frame.elements;
    return Math.atan2(e[8]!, e[10]!);
  }
  return playerView.facing;
}

/** Screen angle (canvas, 0 = up) for a world heading (0 = +Z, which is DOWN the map). */
const screenAngle = (h: number) => Math.atan2(Math.sin(h), -Math.cos(h));

function nearestArea(x: number, z: number): string {
  let best = 'Mkurugenzi City';
  let bd = Infinity;
  for (const a of AREAS) {
    const d = Math.hypot(a.x - x, a.z - z) - a.r;
    if (d < bd && a.r < 1000) {
      bd = d;
      best = a.name;
    }
  }
  return best;
}

// ------------------------------------------------------------------ navigation director
/** Keeps the GPS route up to date: target = the active objective, else the chosen destination. */
export function NavDirector() {
  useEffect(() => {
    const st = { key: '', lastCalc: 0 };
    const id = setInterval(() => {
      const ms = useMissions.getState();
      const nav = useNav.getState();
      let target: NavTarget | null = null;
      if (ms.active) {
        const cur = currentStep();
        const at = cur?.step.at?.();
        if (at && cur?.step.spawn?.kind !== 'chase') target = { x: at.x, z: at.z, kind: 'objective', label: cur!.mission.title };
      }
      if (!target && ms.waypoint) target = { x: ms.waypoint.x, z: ms.waypoint.z, kind: nav.target?.kind === 'mission' ? 'mission' : 'waypoint', label: nav.target?.label ?? 'Waypoint' };
      if (!target) {
        if (nav.route || nav.target) useNav.setState({ target: null, route: null, next: null, remaining: 0 });
        st.key = '';
        return;
      }
      const px = playerPosition.x;
      const pz = playerPosition.z;
      // arrived at a waypoint: clear it (objectives are cleared by the mission itself)
      if (target.kind !== 'objective' && Math.hypot(px - target.x, pz - target.z) < 18) {
        useMissions.getState().setWaypoint(null);
        useNav.setState({ target: null, route: null, next: null, remaining: 0 });
        return;
      }
      const key = `${target.kind}|${target.x.toFixed(0)},${target.z.toFixed(0)}`;
      let route = nav.route;
      // progress along the current route, and how far off it we are
      let along = 0;
      let off = Infinity;
      let seg = 0;
      if (route) {
        let acc = 0;
        for (let i = 0; i < route.pts.length - 1; i++) {
          const [ax, az] = route.pts[i]!;
          const [bx, bz] = route.pts[i + 1]!;
          const sx = bx - ax;
          const sz = bz - az;
          const l = Math.hypot(sx, sz) || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / (l * l)));
          const d = Math.hypot(px - (ax + sx * t), pz - (az + sz * t));
          if (d < off) {
            off = d;
            along = acc + t * l;
            seg = i;
          }
          acc += l;
        }
      }
      const now = performance.now();
      const stale = key !== st.key || !route || (off > 25 && now - st.lastCalc > 2000);
      if (stale) {
        const inVeh = drive.active || bike.active;
        const heading = drive.active ? drive.heading : bike.active ? bike.heading : undefined;
        const speed = drive.active ? Math.abs(drive.speed) : bike.active ? Math.abs(bike.speed) : 0;
        route = findRoute(px, pz, target.x, target.z, inVeh ? heading : undefined, speed > 3);
        st.key = key;
        st.lastCalc = now;
        along = 0;
        seg = 0;
      }
      if (!route) {
        useNav.setState({ target, route: null, next: null, remaining: Math.hypot(px - target.x, pz - target.z) });
        return;
      }
      const next = route.turns.find((tn) => tn.at > along + 3) ?? null;
      useNav.setState({
        target,
        route,
        next: next ? { turn: next, dist: next.at - along } : null,
        remaining: Math.max(0, route.length - along),
        computedAt: stale ? now : nav.computedAt,
      });
      navProgress.seg = seg;
    }, 400);
    return () => clearInterval(id);
  }, []);
  return null;
}
const navProgress = { seg: 0 };

// ------------------------------------------------------------------ radar
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 50) return; // ~20 fps is plenty for a radar
      last = t;
      const cv = ref.current;
      const g = cv?.getContext('2d');
      if (!cv || !g) return;
      const W = cv.width;
      const H = cv.height;
      const look = Math.atan2(playerView.lookX, -playerView.lookZ); // 0 = looking north
      const speed = drive.active ? Math.abs(drive.speed) : bike.active ? Math.abs(bike.speed) : 0;
      const inTransit = occ.phase === 'seated' && occ.ride?.kind === 'transit';
      const zoom = speed > 0.5 || inTransit ? 0.5 + 0.45 / (1 + speed / 12) : 1.1;
      const xf: Xf = { cx: W / 2, cy: H * 0.62, scale: zoom * (W / 240), rot: -look, px: playerPosition.x, pz: playerPosition.z };
      g.save();
      g.clearRect(0, 0, W, H);
      drawBase(g, xf, false);
      const nav = useNav.getState();
      if (nav.route) drawRoute(g, xf, nav.route, routeColor(nav.target), navProgress.seg + 1, 6);
      // POIs only when on the radar; missions/objective/waypoint clamp to the edge (GTA)
      for (const m of markers(DEFAULT_FILTERS, false)) {
        let [sx, sy] = project(xf, m.x, m.z);
        const inside = sx > 8 && sx < W - 8 && sy > 8 && sy < H - 8;
        if (m.kind === 'poi') {
          if (!inside || Math.hypot(m.x - playerPosition.x, m.z - playerPosition.z) > 180) continue;
          drawMarker(g, m, sx, sy, 20, t);
          continue;
        }
        const pad = 14;
        sx = Math.min(W - pad, Math.max(pad, sx));
        sy = Math.min(H - pad, Math.max(pad, sy));
        drawMarker(g, m, sx, sy, m.kind === 'objective' ? 26 : 24, t);
      }
      drawPlayer(g, xf.cx, xf.cy, screenAngle(playerHeading()) - look, 11);
      // north marker on the rim
      const [nx, ny] = project(xf, playerPosition.x, playerPosition.z - 10000);
      const ang = Math.atan2(ny - xf.cy, nx - xf.cx);
      const rx = W / 2 - 14;
      const ry = H / 2 - 14;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
      const ncx = W / 2 + Math.cos(ang) * k;
      const ncy = H / 2 + Math.sin(ang) * k;
      g.fillStyle = 'rgba(0,0,0,0.65)';
      g.beginPath();
      g.arc(ncx, ncy, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', ncx, ncy + 0.5);
      g.restore();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <canvas ref={ref} className="minimap" width={480} height={300} aria-label="Radar" />
      <NextTurn />
    </>
  );
}

/** GTA-style GPS chip above the radar: the next turn, its distance, and the destination. */
function NextTurn() {
  const nav = useNav();
  if (!nav.target || !nav.route) return null;
  const n = nav.next;
  const d = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
  const arrow = n?.turn.dir === 'left' ? '↰' : n?.turn.dir === 'right' ? '↱' : n?.turn.dir === 'uturn' ? '⮌' : '⚑';
  const what = n?.turn.dir === 'arrive' ? 'Destination' : n?.turn.dir === 'uturn' ? 'Turn around' : n ? `Turn ${n.turn.dir}` : '';
  return (
    <div className="gps" style={{ ['--gps' as string]: routeColor(nav.target) }} aria-live="polite">
      {n && (
        <div className="gps-turn">
          <span className="gps-arrow" aria-hidden>
            {arrow}
          </span>
          <b>{d(n.dist)}</b>
          <span>{what}</span>
        </div>
      )}
      <div className="gps-dest">
        {nav.target.label} · {d(nav.remaining)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ full map
export function BigMap() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef({ x: 0, z: 0, scale: 0.4, init: false });
  const xfRef = useRef<Xf | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [sat, setSat] = useState(() => {
    try {
      return localStorage.getItem('mk.mapStyle') !== 'roads';
    } catch {
      return true;
    }
  });
  const [, redraw] = useState(0);
  const drag = useRef<{ x: number; y: number; vx: number; vz: number; moved: boolean; pointers: Map<number, { x: number; y: number }>; pinch: number } | null>(null);
  const waypoint = useMissions((s) => s.waypoint);
  const active = useMissions((s) => s.active);
  const nav = useNav();

  useEffect(() => onKeyPress('KeyM', () => setOpen((o) => !o)), []);
  useEffect(() => onKeyPress('Escape', () => setOpen(false)), []);
  useEffect(() => {
    // the map takes the controls: Abel and his vehicle get no input while it's open
    inputLock.ui = open || inputLock.ui;
    if (open) {
      preloadSat();
      document.exitPointerLock?.();
      const v = view.current;
      v.x = playerPosition.x;
      v.z = playerPosition.z;
      if (!v.init) {
        v.scale = 0.42;
        v.init = true;
      }
    } else {
      inputLock.ui = false;
      setSelected(null);
    }
  }, [open]);

  // WASD / arrows pan, PageUp/PageDown zoom (the movement keys don't drive anything while open)
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let lastT = performance.now();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      const v = view.current;
      if (input.moveX || input.moveY) {
        const sp = 420 / v.scale;
        v.x += input.moveX * sp * dt;
        v.z -= input.moveY * sp * dt;
      }
      draw(t);
    };
    raf = requestAnimationFrame(tick);
    const offs = [
      onKeyPress('PageUp', () => zoomBy(1.4)),
      onKeyPress('PageDown', () => zoomBy(1 / 1.4)),
      onKeyPress('KeyC', () => recenter()),
    ];
    return () => {
      cancelAnimationFrame(raf);
      offs.forEach((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filters, selected, waypoint, active, nav.route, sat]);

  const zoomBy = (k: number, sx?: number, sy?: number) => {
    const v = view.current;
    const xf = xfRef.current;
    const before = xf && sx !== undefined && sy !== undefined ? unproject(xf, sx, sy) : null;
    v.scale = Math.max(0.12, Math.min(4, v.scale * k));
    if (before && xf) {
      // keep the point under the cursor fixed
      const nxf: Xf = { ...xf, scale: v.scale, px: v.x, pz: v.z };
      const after = unproject(nxf, sx!, sy!);
      v.x += before.x - after.x;
      v.z += before.z - after.z;
    }
    redraw((n) => n + 1);
  };
  const recenter = () => {
    view.current.x = playerPosition.x;
    view.current.z = playerPosition.z;
    redraw((n) => n + 1);
  };

  const draw = (t: number) => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const dpr = devicePixelRatio;
    const W = Math.round(cv.clientWidth * dpr);
    const H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const v = view.current;
    const xf: Xf = { cx: W / 2, cy: H / 2, scale: v.scale * dpr, rot: 0, px: v.x, pz: v.z };
    xfRef.current = xf;
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawBase(g, xf, true, sat && satAvailable(), W, H);
    const ns = useNav.getState();
    if (ns.route) drawRoute(g, xf, ns.route, routeColor(ns.target), 0, 6 * dpr);
    // markers, POIs clustered when crowded
    const ms = markers(filters, true);
    const placed: { sx: number; sy: number; n: number; m: MapMarker }[] = [];
    for (const m of ms) {
      const [sx, sy] = project(xf, m.x, m.z);
      if (m.kind === 'poi' || m.kind === 'completed') {
        const near = placed.find((p) => (p.m.kind === m.kind && p.m.icon === m.icon) && Math.hypot(p.sx - sx, p.sy - sy) < 22 * dpr);
        if (near) {
          near.n++;
          continue;
        }
      }
      placed.push({ sx, sy, n: 1, m });
    }
    // important markers last (on top)
    const order = { poi: 0, completed: 1, enemy: 2, waypoint: 3, available: 4, objective: 5 } as const;
    placed.sort((a, b) => order[a.m.kind] - order[b.m.kind]);
    for (const p of placed) {
      const size = (p.m.kind === 'poi' ? 22 : p.m.kind === 'completed' ? 20 : 30) * dpr;
      drawMarker(g, p.m, p.sx, p.sy, size, t, selected?.id === p.m.id);
      if (p.n > 1) {
        g.font = `700 ${10 * dpr}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#0b0d10';
        g.beginPath();
        g.arc(p.sx + size * 0.42, p.sy - size * 0.42, 7 * dpr, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.fillText(String(p.n), p.sx + size * 0.42, p.sy - size * 0.42 + 0.5);
      }
      if ((p.m.kind === 'available' || p.m.kind === 'objective') && v.scale > 0.3) {
        g.font = `600 ${11 * dpr}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        label(g, p.m.label, p.sx, p.sy + size * 0.65, '#fff', 3 * dpr);
      }
    }
    const [px, py] = project(xf, playerPosition.x, playerPosition.z);
    drawPlayer(g, px, py, screenAngle(playerHeading()), 11 * dpr);
    hits.current = placed.map((p) => ({ sx: p.sx, sy: p.sy, m: p.m }));
  };
  const hits = useRef<{ sx: number; sy: number; m: MapMarker }[]>([]);

  if (!open) return null;

  const local = (e: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { sx: (e.clientX - r.left) * devicePixelRatio, sy: (e.clientY - r.top) * devicePixelRatio };
  };
  const pick = (sx: number, sy: number) => {
    let best: MapMarker | null = null;
    let bd = 18 * devicePixelRatio;
    for (const h of hits.current) {
      const d = Math.hypot(h.sx - sx, h.sy - sy);
      if (d < bd) {
        bd = d;
        best = h.m;
      }
    }
    return best;
  };
  const setDest = (x: number, z: number, label: string, kind: NavTarget['kind']) => {
    useNav.setState({ target: { x, z, label, kind } });
    useMissions.getState().setWaypoint({ x, z });
  };
  const clearDest = () => {
    useMissions.getState().setWaypoint(null);
    useNav.setState({ target: null, route: null, next: null });
  };
  const sel = selected;
  const selDist = sel ? Math.hypot(sel.x - playerPosition.x, sel.z - playerPosition.z) : 0;
  const selIsDest = !!sel && !!waypoint && Math.hypot(waypoint.x - sel.x, waypoint.z - sel.z) < 2;
  const done = new Set(useMissions.getState().completed);
  const toggle = (k: keyof Filters) => setFilters((f) => ({ ...f, [k]: !f[k] }));
  const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

  return (
    <div className="bigmap" role="dialog" aria-label="Map">
      <canvas
        ref={ref}
        onWheel={(e) => {
          const { sx, sy } = local(e);
          zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, sx, sy);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const d = drag.current ?? { x: e.clientX, y: e.clientY, vx: view.current.x, vz: view.current.z, moved: false, pointers: new Map(), pinch: 0 };
          d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (d.pointers.size === 1) Object.assign(d, { x: e.clientX, y: e.clientY, vx: view.current.x, vz: view.current.z, moved: false });
          if (d.pointers.size === 2) {
            const [a, b] = [...d.pointers.values()];
            d.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          }
          drag.current = d;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !d.pointers.has(e.pointerId)) return;
          d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (d.pointers.size === 2) {
            const [a, b] = [...d.pointers.values()];
            const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            if (d.pinch > 0) zoomBy(dist / d.pinch);
            d.pinch = dist;
            d.moved = true;
            return;
          }
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.hypot(dx, dy) > 4) d.moved = true;
          view.current.x = d.vx - dx / view.current.scale;
          view.current.z = d.vz - dy / view.current.scale;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d) return;
          d.pointers.delete(e.pointerId);
          if (d.pointers.size > 0) return;
          drag.current = null;
          if (d.moved || e.button !== 0) return;
          const { sx, sy } = local(e);
          const hit = pick(sx, sy);
          if (hit) {
            setSelected(hit);
            return;
          }
          // click on empty map: a waypoint (GTA)
          const xf = xfRef.current!;
          const w = unproject(xf, sx, sy);
          setSelected(null);
          setDest(w.x, w.z, `Waypoint · ${nearestArea(w.x, w.z)}`, 'waypoint');
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          clearDest();
        }}
      />
      <aside className="map-side">
        <h2>Mkurugenzi City</h2>
        <div className="map-style" role="group" aria-label="Map style">
          {(
            [
              [true, 'Satellite'],
              [false, 'Roads'],
            ] as const
          ).map(([v, name]) => (
            <button
              key={name}
              className={sat === v ? 'on' : ''}
              aria-pressed={sat === v}
              onClick={() => {
                setSat(v);
                try {
                  localStorage.setItem('mk.mapStyle', v ? 'satellite' : 'roads');
                } catch {
                  /* private mode: just this session */
                }
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="map-filters" role="group" aria-label="Map layers">
          {(
            [
              ['missions', 'Missions', MARK.available],
              ['completed', 'Completed', MARK.completed],
              ['stages', 'Matatu stages', '#f4b400'],
              ['shops', 'Shops & food', '#4fa3ff'],
              ['services', 'Hospitals', '#ffffff'],
              ['landmarks', 'Landmarks', '#d4a017'],
            ] as [keyof Filters, string, string][]
          ).map(([k, name, c]) => (
            <button key={k} className={filters[k] ? 'on' : ''} aria-pressed={filters[k]} onClick={() => toggle(k)}>
              <i style={{ background: c }} /> {name}
            </button>
          ))}
        </div>
        <div className="map-legend">
          <span>
            <i className="lg lg-avail" /> Mission available
          </span>
          <span>
            <i className="lg lg-active" /> Active objective
          </span>
          <span>
            <i className="lg lg-done" /> Completed
          </span>
          <span>
            <i className="lg lg-way" /> Your waypoint
          </span>
          <span>
            <i className="lg lg-hw" /> Expressway · <i className="lg lg-rd" /> Road · <i className="lg lg-mr" /> Murram
          </span>
        </div>
        {!active && (
          <div className="map-jobs">
            <h3>Available</h3>
            {availableMissions().map((m) => {
              const p = m.start();
              const mk: MapMarker = { id: `m-${m.id}`, ...p, kind: 'available', icon: missionIcon(m.chapter, m.title), color: MARK.available, label: m.title, mission: m, side: m.side };
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelected(mk);
                    view.current.x = p.x;
                    view.current.z = p.z;
                  }}
                >
                  <b>{m.title}</b>
                  <small>
                    {CHAPTER_CATEGORY[m.chapter] ?? 'Mission'} · {fmt(Math.hypot(p.x - playerPosition.x, p.z - playerPosition.z))}
                  </small>
                </button>
              );
            })}
          </div>
        )}
        <div className="map-tools">
          <button onClick={() => zoomBy(1.4)} aria-label="Zoom in">
            +
          </button>
          <button onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
            −
          </button>
          <button onClick={recenter}>Recenter (C)</button>
          {waypoint && <button onClick={clearDest}>Clear route</button>}
          <button onClick={() => setOpen(false)}>Close (M)</button>
        </div>
        <p className="map-help">Drag or WASD to pan · wheel / PgUp PgDn to zoom · click a marker for details · click the map for a waypoint · right-click clears</p>
      </aside>
      {sel && (
        <section className="map-card" aria-label={sel.label} style={{ ['--mk' as string]: sel.kind === 'objective' ? MARK.active : sel.kind === 'poi' ? sel.color : sel.kind === 'waypoint' ? MARK.waypoint : MARK.available }}>
          <header>
            <CardIcon m={sel} />
            <div>
              <small>
                {sel.mission
                  ? `${sel.mission.side ? 'Side job' : 'Story mission'} · ${CHAPTER_CATEGORY[sel.mission.chapter] ?? ''}`
                  : sel.poi
                    ? { stage: 'Matatu stage', shop: 'Shop', food: 'Food', hospital: 'Hospital', service: 'Fuel and garage', theatre: 'Theatre', landmark: 'Landmark' }[sel.poi.kind]
                    : sel.kind === 'waypoint'
                      ? 'Waypoint'
                      : ''}
              </small>
              <h3>{sel.label}</h3>
            </div>
          </header>
          {sel.mission && <p className="map-card-desc">“{sel.mission.lines[0]?.text}” <em>— {sel.mission.giver}</em></p>}
          <dl>
            <dt>Location</dt>
            <dd>{nearestArea(sel.x, sel.z)}</dd>
            <dt>Distance</dt>
            <dd>{fmt(selDist)}</dd>
            {sel.mission && (
              <>
                <dt>Status</dt>
                <dd className={sel.kind === 'objective' ? 'st-active' : done.has(sel.mission.id) ? 'st-done' : 'st-avail'}>
                  {sel.kind === 'objective' ? '● Active' : done.has(sel.mission.id) ? '✓ Completed' : '● Available'}
                </dd>
                <dt>Reward</dt>
                <dd>KSh {sel.mission.reward.toLocaleString()}</dd>
              </>
            )}
          </dl>
          <footer>
            {sel.kind !== 'objective' &&
              (selIsDest ? (
                <button onClick={clearDest}>Remove destination</button>
              ) : (
                <button className="primary" onClick={() => setDest(sel.x, sel.z, sel.label, sel.mission ? 'mission' : 'waypoint')}>
                  Set destination
                </button>
              ))}
            {sel.kind === 'objective' && <span className="map-card-note">GPS is guiding you here</span>}
            {sel.mission && sel.kind === 'available' && <span className="map-card-note">Walk to the green marker and press E to start</span>}
            <button onClick={() => setSelected(null)}>Close</button>
          </footer>
        </section>
      )}
    </div>
  );
}

function CardIcon({ m }: { m: MapMarker }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 64, 64);
    drawMarker(g, m, 32, 32, 44, 0);
  }, [m]);
  return <canvas ref={ref} width={64} height={64} className="map-card-icon" aria-hidden />;
}

// keep the old full-map scale helper reachable for tests
export const MAP_WORLD_HALF = WORLD_HALF;

/** GTA-style objective line (bottom centre, {highlights} in yellow), timer and counter (top right),
 *  subtitles for whoever is talking. Hidden during cutscenes. */
export function MissionHud() {
  const active = useMissions((s) => s.active);
  const counter = useMissions((s) => s.counter);
  const dialogue = useMissions((s) => s.dialogue);
  const shownAt = useMissions((s) => s.objectiveShownAt);
  const cinematic = useCutscene((s) => s.active);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);
  const cur = active ? currentStep() : null;
  const left = timeLeft();
  const talking = dialogue && performance.now() < dialogue.until ? dialogue : null;
  const objective = cur;
  if (cinematic) return null;
  // the objective line shows for a while when it changes (and stays while there is no subtitle)
  const showObjective = objective && (performance.now() - shownAt < 9000 || !talking);
  return (
    <>
      {objective && (left !== null || objective.step.count) && (
        <div className="mission-box">
          {left !== null && (
            <span className={`mission-timer${left < 20 ? ' urgent' : ''}`}>
              {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}
            </span>
          )}
          {objective.step.count ? (
            <span className="mission-count">
              {objective.step.counterLabel?.toUpperCase()} {counter}/{objective.step.count}
            </span>
          ) : null}
        </div>
      )}
      {showObjective && objective && (
        <div className="objective" key={shownAt}>
          {highlight(objective.step.text)}
        </div>
      )}
      {talking && (
        <div className="subtitle">
          <b>{talking.name}:</b> {talking.text}
        </div>
      )}
    </>
  );
}

/** "Go to the {Grand Theatre}." -> text with the braced words in GTA yellow. */
export function highlight(text: string) {
  return text.split(/(\{[^}]+\})/g).map((part, i) =>
    part.startsWith('{') ? (
      <em key={i} className="hl">
        {part.slice(1, -1)}
      </em>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
