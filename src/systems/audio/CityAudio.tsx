import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { audioContext } from './music';
import { brownBuffer, bus, noiseBuffer, panner, setPos } from './mixer';
import { horn } from './sfx';
import { setVoiceListener } from './voice';
import { playerPosition } from '../player/playerState';
import { playerAnim } from '../player/AbelModel';
import { occ } from '../vehicles/occupancy';
import { vehicles } from '../vehicles/state';
import { clock, daylight } from '../../world/clock';
import { ROADS, TOWNS, distToRoad } from '../../config/roads';
import { KIBERA } from '../../world/heights';
import { MARKET, STREET_Z } from '../../districts/hub/layout';
import { coastWeight, shoreX } from '../../config/coast';
import { useInterior } from '../interiors/rooms';
import { LoopBed, loadShot } from './tracks';

// The city when no engine is near: a layered, mixed soundscape made of REAL recordings
// (tools/make-ambience.py: Nairobi street and night-traffic ambience, a Nairobi suburban morning,
// Kenyan savanna birdsong and dusk, Tsavo night insects, Diani surf, savanna wind; one-shot Hadada
// ibis, rooster, bulbul, wagtail and cricket calls). Each bed's level follows the place and the
// hour; one-shot calls are placed around Abel in 3D. The synthesised layers below remain only as a
// fallback if the recordings can't load (and a little synth rumble follows the actual traffic).
//   - the 3D listener follows the camera every frame (every panner in the game depends on it)
//   - distant-traffic bed: rises with the traffic around you and the roads you stand by
//   - market / street murmur in the busy places, quiet in the estates and the countryside
//   - birds by day, crickets after dark; the sea washing in on the coast
//   - the odd distant horn somewhere in town
//   - Abel's footsteps, by surface (tarmac, murram, sand)
// Levels follow the place and the time, and everything goes through the 'ambience' bus.

const _f = new THREE.Vector3();
const _u = new THREE.Vector3();

interface Layers {
  traffic: GainNode;
  trafficF: BiquadFilterNode;
  murmur: GainNode;
  murmurF: BiquadFilterNode;
  sea: GainNode;
  seaF: BiquadFilterNode;
  crickets: GainNode;
  wind: GainNode;
}

function loop(ac: AudioContext, buf: AudioBuffer, dest: AudioNode, rate = 1) {
  const s = ac.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  s.connect(dest);
  s.start(ac.currentTime, Math.random() * buf.duration);
  return s;
}

function build(ac: AudioContext, out: AudioNode): Layers {
  const g = () => {
    const n = ac.createGain();
    n.gain.value = 0;
    n.connect(out);
    return n;
  };
  const f = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const n = ac.createBiquadFilter();
    n.type = type;
    n.frequency.value = freq;
    n.Q.value = q;
    return n;
  };
  // distant traffic: low rumble with a slow swell
  const traffic = g();
  const trafficF = f('lowpass', 320);
  trafficF.connect(traffic);
  loop(ac, brownBuffer(ac), trafficF, 0.9);
  // murmur of voices: band-limited noise with slow, irregular level changes (a crowd, not a hiss)
  const murmur = g();
  const murmurF = f('bandpass', 650, 0.9);
  const murmurAM = ac.createGain();
  murmurF.connect(murmurAM).connect(murmur);
  loop(ac, noiseBuffer(ac), murmurF, 0.5);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.37;
  const lfoG = ac.createGain();
  lfoG.gain.value = 0.35;
  murmurAM.gain.value = 0.65;
  lfo.connect(lfoG).connect(murmurAM.gain);
  lfo.start();
  // the sea: surf washing in and out
  const sea = g();
  const seaF = f('lowpass', 900);
  const seaAM = ac.createGain();
  seaF.connect(seaAM).connect(sea);
  loop(ac, noiseBuffer(ac), seaF, 0.35);
  const swell = ac.createOscillator();
  swell.frequency.value = 0.11;
  const swellG = ac.createGain();
  swellG.gain.value = 0.45;
  seaAM.gain.value = 0.55;
  swell.connect(swellG).connect(seaAM.gain);
  swell.start();
  // crickets: a high tone gated in quick trills
  const crickets = g();
  const tone = ac.createOscillator();
  tone.frequency.value = 4400;
  const trill = ac.createGain();
  trill.gain.value = 0;
  const gate = ac.createOscillator();
  gate.type = 'square';
  gate.frequency.value = 28;
  const gateG = ac.createGain();
  gateG.gain.value = 0.5;
  const slow = ac.createOscillator();
  slow.type = 'square';
  slow.frequency.value = 0.9;
  const slowG = ac.createGain();
  slowG.gain.value = 0.5;
  const mult = ac.createGain();
  mult.gain.value = 0;
  gate.connect(gateG).connect(trill.gain);
  tone.connect(trill).connect(mult).connect(crickets);
  slow.connect(slowG).connect(mult.gain);
  tone.start();
  gate.start();
  slow.start();
  // wind on open ground
  const wind = g();
  const windF = f('bandpass', 420, 0.5);
  windF.connect(wind);
  loop(ac, noiseBuffer(ac), windF, 0.25);
  return { traffic, trafficF, murmur, murmurF, sea, seaF, crickets, wind };
}

