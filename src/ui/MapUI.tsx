import { useEffect, useRef, useState } from 'react';
import { ROADS, TOWNS } from '../config/roads';
import { AREAS } from '../config/areas';
import { KIBERA, RIDGE, FIRE_HILL } from '../world/heights';
import { MARKET } from '../districts/hub/layout';
import { ROUTES } from '../systems/vehicles/routes';
import { playerPosition, playerView } from '../systems/player/playerState';
import { drive } from '../systems/driving/state';
import { availableMissions, currentStep, timeLeft, useMissions } from '../game/missions';
import { useCutscene } from '../game/cutscene';
import { inputLock, onKeyPress } from '../systems/input';
import { WORLD_HALF } from '../config/world';
import { shoreX } from '../config/coast';
import { THEATRE } from '../game/places';
import { HOSPITALS } from '../game/health';
import { missionScratch } from '../game/missionData';
import { combatants } from '../systems/combat/combat';

// GTA-style radar (bottom-left, rotates with the camera) and full map (M) with a click-to-set
// waypoint. Both draw the same vector map: roads by type, towns, Kibera, the market, the ridge,
// matatu stages, mission givers, the current objective and the waypoint.

type Xf = { cx: number; cy: number; scale: number; rot: number; px: number; pz: number };

function project(xf: Xf, x: number, z: number): [number, number] {
  const dx = (x - xf.px) * xf.scale;
  const dz = (z - xf.pz) * xf.scale;
  const c = Math.cos(xf.rot);
  const s = Math.sin(xf.rot);
  return [xf.cx + dx * c - dz * s, xf.cy + dx * s + dz * c];
}

function drawWorld(g: CanvasRenderingContext2D, xf: Xf, full: boolean) {
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
  g.fillStyle = '#26301f';
  g.fillRect(-4000, -4000, 8000, 8000);
  // the sea off Mkurugenzi Beach, and the sand
  const coast: [number, number][] = [];
  for (let z = -2600; z <= 2600; z += 100) coast.push([shoreX(z) - 140, z]);
  poly([...coast, [8000, 2600], [8000, -2600]], '#d8c79a');
  const water: [number, number][] = [];
  for (let z = -2600; z <= 2600; z += 100) water.push([shoreX(z), z]);
  poly([...water, [8000, 2600], [8000, -2600]], '#2a6f8f');
  circle(FIRE_HILL.x, FIRE_HILL.z, FIRE_HILL.r, '#2f3a26');
  circle(RIDGE.x, RIDGE.z, RIDGE.r, '#46463f');
  rect(KIBERA.x0, KIBERA.z0, KIBERA.x1, KIBERA.z1, '#5c4030');
  for (const t of TOWNS) rect(t.x - t.rx, t.z - t.rz, t.x + t.rx, t.z + t.rz, '#3a3f46');
  rect(MARKET[0], MARKET[1], MARKET[2], MARKET[3], '#6e5d36');
  rect(-30, -160, 40, 110, '#3a3f46'); // the mtaa
  // roads: murram under tarmac under the expressway
  for (const kind of ['murram', 'tarmac', 'highway'] as const) {
    for (const r of ROADS) {
      if (r.kind !== kind) continue;
      g.beginPath();
      r.pts.forEach(([x, z], i) => {
        const [sx, sy] = project(xf, x, z);
        if (i) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
      });
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = kind === 'murram' ? '#9b6a3e' : kind === 'highway' ? '#e8d9a8' : '#cfcac0';
      g.lineWidth = Math.max(kind === 'highway' ? 3.5 : 2, r.width * xf.scale);
      g.stroke();
    }
  }
  // matatu stages
  g.fillStyle = '#ffc72c';
  for (const rt of ROUTES)
    for (const st of rt.stops) {
      const [sx, sy] = project(xf, st.x, st.z);
      g.fillRect(sx - 2.5, sy - 2.5, 5, 5);
    }
  if (full) {
    g.font = '600 13px system-ui, sans-serif';
    g.textAlign = 'center';
    for (const a of AREAS) {
      const [sx, sy] = project(xf, a.x, a.z);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.strokeText(a.name, sx, sy);
      g.fillStyle = '#fff';
      g.fillText(a.name, sx, sy);
    }
  }
}

