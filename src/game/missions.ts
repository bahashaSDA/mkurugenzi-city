import { create } from 'zustand';
import { getHubLayout } from '../districts/hub/layout';
import { LANDMARKS } from '../districts/towns/layout';
import { KIBERA_HALLS } from '../districts/kibera/layout';
import { playerPosition } from '../systems/player/playerState';
import { drive } from '../systems/driving/state';
import { ride } from '../systems/vehicles/state';
import { useEconomy } from './economy';
import { emit, listen, type GameEvent } from './events';

// GTA-style missions in Mkurugenzi's world. Each mission starts at a yellow "M" marker (E), shows
// one objective at a time with a waypoint on the map, and pays KSh on completion.

export interface Step {
  text: string;
  /** Where to go (waypoint + glowing marker). */
  at?: () => { x: number; z: number; r: number };
  /** Optional E action at the spot (label shown in the prompt). */
  action?: string;
  /** Extra condition to finish the step (default: reached `at`, or used its action). */
  done?: (e: GameEvent | null, m: MissionState) => boolean;
  /** Must be in a car for this step. */
  needCar?: boolean;
}

export interface MissionDef {
  id: string;
  title: string;
  giver: string;
  intro: string;
  start: () => { x: number; z: number };
  reward: number;
  steps: Step[];
  timeLimit?: number; // seconds for the whole mission
}

interface MissionState {
  active: string | null;
  step: number;
  counter: number;
  startedAt: number;
  completed: string[];
  waypoint: { x: number; z: number } | null; // map click (GTA waypoint)
  dialogue: { name: string; text: string; until: number } | null;
  begin: (id: string) => void;
  advance: () => void;
  fail: (why: string) => void;
  setWaypoint: (w: { x: number; z: number } | null) => void;
  say: (name: string, text: string, ms?: number) => void;
}

function piecePos(piece: string, fallback: { x: number; z: number }) {
  const p = getHubLayout().find((q) => q.piece === piece);
  return p ? { x: p.x + Math.sin(p.rotY) * 6, z: p.z + Math.cos(p.rotY) * 6 } : fallback;
}
const lm = (name: string, fb: { x: number; z: number }) => LANDMARKS[name] ?? fb;
const near = (r: number, p: { x: number; z: number }) => ({ ...p, r });

export const MISSIONS: MissionDef[] = [
  {
    id: 'chai',
    title: 'Chai ya Asubuhi',
    giver: 'Mama Wanjiku',
    intro: 'Mkurugenzi! Hujakunywa chai leo? Pita hoteli ya Chai Moto, ukunywe chai na mandazi kabla ya kazi.',
    start: () => ({ x: 10.5, z: 36 }), // on the pavement by the spawn, clear of shop doors
    reward: 300,
    steps: [
      { text: 'Walk to Chai Moto Hoteli', at: () => near(6, piecePos('shop_hoteli', { x: -6, z: -40 })) },
      { text: 'Buy and drink a chai at the hoteli (E)', done: (e) => e?.type === 'consume' && e.item === 'chai' },
    ],
  },
  {
    id: 'story-night',
    title: 'Story Night in Kibera',
    giver: 'Conductor Kevo',
    intro: 'Boss, leo kuna story mpya kwa video hall ya Kibera. Panda mat pale stage, shuka Kibera Main Lane.',
    start: () => ({ x: 20, z: 120 }),
    reward: 800,
    steps: [
      { text: 'Board a matatu at the stage (F)', at: () => near(10, { x: 10, z: 118 }), done: () => ride.vehicle >= 0 },
      { text: 'Get off at Kibera (Main lane)', at: () => near(40, { x: -145, z: 20 }), done: (e) => e?.type === 'alight' && Math.hypot(e.x + 145, e.z - 20) < 60 },
      { text: 'Watch tonight’s story at the video hall (E)', at: () => near(8, KIBERA_HALLS[0] ?? { x: -215, z: 8 }), done: (e) => e?.type === 'watch' },
    ],
  },
  {
    id: 'scout',
    title: 'Location Scout',
    giver: 'Phil-It Studios',
    intro: 'Mkurugenzi, the new film needs locations. Scout Rocky Ridge, the Storyteller’s Fire and Utafraaaia House. Chukua gari, ni mbali.',
    start: () => ({ x: -10, z: 96 }),
    reward: 2500,
    steps: [
      { text: 'Scout Rocky Ridge (E)', at: () => near(8, { x: 300, z: 420 }), action: 'Scout this location' },
      { text: 'Scout the Storyteller’s Fire on the hills (E)', at: () => near(8, lm("Storyteller's Fire", { x: 340, z: 1215 })), action: 'Scout this location' },
      { text: 'Scout Utafraaaia House (E)', at: () => near(10, { x: -1100, z: -1300 }), action: 'Scout this location' },
    ],
  },
  {
    id: 'merch',
    title: 'Merch Delivery',
    giver: 'Utafraaaia Boutique',
    intro: 'Order ya hoodies imefika! Peleka box hii kwa customer Freddie’s School Town. Haraka, ana event jioni.',
    start: () => piecePos('shop_boutique', { x: -6, z: 60 }),
    reward: 1500,
    timeLimit: 420,
    steps: [
      { text: 'Pick up the box of hoodies (E)', at: () => near(5, piecePos('shop_boutique', { x: -6, z: 60 })), action: 'Pick up the merch box' },
      { text: 'Get a car (F at a parked car’s driver door)', done: () => drive.active, needCar: true },
      { text: 'Deliver to Freddie’s School Town (E)', at: () => near(10, { x: -1046, z: 760 }), action: 'Hand over the merch box' },
    ],
  },
  {
    id: 'casting',
    title: 'Casting Call',
    giver: 'Mkurugenzi himself',
    intro: 'The next story needs real people. Talk to three people at the market and invite them to auditions.',
    start: () => ({ x: -16, z: 62 }),
    reward: 1200,
    steps: [
      { text: 'Go to the market', at: () => near(30, { x: -44, z: 62 }) },
      { text: 'Talk to 3 people in the market (E near someone)', done: (_e, m) => m.counter >= 3 },
    ],
  },
  {
    id: 'arena',
    title: 'Arena Night',
    giver: 'Wakurugenzi Fan Club',
    intro: 'Wakurugenzi wote wako Arena leo! Fika Wakurugenzi Arena, ingia mpaka katikati ya uwanja.',
    start: () => lm('Mkurugenzi Tower', { x: -18, z: -1100 }),
    reward: 2000,
    steps: [{ text: 'Get to the middle of Wakurugenzi Arena', at: () => near(14, lm('Wakurugenzi Arena', { x: 1185, z: -1140 })) }],
  },
  {
    id: 'podcast',
    title: 'Podcast Guest Pickup',
    giver: 'The Mkurugenzi Podcast',
    intro: 'Guest wetu yuko Phil-It Studios Town. Mchukue kwa gari, umlete Mkurugenzi Tower tufanye recording.',
    start: () => ({ x: 30, z: -1080 }),
    reward: 3000,
    steps: [
      { text: 'Get a car', done: () => drive.active, needCar: true },
      { text: 'Pick up the guest at Phil-It Studios Town', at: () => near(14, { x: 1100, z: 20 }), done: () => drive.active },
      { text: 'Drive the guest back to Mkurugenzi Tower', at: () => near(16, { x: 14, z: -1100 }), done: () => drive.active },
    ],
  },
];