/** One bird call (a few FM chirps) at a position. */
function bird(ac: AudioContext, out: AudioNode, x: number, y: number, z: number) {
  const p = panner(ac, 6, 1.0);
  setPos(p, x, y, z);
  p.connect(out);
  const t0 = ac.currentTime + 0.02;
  const kind = Math.floor(Math.random() * 3);
  const n = kind === 0 ? 3 + Math.floor(Math.random() * 4) : kind === 1 ? 2 : 6;
  const base = 2200 + Math.random() * 2200;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (kind === 2 ? 0.07 : 0.16 + Math.random() * 0.08);
    const o = ac.createOscillator();
    const gg = ac.createGain();
    const f0 = base * (kind === 1 ? (i ? 0.8 : 1.15) : 1 + Math.random() * 0.15);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * (kind === 0 ? 1.35 : 0.7), t + 0.07);
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(gg).connect(p);
    o.start(t);
    o.stop(t + 0.1);
  }
  setTimeout(() => p.disconnect(), 3000);
}

/** One footstep: a soft thud plus surface texture. */
function footstep(ac: AudioContext, out: AudioNode, surface: 'hard' | 'dirt' | 'sand', loud: number) {
  const t = ac.currentTime + 0.005;
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = surface === 'hard' ? 1800 : surface === 'dirt' ? 900 : 500;
  f.Q.value = surface === 'hard' ? 1.4 : 0.8;
  const g = ac.createGain();
  const peak = 0.05 * loud * (surface === 'sand' ? 0.7 : 1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (surface === 'hard' ? 0.07 : 0.12));
  n.connect(f).connect(g).connect(out);
  n.start(t, Math.random() * 1.5);
  n.stop(t + 0.15);
}

type BedName =
  | 'city_day' | 'city_day_b' | 'city_night' | 'suburb_morning' | 'birds_amboseli' | 'birds_laikipia'
  | 'wind' | 'night_insects' | 'night_insects_b' | 'dusk' | 'sea_diani' | 'market';
const BEDS: BedName[] = ['city_day', 'city_day_b', 'city_night', 'suburb_morning', 'birds_amboseli', 'birds_laikipia', 'wind', 'night_insects', 'night_insects_b', 'dusk', 'sea_diani', 'market'];
const SHOTS = {
  hadada: [0, 1, 2, 3, 4, 5, 6].map((k) => `/audio/shots/hadada_${k}.webm`),
  rooster: [0, 1, 2].map((k) => `/audio/shots/rooster_${k}.webm`),
  songbird: [...[0, 1, 2, 3].map((k) => `/audio/shots/bulbul_${k}.webm`), ...[0, 1, 2].map((k) => `/audio/shots/wagtail_${k}.webm`)],
  cricket: [0, 1, 2, 3].map((k) => `/audio/shots/cricket_${k}.webm`),
};

