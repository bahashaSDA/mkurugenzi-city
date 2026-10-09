import { create } from 'zustand';
import { useEconomy } from './economy';
import { playerPosition } from '../systems/player/playerState';

// GTA-style health: 0-100. Regenerates slowly up to half (GTA V), food tops it up, falls, cars and
// fights take it away. At 0 you're "WASTED": the screen fades, you wake at the nearest hospital
// and pay the bill (KSh), keeping everything else.
const KEY = 'mk.health.v1';
export const REGEN_CAP = 50;
const REGEN_PER_S = 0.8;
export const HOSPITAL_BILL = 500;

/** Hospitals (fictional; inspired-by): where you wake up after being WASTED. */
export const HOSPITALS = [
  { name: 'Wakurugenzi Hospital, CBD', x: 70, z: -1010 },
  { name: 'Mtaa Health Centre', x: 40, z: 95 },
  { name: 'Phil-It Town Clinic', x: 1060, z: 160 },
  { name: 'Utafraaaia Estate Clinic', x: -1020, z: -820 },
  { name: "Freddie's Town Dispensary", x: -980, z: 720 },
];

interface HealthState {
  hp: number;
  hurtAt: number; // performance.now() of the last hit (red flash, regen delay)
  wasted: { at: number; hospital: (typeof HOSPITALS)[number] } | null;
  damage: (n: number, why?: string) => void;
  heal: (n: number) => void;
  tick: (dt: number) => void;
  respawned: () => void;
}

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (localStorage.getItem(KEY) !== null && Number.isFinite(v) && v > 0) return Math.min(100, v);
  } catch {
    /* storage blocked */
  }
  return 100;
}

let saveT = 0;
export const useHealth = create<HealthState>((set, get) => ({
  hp: load(),
  hurtAt: 0,
  wasted: null,
  damage: (n, why) => {
    const s = get();
    if (s.wasted || n <= 0) return;
    const hp = Math.max(0, s.hp - n);
    set({ hp, hurtAt: performance.now() });
    if (hp <= 0) {
      const { x, z } = playerPosition;
      const hospital = HOSPITALS.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));
      set({ wasted: { at: performance.now(), hospital } });
      if (why) useEconomy.getState().toast(why, 'info');
    }
  },
  heal: (n) => set((s) => ({ hp: Math.min(100, s.hp + n) })),
  tick: (dt) => {
    const s = get();
    if (s.wasted) return;
    if (s.hp < REGEN_CAP && performance.now() - s.hurtAt > 6000) set({ hp: Math.min(REGEN_CAP, s.hp + REGEN_PER_S * dt) });
    saveT += dt;
    if (saveT > 5) {
      saveT = 0;
      try {
        localStorage.setItem(KEY, String(Math.round(get().hp)));
      } catch {
        /* ignore */
      }
    }
  },
  respawned: () => {
    const eco = useEconomy.getState();
    const bill = Math.min(HOSPITAL_BILL, eco.money);
    if (bill > 0) eco.spend(bill, 'Hospital bill');
    set({ wasted: null, hp: 100, hurtAt: 0 });
  },
}));
