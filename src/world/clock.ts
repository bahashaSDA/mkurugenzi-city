import { create } from 'zustand';

// GTA V time: one in-game minute every 2 real seconds, so a full day lasts 48 real minutes.
// Nairobi: sunrise ~06:30, sunset ~18:45 (sun.ts does the real solar geometry).
// ?time=21.5 starts at 21:30 (tests, screenshots); ?freeze stops the clock.
export const GAME_MINUTE_SECONDS = 2;
const HOURS_PER_SECOND = 1 / 60 / GAME_MINUTE_SECONDS;
const KEY = 'mk.clock.v1';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const fromUrl = Number(params.get('time'));
const frozen = params.has('freeze');

function initial(): number {
  if (params.has('time') && Number.isFinite(fromUrl)) return ((fromUrl % 24) + 24) % 24;
  try {
    const v = Number(localStorage.getItem(KEY));
    if (localStorage.getItem(KEY) !== null && Number.isFinite(v)) return v;
  } catch {
    /* storage blocked */
  }
  return 9.0; // first visit: a bright Nairobi morning
}

/** Mutable clock read every frame by the renderer (no React re-render per frame). */
export const clock = { hours: initial(), day: 1, speed: frozen ? 0 : 1 };

/** Coarse copy for the UI (updates once per in-game minute). */
export const useClock = create<{ hours: number; set: (h: number) => void }>((set) => ({
  hours: clock.hours,
  set: (hours) => set({ hours }),
}));

let lastMinute = -1;
let saveT = 0;
export function advanceClock(dt: number) {
  clock.hours += dt * HOURS_PER_SECOND * clock.speed;
  if (clock.hours >= 24) {
    clock.hours -= 24;
    clock.day++;
  }
  const minute = Math.floor(clock.hours * 60);
  if (minute !== lastMinute) {
    lastMinute = minute;
    useClock.getState().set(clock.hours);
  }
  saveT += dt;
  if (saveT > 10) {
    saveT = 0;
    try {
      localStorage.setItem(KEY, clock.hours.toFixed(3));
    } catch {
      /* ignore */
    }
  }
}

/** Skip ahead (sleeping, waiting for a mission window). */
export function skipTo(hours: number) {
  clock.hours = ((hours % 24) + 24) % 24;
  lastMinute = -1;
}

export function formatClock(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 0 at full night, 1 in full daylight, smooth across dawn (05:45-07:15) and dusk (18:00-19:30). */
export function daylight(h: number): number {
  const s = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return s(5.75, 7.25, h) * (1 - s(18.0, 19.5, h));
}

/** Street lights, windows and headlights switch on through dusk and off after dawn. */
export function lightsOn(h: number): number {
  return 1 - Math.min(1, Math.max(0, (daylight(h) - 0.15) / 0.35));
}