const KEY = 'mk.missions.v1';
function loadCompleted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export const useMissions = create<MissionState>((set, get) => ({
  active: null,
  step: 0,
  counter: 0,
  startedAt: 0,
  completed: loadCompleted(),
  waypoint: null,
  dialogue: null,
  begin: (id) => {
    const m = MISSIONS.find((q) => q.id === id);
    if (!m || get().active) return;
    set({ active: id, step: 0, counter: 0, startedAt: performance.now() });
    get().say(m.giver, m.intro, 7000);
  },
  advance: () => {
    const m = MISSIONS.find((q) => q.id === get().active);
    if (!m) return;
    const next = get().step + 1;
    if (next < m.steps.length) {
      set({ step: next, counter: 0 });
      return;
    }
    const completed = [...new Set([...get().completed, m.id])];
    set({ active: null, step: 0, counter: 0, completed });
    try {
      localStorage.setItem(KEY, JSON.stringify(completed));
    } catch {
      /* storage blocked */
    }
    useEconomy.getState().earn(m.reward, `Mission passed: ${m.title}`);
    get().say(m.giver, 'Asante sana, Mkurugenzi! Kazi safi.', 4000);
  },
  fail: (why) => {
    set({ active: null, step: 0, counter: 0 });
    useEconomy.getState().toast(`Mission failed: ${why}`, 'info');
  },
  setWaypoint: (waypoint) => set({ waypoint }),
  say: (name, text, ms = 4500) => set({ dialogue: { name, text, until: performance.now() + ms } }),
}));

export function currentStep(): { mission: MissionDef; step: Step } | null {
  const s = useMissions.getState();
  const mission = MISSIONS.find((q) => q.id === s.active);
  const step = mission?.steps[s.step];
  return mission && step ? { mission, step } : null;
}

/** Missions not done yet: each has its giver's marker on the map (GTA style). */
export function availableMissions(): MissionDef[] {
  const done = useMissions.getState().completed;
  return MISSIONS.filter((m) => !done.includes(m.id));
}

/** Called a few times per second by GameLogic, and on every game event. */
export function checkMission(e: GameEvent | null) {
  const cur = currentStep();
  if (!cur) return;
  const s = useMissions.getState();
  const { mission, step } = cur;
  if (mission.timeLimit && (performance.now() - s.startedAt) / 1000 > mission.timeLimit) {
    s.fail('out of time');
    return;
  }
  if (e?.type === 'talk' && mission.id === 'casting' && e.area.includes('market')) {
    useMissions.setState({ counter: s.counter + 1 });
    useEconomy.getState().toast(`Casting: ${s.counter + 1}/3 people invited`, 'info');
  }
  const at = step.at?.();
  const inside = at ? Math.hypot(playerPosition.x - at.x, playerPosition.z - at.z) < at.r : true;
  if (step.action) {
    if (e?.type === 'use' && e.id === `mission:${mission.id}:${s.step}` && inside) s.advance();
    return;
  }
  if (step.done) {
    if (inside && step.done(e, useMissions.getState())) s.advance();
    return;
  }
  if (inside) s.advance();
}

listen((e) => checkMission(e));

/** E at a mission spot (used by GameLogic's interactable for the current step). */
export function useMissionAction() {
  const s = useMissions.getState();
  if (s.active) emit({ type: 'use', id: `mission:${s.active}:${s.step}` });
}