interface Recorded {
  beds: Record<BedName, LoopBed>;
  muffle: BiquadFilterNode; // walls (indoors)
}

function buildRecorded(ac: AudioContext, out: AudioNode): Recorded {
  const muffle = ac.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 18000;
  muffle.connect(out);
  const beds = Object.fromEntries(
    BEDS.map((b) => {
      const bed = new LoopBed(ac, `/audio/amb/${b}.webm`, b === 'market' ? 3 : 5);
      bed.output.connect(muffle);
      return [b, bed];
    }),
  ) as Record<BedName, LoopBed>;
  return { beds, muffle };
}

/** A recorded call somewhere around the listener (positional, a little random in pitch and level). */
function playShot(ac: AudioContext, out: AudioNode, url: string, x: number, y: number, z: number, gain: number) {
  void loadShot(ac, url).then((buf) => {
    if (!buf) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = ac.createGain();
    g.gain.value = gain;
    const p = panner(ac, 8, 1.0, 600);
    setPos(p, x, y, z);
    src.connect(g).connect(p).connect(out);
    src.onended = () => p.disconnect();
    src.start();
  });
}
function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}
const bump = (h: number, at: number, width: number) => Math.max(0, 1 - Math.abs(h - at) / width);

export function CityAudio() {
  const camera = useThree((s) => s.camera);
  const layers = useRef<Layers | null>(null);
  const rec = useRef<Recorded | null>(null);
  const st = useRef({ t: 0, birdAt: 0, hornAt: performance.now() + 9000, stepPhase: 0, hadadaAt: 0, roosterAt: 0, cricketAt: 0 });

  useEffect(
    () => () => {
      layers.current = null;
      if (rec.current) for (const b of Object.values(rec.current.beds)) b.dispose();
      rec.current = null;
    },
    [],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    // listener = the camera, every frame
    setVoiceListener(camera.position.x, camera.position.y, camera.position.z);
    const ac = audioContext();
    if (!ac || ac.state !== 'running') return;
    const l = ac.listener;
    _f.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      const t = ac.currentTime;
      l.positionX.setTargetAtTime(camera.position.x, t, 0.02);
      l.positionY.setTargetAtTime(camera.position.y, t, 0.02);
      l.positionZ.setTargetAtTime(camera.position.z, t, 0.02);
      l.forwardX.setTargetAtTime(_f.x, t, 0.02);
      l.forwardY.setTargetAtTime(_f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(_f.z, t, 0.02);
      l.upX.setTargetAtTime(_u.x, t, 0.02);
      l.upY.setTargetAtTime(_u.y, t, 0.02);
      l.upZ.setTargetAtTime(_u.z, t, 0.02);
    } else {
      const ll = l as unknown as { setPosition: (x: number, y: number, z: number) => void; setOrientation: (...a: number[]) => void };
      ll.setPosition(camera.position.x, camera.position.y, camera.position.z);
      ll.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z);
    }
    const out = bus('ambience');
    if (!out) return;
    layers.current ??= build(ac, out);
    rec.current ??= buildRecorded(ac, out);
    const L = layers.current;
    const R = rec.current;
    const s = st.current;
    const px = playerPosition.x;
    const pz = playerPosition.z;
    const indoors = !!useInterior.getState().door;

    // ---- footsteps (walking only; never in a vehicle) ----
    const sfx = bus('sfx');
    if (sfx && occ.phase === 'walking' && playerAnim.grounded && !playerAnim.swimming && playerAnim.speed > 0.4) {
      const rate = playerAnim.speed > 5 ? 3.2 : playerAnim.speed > 2.6 ? 2.7 : 1.9; // steps per second
      s.stepPhase += dt * rate;
      if (s.stepPhase >= 1) {
        s.stepPhase -= 1;
        const inKibera = px > KIBERA.x0 && px < KIBERA.x1 && pz > KIBERA.z0 && pz < KIBERA.z1;
        const onMurram = ROADS.some((r) => r.kind === 'murram' && distToRoad(r, px, pz) < r.width / 2 + 0.5);
        const surface = coastWeight(px, pz) > 0.5 && px > shoreX(pz) - 150 ? 'sand' : inKibera || onMurram ? 'dirt' : 'hard';
        footstep(ac, sfx, surface, Math.min(1.4, 0.6 + playerAnim.speed / 6));
      }
    } else s.stepPhase = 0.5;

    s.t += dt;
    if (s.t < 0.25) return;
    s.t = 0;
    const t = ac.currentTime;
    const day = daylight(clock.hours); // 0 night .. 1 day
    // ---- place ----
    let road = 1e9;
    for (const r of ROADS) if (r.kind !== 'murram') road = Math.min(road, distToRoad(r, px, pz) - r.width / 2);
    let traffic = 0;
    for (const v of vehicles) {
      if (v.jackedUntil) continue;
      const d = Math.hypot(v.x - px, v.z - pz);
      traffic += (0.3 + Math.min(1, v.v / 10)) / (1 + (d / 60) ** 2);
    }
    const inTown = TOWNS.some((tw) => Math.abs(px - tw.x) < tw.rx && Math.abs(pz - tw.z) < tw.rz);
    const inHub = px > -40 && px < 40 && pz > STREET_Z[0] - 20 && pz < STREET_Z[1] + 40;
    const inMarket = px > MARKET[0] - 25 && px < MARKET[2] + 25 && pz > MARKET[1] - 25 && pz < MARKET[3] + 25;
    const inKibera = px > KIBERA.x0 && px < KIBERA.x1 && pz > KIBERA.z0 && pz < KIBERA.z1;
    const busy = inMarket ? 1 : inHub ? 0.7 : inKibera ? 0.55 : inTown ? 0.4 : 0.08;
    const coast = coastWeight(px, pz) > 0.3 ? Math.max(0, 1 - Math.max(0, shoreX(pz) - px) / 220) : 0;
    const inside = indoors ? 0.25 : 1; // walls muffle the street
    // ---- recorded beds: what this place sounds like at this hour ----
    const h = clock.hours;
    const night = 1 - day;
    const dawn = bump(h, 6.4, 1.6); // the morning chorus
    const dusk = bump(h, 18.6, 1.2);
    const urban = inHub ? 1 : inTown ? 0.9 : inKibera ? 0.65 : road < 40 ? 0.45 : road < 150 ? 0.25 : 0.08;
    const within = (ids: string[]) => TOWNS.some((tw) => ids.includes(tw.id) && Math.abs(px - tw.x) < tw.rx && Math.abs(pz - tw.z) < tw.rz);
    const estate = within(['estate', 'sw']);
    const cbd = within(['cbd', 'east', 'arena']);
    const country = 1 - urban;
    const open = country * (1 - coast) * 0.6 + coast * 0.4;
    const recOk = R.beds.city_day.ok;
    const lv: Record<BedName, number> = {
      city_day: day * (inHub || inKibera ? urban : estate || cbd ? 0 : urban * 0.7) * 0.9,
      city_day_b: day * (cbd ? 1 : 0) * 0.9,
      city_night: night * Math.min(1, urban * 0.9 + Math.max(0, 1 - road / 200) * 0.4) * 0.85,
      suburb_morning: (estate ? 1 : inKibera ? 0.6 : urban > 0.3 ? 0.25 : 0) * Math.min(1, day * 0.5 + dawn) * 0.9,
      birds_amboseli: country * (day * 0.7 + dawn * 0.5) * (h < 12 ? 1 : 0.35),
      birds_laikipia: country * day * (h >= 12 ? 0.7 : 0.25),
      wind: open * (0.35 + 0.65 * day) * 0.8,
      night_insects: night * (1 - urban * 0.55) * (h > 3 && h < 12 ? 0.6 : 1),
      night_insects_b: night * country * 0.6,
      dusk: dusk * (1 - urban * 0.5),
      sea_diani: coast,
      market: (inMarket ? 1 : inHub ? 0.3 : inKibera ? 0.25 : 0) * (0.25 + 0.75 * day),
    };
    for (const bn of BEDS) R.beds[bn].set(lv[bn] * inside, 1.5);
    R.muffle.frequency.setTargetAtTime(indoors ? 700 : 18000, t, 0.4);
    // ---- synthesised layers: a little rumble that follows the real traffic, the rest only as a fallback ----
    const tr = Math.min(1, 0.12 + traffic * 0.35 + Math.max(0, 1 - road / 120) * 0.3) * (inTown || inHub ? 1 : 0.6);
    const fb = recOk ? 0 : 1;
    L.traffic.gain.setTargetAtTime(tr * 0.32 * inside * (recOk ? 0.5 : 1), t, 1.2);
    L.trafficF.frequency.setTargetAtTime(indoors ? 180 : 260 + tr * 200, t, 1);
    L.murmur.gain.setTargetAtTime(busy * (0.35 + 0.65 * day) * 0.11 * inside * fb, t, 1.5);
    L.murmurF.frequency.setTargetAtTime(indoors ? 400 : 650, t, 1);
    L.sea.gain.setTargetAtTime(coast * 0.3 * inside * fb, t, 1.5);
    L.crickets.gain.setTargetAtTime((1 - day) * (busy < 0.6 ? 0.012 : 0.004) * inside * fb, t, 3);
    L.wind.gain.setTargetAtTime((busy < 0.2 ? 0.05 : 0.015) * (indoors ? 0 : 1) * fb, t, 2);
    const now = performance.now();
    if (!indoors) {
      // songbirds by day: recorded bulbul / wagtail calls in the trees around (synth chirps if not loaded)
      if (day > 0.3 && now > s.birdAt) {
        s.birdAt = now + (busy > 0.6 ? 9000 : 3500) + Math.random() * 7000;
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 30;
        const bx = px + Math.cos(a) * r;
        const by = playerPosition.y + 6 + Math.random() * 8;
        const bz = pz + Math.sin(a) * r;
        if (recOk) playShot(ac, out, pick(SHOTS.songbird), bx, by, bz, 0.35 + country * 0.3);
        else bird(ac, out, bx, by, bz);
      }
      // Hadada ibis: Nairobi's dawn and dusk alarm clock, calling as they fly over
      const hadada = Math.max(dawn, dusk) * 0.9 + day * 0.08;
      if (recOk && hadada > 0.05 && now > s.hadadaAt) {
        s.hadadaAt = now + (12000 + Math.random() * 30000) / hadada;
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 60;
        playShot(ac, out, pick(SHOTS.hadada), px + Math.cos(a) * r, playerPosition.y + 18 + Math.random() * 15, pz + Math.sin(a) * r, 0.55);
      }
      // roosters at daybreak in the estates, Kibera and the villages
      const roost = bump(h, 6.0, 1.3) * (inKibera || estate ? 1 : country * 0.7 + 0.15);
      if (recOk && roost > 0.05 && now > s.roosterAt) {
        s.roosterAt = now + (18000 + Math.random() * 40000) / roost;
        const a = Math.random() * Math.PI * 2;
        const r = 40 + Math.random() * 90;
        playShot(ac, out, pick(SHOTS.rooster), px + Math.cos(a) * r, playerPosition.y + 1, pz + Math.sin(a) * r, 0.5);
      }
      // a cricket in the grass right beside you at night (away from the busiest streets)
      if (recOk && night > 0.6 && urban < 0.8 && now > s.cricketAt) {
        s.cricketAt = now + 5000 + Math.random() * 9000;
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 7;
        playShot(ac, out, pick(SHOTS.cricket), px + Math.cos(a) * r, playerPosition.y - 0.7, pz + Math.sin(a) * r, 0.25);
      }
    }
    // ---- a distant horn somewhere in town ----
    if (!indoors && (inTown || inHub || inKibera) && now > s.hornAt) {
      s.hornAt = now + 9000 + Math.random() * 20000;
      const a = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 130;
      horn(Math.random() < 0.6 ? 'car' : 'heavy', { x: px + Math.cos(a) * r, y: playerPosition.y + 1, z: pz + Math.sin(a) * r }, 200 + Math.random() * 400);
    }
  });
  return null;
}