interface Blip {
  x: number;
  z: number;
  kind: 'mission' | 'objective' | 'waypoint' | 'enemy';
}

function blips(): Blip[] {
  const out: Blip[] = [];
  const s = useMissions.getState();
  if (s.active) {
    const cur = currentStep();
    const at = cur?.step.at?.();
    if (at && cur?.step.spawn?.kind !== 'chase') out.push({ x: at.x, z: at.z, kind: 'objective' });
    // the getaway car, and opponents still standing (red, GTA style)
    if (cur?.step.spawn?.kind === 'chase') out.push({ ...missionScratch.chaseEnd, kind: 'enemy' });
    for (const c of combatants.values()) if (c.tag === 'mission' && c.state !== 'down') out.push({ x: c.x, z: c.z, kind: 'enemy' });
  } else for (const m of availableMissions()) out.push({ ...m.start(), kind: 'mission' });
  if (s.waypoint) out.push({ ...s.waypoint, kind: 'waypoint' });
  return out;
}

/** Fixed places worth finding: the Grand Theatre and the hospitals (GTA-style icons). */
function drawLandmarks(g: CanvasRenderingContext2D, xf: Xf) {
  const icon = (x: number, z: number, bg: string, fg: string, ch: string) => {
    const [sx, sy] = project(xf, x, z);
    g.beginPath();
    g.arc(sx, sy, 7, 0, Math.PI * 2);
    g.fillStyle = bg;
    g.fill();
    g.fillStyle = fg;
    g.font = 'bold 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, sx, sy + 0.5);
  };
  icon(THEATRE.x, THEATRE.z, '#8a1420', '#ffd23c', 'T');
  for (const h of HOSPITALS) icon(h.x, h.z, '#ffffff', '#c3261f', '+');
}

function drawBlip(g: CanvasRenderingContext2D, b: Blip, sx: number, sy: number) {
  g.save();
  g.translate(sx, sy);
  if (b.kind === 'mission') {
    g.beginPath();
    g.arc(0, 0, 8, 0, Math.PI * 2);
    g.fillStyle = '#ffc72c';
    g.fill();
    g.fillStyle = '#141414';
    g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('M', 0, 0.5);
  } else if (b.kind === 'enemy') {
    g.beginPath();
    g.arc(0, 0, 4.5, 0, Math.PI * 2);
    g.fillStyle = '#e0302a';
    g.strokeStyle = '#141414';
    g.lineWidth = 1.5;
    g.fill();
    g.stroke();
  } else if (b.kind === 'objective') {
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fillStyle = '#ffd23c';
    g.strokeStyle = '#141414';
    g.lineWidth = 2;
    g.fill();
    g.stroke();
  } else {
    g.rotate(Math.PI / 4);
    g.fillStyle = '#c86bff';
    g.fillRect(-5, -5, 10, 10);
  }
  g.restore();
}

function drawPlayer(g: CanvasRenderingContext2D, sx: number, sy: number, angle: number) {
  g.save();
  g.translate(sx, sy);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(6, 7);
  g.lineTo(0, 3);
  g.lineTo(-6, 7);
  g.closePath();
  g.fillStyle = '#fff';
  g.strokeStyle = '#141414';
  g.lineWidth = 1.5;
  g.fill();
  g.stroke();
  g.restore();
}

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 60) return; // ~16 fps is plenty for a radar
      last = t;
      const cv = ref.current;
      const g = cv?.getContext('2d');
      if (!cv || !g) return;
      const W = cv.width;
      const H = cv.height;
      const look = Math.atan2(playerView.lookX, -playerView.lookZ); // 0 = looking north
      const zoom = drive.active ? 0.55 + 0.4 / (1 + Math.abs(drive.speed) / 12) : 1.1;
      const xf: Xf = { cx: W / 2, cy: H * 0.62, scale: zoom * (W / 240), rot: -look, px: playerPosition.x, pz: playerPosition.z };
      g.save();
      g.clearRect(0, 0, W, H);
      drawWorld(g, xf, false);
      drawLandmarks(g, xf);
      // blips clamp to the radar edge when far away (GTA)
      for (const b of blips()) {
        let [sx, sy] = project(xf, b.x, b.z);
        const pad = 10;
        sx = Math.min(W - pad, Math.max(pad, sx));
        sy = Math.min(H - pad, Math.max(pad, sy));
        drawBlip(g, b, sx, sy);
      }
      drawPlayer(g, xf.cx, xf.cy, Math.atan2(Math.sin(playerView.facing), -Math.cos(playerView.facing)) - look);
      // north marker on the rim
      const [nx, ny] = project(xf, playerPosition.x, playerPosition.z - 10000);
      const ang = Math.atan2(ny - xf.cy, nx - xf.cx);
      const rx = W / 2 - 12;
      const ry = H / 2 - 12;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.beginPath();
      g.arc(W / 2 + Math.cos(ang) * k, H / 2 + Math.sin(ang) * k, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', W / 2 + Math.cos(ang) * k, H / 2 + Math.sin(ang) * k + 0.5);
      g.restore();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="minimap" width={480} height={300} aria-label="Radar" />;
}

