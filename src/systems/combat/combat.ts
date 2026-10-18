import { playerAnim } from '../player/AbelModel';
import { occ } from '../vehicles/occupancy';
import { playerPosition, playerView } from '../player/playerState';
import { input } from '../input';
import { drive } from '../driving/state';
import { ride } from '../vehicles/state';
import { useHealth } from '../../game/health';
import { useCutscene } from '../../game/cutscene';
import { emit } from '../../game/events';
import { thump, whoosh } from '../audio/stingers';
import { useEconomy } from '../../game/economy';
import { create } from 'zustand';

export type StreetMood = 'flee' | 'fight' | 'mug';
interface StreetSpawn {
  id: number;
  x: number;
  z: number;
  mood: StreetMood;
  until: number;
}

/** People thrown into the street by events (a carjacked driver): they run or fight. */
export const useStreetSpawns = create<{ list: StreetSpawn[]; add: (x: number, z: number, mood: StreetMood) => void; prune: () => void }>((set, get) => ({
  list: [],
  add: (x, z, mood) => set({ list: [...get().list.slice(-3), { id: Math.random(), x, z, mood, until: performance.now() + 45000 }] }),
  prune: () => {
    const now = performance.now();
    if (get().list.some((p) => p.until < now)) set({ list: get().list.filter((p) => p.until >= now) });
  },
}));

// GTA-style melee: fists and feet only, no weapons. People get hurt (they fall, lie there, get
// up and limp away; Abel loses health and limps when it is low), nobody dies on the street.
//   Abel: punch combos (jab -> cross -> hook), a front kick, a guard that soaks most of a hit,
//         and a soft lock-on that turns him toward the nearest opponent.
//   Street people: hit one and they fight back or run; bystanders scatter.
//   Mission opponents: hostile from the start; each knock-out counts for the objective.

export type CombatState = 'calm' | 'fight' | 'flee' | 'down' | 'getup';

export interface Combatant {
  id: number;
  x: number;
  z: number;
  rotY: number;
  hp: number;
  maxHp: number;
  toughness: number;
  state: CombatState;
  tag: 'street' | 'mission';
  /** One-shot clip the NPC should play now, and until when. */
  clip: string;
  clipUntil: number;
  stateUntil: number;
  nextAttack: number;
  hitAt: number;
  pendingHit: number; // when its punch lands on Abel (0: none)
  knockedOut: boolean;
  name: string;
  /** a Kibera mugger: he goes for Abel's wallet, then runs with it */
  mugger?: boolean;
  /** what he took (KSh): Abel gets it back if he puts him down */
  loot?: number;
}

export const combatants = new Map<number, Combatant>();
let nextId = 1;

export function addCombatant(init: Partial<Combatant> & { x: number; z: number }): Combatant {
  const c: Combatant = {
    id: nextId++, rotY: 0, hp: 100, maxHp: 100, toughness: 1, state: 'calm', tag: 'street', clip: '', clipUntil: 0, stateUntil: 0,
    nextAttack: 0, hitAt: 0, pendingHit: 0, knockedOut: false, name: '', ...init,
  };
  c.maxHp = c.hp;
  combatants.set(c.id, c);
  return c;
}

export function removeCombatant(id: number) {
  combatants.delete(id);
}
/** (Re-)register a combatant: effects mount twice in React dev, so the mount puts it back. */
export function keepCombatant(c: Combatant) {
  combatants.set(c.id, c);
  return () => removeCombatant(c.id);
}

// ------------------------------------------------------------------ Abel's attacks
const PUNCHES: { clip: string; ms: number; impact: number; dmg: number; reach: number }[] = [
  { clip: 'Punch_L', ms: 420, impact: 170, dmg: 11, reach: 1.75 },
  { clip: 'Punch_R', ms: 500, impact: 190, dmg: 15, reach: 1.85 },
  { clip: 'Punch_Cross', ms: 560, impact: 230, dmg: 20, reach: 1.9 },
];
const KICK = { clip: 'Kick', ms: 630, impact: 300, dmg: 24, reach: 2.15 };
const COMBO_WINDOW = 900;
const LOCK_RANGE = 4;

const combo = { i: 0, last: 0, busyUntil: 0 };
const pending: { at: number; dmg: number; reach: number }[] = [];

function canFight() {
  return !drive.active && ride.vehicle < 0 && occ.phase === 'walking' && !playerAnim.swimming && !playerAnim.down && !useHealth.getState().wasted && !useCutscene.getState().active;
}

