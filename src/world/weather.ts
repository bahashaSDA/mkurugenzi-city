import { create } from 'zustand';
import * as THREE from 'three';
import { clock } from './clock';

// Weather (Part 15.4): clear, cloudy, overcast, light rain, rain. It changes every 1-3 game hours
// and every quantity blends smoothly (~40 s), so nothing snaps. It drives, coherently:
//   * the sky and light (world/Environment): clouds dim the sun and hide stars and moon, rain
//     thickens the fog;
//   * wet surfaces: roads and murram darken and turn glossy while it rains and dry slowly after;
//   * tyre grip (systems/driving/Driving: SURFACE_GRIP x wetGrip());
//   * rain streaks around the camera outdoors and the rain sound (world/Weather).
// ?weather=clear|cloudy|overcast|drizzle|rain pins it (tests, screenshots).

export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'drizzle' | 'rain';
const TARGET: Record<WeatherKind, { cloud: number; rain: number }> = {
  clear: { cloud: 0.05, rain: 0 },
  cloudy: { cloud: 0.45, rain: 0 },
  overcast: { cloud: 0.85, rain: 0 },
  drizzle: { cloud: 0.8, rain: 0.35 },
  rain: { cloud: 0.95, rain: 1 },
};
export const WEATHER_NAMES: Record<WeatherKind, string> = { clear: 'Clear', cloudy: 'Cloudy', overcast: 'Overcast', drizzle: 'Light rain', rain: 'Rain' };
const CHANCES: [WeatherKind, number][] = [['clear', 0.45], ['cloudy', 0.25], ['overcast', 0.12], ['drizzle', 0.12], ['rain', 0.06]];

const forced = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('weather') as WeatherKind | null) : null;
const pinned = forced && forced in TARGET ? forced : null;

/** Live values (read every frame by the sky, the rain, the cars). */
export const weather = { kind: (pinned ?? 'clear') as WeatherKind, cloud: TARGET[pinned ?? 'clear'].cloud, rain: TARGET[pinned ?? 'clear'].rain, wet: pinned === 'rain' ? 0.9 : pinned === 'drizzle' ? 0.5 : 0, nextAt: 0 };
export const useWeather = create<{ kind: WeatherKind }>(() => ({ kind: weather.kind }));

let rngState = 9137;
const rnd = () => ((rngState = (rngState * 1664525 + 1013904223) >>> 0) / 4294967296);

/** Set the weather now (blends in). */
export function setWeather(kind: WeatherKind) {
  weather.kind = kind;
  useWeather.setState({ kind });
}

/** Advance the weather by dt seconds (called once per frame). */
export function updateWeather(dt: number) {
  const gameH = clock.day * 24 + clock.hours;
  if (!pinned && gameH >= weather.nextAt) {
    if (weather.nextAt > 0) {
      let r = rnd();
      let pick: WeatherKind = 'clear';
      for (const [k, p] of CHANCES) {
        if ((r -= p) <= 0) {
          pick = k;
          break;
        }
      }
      setWeather(pick);
    }
    weather.nextAt = gameH + 1 + rnd() * 2;
  }
  const t = TARGET[weather.kind];
  const k = Math.min(1, dt / 40);
  weather.cloud += (t.cloud - weather.cloud) * k;
  weather.rain += (t.rain - weather.rain) * Math.min(1, dt / 25);
  // surfaces wet quickly in rain, dry over a few minutes
  weather.wet = weather.rain > 0.05 ? Math.min(1, weather.wet + dt * 0.04 * weather.rain + dt * 0.01) : Math.max(0, weather.wet - dt * 0.004);
}

/** Share of the tyre grip left on a wet surface (murram turns to mud). */
export function wetGrip(surface: 'tarmac' | 'murram' | 'dirt' | 'sand') {
  const w = weather.wet;
  return surface === 'tarmac' ? 1 - 0.22 * w : surface === 'murram' || surface === 'dirt' ? 1 - 0.35 * w : 1 - 0.1 * w;
}

// ---- wet look on road/ground materials (registered by world/Roads and world/Terrain)
const wetMats: { m: THREE.MeshStandardMaterial; rough: number; color: THREE.Color }[] = [];
export function registerWet(m: THREE.Material) {
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial || wetMats.some((w) => w.m === s)) return;
  wetMats.push({ m: s, rough: s.roughness, color: s.color.clone() });
}
let lastWet = -1;
export function applyWetLook() {
  if (Math.abs(weather.wet - lastWet) < 0.01) return;
  lastWet = weather.wet;
  for (const w of wetMats) {
    w.m.roughness = w.rough * (1 - 0.55 * weather.wet);
    w.m.color.copy(w.color).multiplyScalar(1 - 0.3 * weather.wet);
  }
}