export function BigMap() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const xfRef = useRef<Xf | null>(null);
  const waypoint = useMissions((s) => s.waypoint);
  const active = useMissions((s) => s.active);

  useEffect(() => onKeyPress('KeyM', () => setOpen((o) => !o)), []);
  useEffect(() => onKeyPress('Escape', () => setOpen(false)), []);
  useEffect(() => {
    inputLock.ui = open || inputLock.ui;
    if (open) document.exitPointerLock?.();
    else inputLock.ui = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const W = (cv.width = cv.clientWidth * devicePixelRatio);
    const H = (cv.height = cv.clientHeight * devicePixelRatio);
    const scale = Math.min(W, H) / (WORLD_HALF * 2);
    const xf: Xf = { cx: W / 2, cy: H / 2, scale, rot: 0, px: 0, pz: 0 };
    xfRef.current = xf;
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawWorld(g, xf, true);
    drawLandmarks(g, xf);
    for (const b of blips()) {
      const [sx, sy] = project(xf, b.x, b.z);
      drawBlip(g, b, sx, sy);
    }
    const [px, py] = project(xf, playerPosition.x, playerPosition.z);
    drawPlayer(g, px, py, Math.atan2(Math.sin(playerView.facing), -Math.cos(playerView.facing)));
  }, [open, waypoint, active]);

  if (!open) return null;
  const toWorld = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const xf = xfRef.current!;
    const r = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - r.left) * devicePixelRatio;
    const sy = (e.clientY - r.top) * devicePixelRatio;
    return { x: (sx - xf.cx) / xf.scale, z: (sy - xf.cy) / xf.scale };
  };
  return (
    <div className="bigmap" role="dialog" aria-label="Map">
      <canvas
        ref={ref}
        onClick={(e) => useMissions.getState().setWaypoint(toWorld(e))}
        onContextMenu={(e) => {
          e.preventDefault();
          useMissions.getState().setWaypoint(null);
        }}
      />
      <div className="bigmap-legend">
        <span><i className="lg-m">M</i> Mission</span>
        <span><i className="lg-o" /> Objective</span>
        <span><i className="lg-w" /> Waypoint (click · right-click clears)</span>
        <span><i className="lg-s" /> Matatu stage</span>
        <button onClick={() => setOpen(false)}>Close (M / Esc)</button>
      </div>
    </div>
  );
}

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
  if (cinematic) return null;
  // the objective line shows for a while when it changes (and stays while there is no subtitle)
  const showObjective = cur && (performance.now() - shownAt < 9000 || !talking);
  return (
    <>
      {cur && (left !== null || cur.step.count) && (
        <div className="mission-box">
          {left !== null && (
            <span className={`mission-timer${left < 20 ? ' urgent' : ''}`}>
              {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}
            </span>
          )}
          {cur.step.count ? (
            <span className="mission-count">
              {cur.step.counterLabel?.toUpperCase()} {counter}/{cur.step.count}
            </span>
          ) : null}
        </div>
      )}
      {showObjective && cur && (
        <div className="objective" key={shownAt}>
          {highlight(cur.step.text)}
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