/** Nearest opponent in front (within the cone) or, failing that, anyone close: soft lock-on. */
function target(reach: number): Combatant | null {
  let best: Combatant | null = null;
  let bestScore = Infinity;
  for (const c of combatants.values()) {
    if (c.state === 'down' || c.state === 'getup') continue;
    const dx = c.x - playerPosition.x;
    const dz = c.z - playerPosition.z;
    const d = Math.hypot(dx, dz);
    if (d > Math.max(reach, LOCK_RANGE)) continue;
    let a = Math.atan2(dx, dz) - playerView.facing;
    a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    const score = d + a * 1.5 + (c.state === 'fight' ? -0.5 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function playerAttack(kind: 'punch' | 'kick') {
  const now = performance.now();
  if (!canFight() || now < combo.busyUntil) return;
  const move = kind === 'kick' ? KICK : PUNCHES[(combo.i = now - combo.last < COMBO_WINDOW ? (combo.i + 1) % 3 : 0)]!;
  combo.last = now;
  combo.busyUntil = now + move.ms * 0.8;
  playerAnim.combat = move.clip;
  playerAnim.combatUntil = now + move.ms;
  const t = target(move.reach);
  if (t) {
    playerAnim.faceTo = Math.atan2(t.x - playerPosition.x, t.z - playerPosition.z);
    playerAnim.faceUntil = now + move.ms;
  }
  pending.push({ at: now + move.impact, dmg: move.dmg, reach: move.reach });
}

function land(dmg: number, reach: number) {
  const t = target(reach);
  const d = t ? Math.hypot(t.x - playerPosition.x, t.z - playerPosition.z) : Infinity;
  if (!t || d > reach) {
    whoosh();
    return;
  }
  const guarded = t.state === 'fight' && Math.random() < 0.18 * t.toughness;
  const hit = guarded ? dmg * 0.35 : dmg;
  t.hp -= hit;
  t.hitAt = performance.now();
  thump(hit / 15);
  // knock back a little, away from Abel
  const k = (guarded ? 0.15 : 0.45) / Math.max(0.5, d);
  t.x += (t.x - playerPosition.x) * k;
  t.z += (t.z - playerPosition.z) * k;
  if (t.hp <= 0) {
    knockDown(t);
    return;
  }
  if (t.state === 'calm' || t.state === 'flee') {
    // a street person who gets hit: most run, some fight back
    if (t.tag === 'mission' || Math.random() < 0.4) startFight(t);
    else flee(t, 9000);
  }
  scatterBystanders(t);
}

function knockDown(c: Combatant) {
  c.state = 'down';
  c.clip = 'Knockdown';
  c.clipUntil = performance.now() + 800;
  c.stateUntil = performance.now() + (c.tag === 'mission' ? 1e9 : 7000 + Math.random() * 4000);
  c.pendingHit = 0;
  if (c.loot) {
    // the wallet comes back off the man who ran with it
    useEconomy.getState().earn(c.loot, 'Got your money back');
    c.loot = 0;
  }
  if (!c.knockedOut) {
    c.knockedOut = true;
    emit({ type: 'knockout', npc: c.id, tag: c.tag });
    if (c.tag === 'street') useEconomy.getState().toast(pickLine(KO_LINES), 'info');
  }
}

export function startFight(c: Combatant) {
  c.state = 'fight';
  c.nextAttack = performance.now() + 700 + Math.random() * 600;
}

export function flee(c: Combatant, ms: number) {
  c.state = 'flee';
  c.stateUntil = performance.now() + ms;
}

function scatterBystanders(victim: Combatant) {
  for (const c of combatants.values()) {
    if (c === victim || c.state !== 'calm' || c.tag !== 'street') continue;
    if (Math.hypot(c.x - victim.x, c.z - victim.z) < 14) flee(c, 6000 + Math.random() * 4000);
  }
}

const KO_LINES = ['Sawa sawa! Nimekubali!', 'Aki, wacha! Mimi ni fan yako!', 'Mkurugenzi... hii story utaiambia aje?', 'Nitakuripoti kwa podcast!'];
const pickLine = (l: string[]) => l[Math.floor(Math.random() * l.length)]!;

// ------------------------------------------------------------------ Kibera muggings
const RUN_LINES = ['Tumekula! Kimbia!', 'Pesa ni yetu, boss!', 'Asante kwa mchango, Mkurugenzi!'];
/** force: ?debug tests start one now */
export const mugging = { active: false, robbed: false, startedAt: 0, force: false };

/** A mugger's punch landed: he grabs part of Abel's cash and the gang runs with it. */
function rob(c: Combatant) {
  if (mugging.robbed) return;
  const eco = useEconomy.getState();
  if (eco.money <= 0) return;
  const take = Math.min(eco.money, Math.max(50, Math.round((eco.money * (0.3 + Math.random() * 0.25)) / 10) * 10));
  useEconomy.setState({ money: eco.money - take });
  eco.toast(`Mugged! They took KSh ${take.toLocaleString()} · put him down to get it back`, 'spend');
  mugging.robbed = true;
  c.loot = take;
  for (const o of combatants.values()) if (o.mugger && o.state === 'fight') flee(o, 25000);
  useEconomy.getState().toast(pickLine(RUN_LINES), 'info');
}

/** Called once per frame by CombatDirector: Abel's punches land, opponents' punches land. */
export function updateCombat() {
  const now = performance.now();
  for (let i = pending.length - 1; i >= 0; i--) {
    if (now >= pending[i]!.at) {
      const p = pending.splice(i, 1)[0]!;
      if (canFight()) land(p.dmg, p.reach);
    }
  }
  for (const c of combatants.values()) {
    if (c.pendingHit && now >= c.pendingHit) {
      c.pendingHit = 0;
      const d = Math.hypot(c.x - playerPosition.x, c.z - playerPosition.z);
      if (d < 1.9 && c.state === 'fight' && canFight()) {
        const raw = (5 + Math.random() * 5) * c.toughness;
        const dmg = input.guard ? raw * 0.25 : raw;
        useHealth.getState().damage(dmg, c.mugger ? 'Mugged in Kibera.' : 'You lost the fight.');
        playerAnim.hitAt = now;
        thump(dmg / 12);
        // a mugger's clean hit (not blocked) takes the wallet
        if (c.mugger && (!input.guard || Math.random() < 0.25)) rob(c);
      }
    }
  }
}

/**
 * One NPC's fight brain for this frame. Returns where to move (m/s along x/z), which way to face
 * and the clip to show. Calm people return null (their normal life continues).
 */
export function fightBrain(c: Combatant, dt: number): { vx: number; vz: number; face: number | null; clip: string; rate: number } | null {
  const now = performance.now();
  if (c.clip && now < c.clipUntil) {
    const face = c.state === 'fight' ? Math.atan2(playerPosition.x - c.x, playerPosition.z - c.z) : null;
    return { vx: 0, vz: 0, face, clip: c.clip, rate: 1 };
  }
  c.clip = '';
  const dx = playerPosition.x - c.x;
  const dz = playerPosition.z - c.z;
  const d = Math.hypot(dx, dz) || 1;
  switch (c.state) {
    case 'calm':
      return null;
    case 'down':
      if (now > c.stateUntil) {
        c.state = 'getup';
        c.clip = 'GetUp';
        c.clipUntil = now + 3000;
        c.stateUntil = now + 3000;
        c.hp = c.maxHp * 0.35;
        return { vx: 0, vz: 0, face: null, clip: 'GetUp', rate: 1 };
      }
      return { vx: 0, vz: 0, face: null, clip: 'Down_Loop', rate: 1 };
    case 'getup':
      if (now > c.stateUntil) flee(c, 12000); // hurt: walk away slowly
      return { vx: 0, vz: 0, face: null, clip: 'Idle_Loop', rate: 1 };
    case 'flee': {
      if (now > c.stateUntil) {
        c.state = 'calm';
        return null;
      }
      const hurt = c.hp < c.maxHp * 0.5;
      const sp = hurt ? 1.1 : 3.2;
      return { vx: (-dx / d) * sp, vz: (-dz / d) * sp, face: Math.atan2(-dx, -dz), clip: hurt ? 'Walk_Slow_Loop' : 'Walk_Loop', rate: hurt ? 0.9 : 2.3 };
    }
    case 'fight': {
      if (useHealth.getState().wasted || d > 45) {
        c.state = 'calm';
        return null;
      }
      const face = Math.atan2(dx, dz);
      if (d > 1.35) {
        const sp = d > 6 ? 3.0 : 1.6;
        return { vx: (dx / d) * sp, vz: (dz / d) * sp, face, clip: 'Walk_Loop', rate: sp / 1.33 };
      }
      if (now > c.nextAttack && canFight()) {
        c.clip = 'Punch_R';
        c.clipUntil = now + 520;
        c.pendingHit = now + 230;
        c.nextAttack = now + (1500 - 250 * Math.min(2, c.toughness)) * (0.8 + Math.random() * 0.6);
        return { vx: 0, vz: 0, face, clip: 'Punch_R', rate: 1 };
      }
      void dt;
      return { vx: 0, vz: 0, face, clip: 'Fight_Idle_Loop', rate: 1 };
    }
  }
}

/** Mission opponents still standing near a spot (for the HUD/markers). */
export function standingNear(x: number, z: number, r: number) {
  let n = 0;
  for (const c of combatants.values()) if (c.tag === 'mission' && c.state !== 'down' && Math.hypot(c.x - x, c.z - z) < r) n++;
  return n;
}
