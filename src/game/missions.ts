import { create } from 'zustand';
import { playerPosition } from '../systems/player/playerState';
import { playerAnim } from '../systems/player/AbelModel';
import { useEconomy } from './economy';
import { emit, listen, type GameEvent } from './events';
import { MISSION_LIST, type MissionDef, type Step } from './missionData';
import { useCutscene, briefingShots } from './cutscene';
import { useHealth } from './health';

export type { MissionDef, Step } from './missionData';

// GTA-style missions. Each starts at a yellow "M" marker (E): a letterboxed cinematic briefing,
// then one objective at a time with a waypoint, a timer when it matters, and KSh on completion.
// The player is never shown how many missions exist: only the next few givers are on the map.
export const MISSIONS: MissionDef[] = MISSION_LIST;
const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
const VISIBLE_GIVERS = 3;

interface Banner {
  kind: 'passed' | 'failed';
  title: string;
  detail: string;
  until: number;
  retry?: string;
}

interface MissionState {
  active: string | null;
  step: number;
  counter: number;
  startedAt: number;
  stepStartedAt: number;
  stepFrom: { x: number; z: number };
  stepTimer: number | null; // seconds allowed for the current step
  completed: string[];
  waypoint: { x: number; z: number } | null; // map click (GTA waypoint)
  dialogue: { name: string; text: string; until: number } | null;
  objectiveShownAt: number;
  banner: Banner | null;
  begin: (id: string) => void;
  advance: () => void;
  fail: (why: string) => void;
  setWaypoint: (w: { x: number; z: number } | null) => void;
  say: (name: string, text: string, ms?: number) => void;
  bump: (n?: number) => void;
}

const KEY = 'mk.missions.v1';
function loadCompleted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function startStep(set: (p: Partial<MissionState>) => void, m: MissionDef, i: number) {
  const step = m.steps[i];
  const from = { x: playerPosition.x, z: playerPosition.z };
  set({
    step: i,
    counter: 0,
    stepStartedAt: performance.now(),
    stepFrom: from,
    stepTimer: step?.timer ? step.timer(from) : null,
    objectiveShownAt: performance.now(),
  });
}

export const useMissions = create<MissionState>((set, get) => ({
  active: null,
  step: 0,
  counter: 0,
  startedAt: 0,
  stepStartedAt: 0,
  stepFrom: { x: 0, z: 0 },
  stepTimer: null,
  completed: loadCompleted(),
  waypoint: null,
  dialogue: null,
  objectiveShownAt: 0,
  banner: null,
  begin: (id) => {
    const m = BY_ID.get(id);
    if (!m || get().active) return;
    set({ active: id, startedAt: performance.now(), banner: null });
    startStep(set, m, 0);
    // the cinematic briefing; the first objective (and its timer) starts when it ends
    useCutscene.getState().play(briefingShots(m), () => startStep(set, m, 0));
  },
  advance: () => {
    const m = BY_ID.get(get().active ?? '');
    if (!m) return;
    const next = get().step + 1;
    if (next < m.steps.length) {
      startStep(set, m, next);
      return;
    }
    const completed = [...new Set([...get().completed, m.id])];
    set({ active: null, step: 0, counter: 0, completed, stepTimer: null });
    try {
      localStorage.setItem(KEY, JSON.stringify(completed));
    } catch {
      /* storage blocked */
    }
    useEconomy.getState().earn(m.reward, `Mission passed: ${m.title}`);
    set({ banner: { kind: 'passed', title: 'MISSION PASSED', detail: `${m.title}  ·  +KSh ${m.reward.toLocaleString()}`, until: performance.now() + 6500 } });
    emit({ type: 'missionPassed', id: m.id });
  },
  fail: (why) => {
    const id = get().active;
    set({ active: null, step: 0, counter: 0, stepTimer: null });
    useCutscene.getState().stop();
    set({ banner: { kind: 'failed', title: 'MISSION FAILED', detail: why, until: performance.now() + 9000, retry: id ?? undefined } });
    emit({ type: 'missionFailed', id: id ?? '' });
  },
  setWaypoint: (waypoint) => set({ waypoint }),
  say: (name, text, ms = 4500) => set({ dialogue: { name, text, until: performance.now() + ms } }),
  bump: (n = 1) => set((s) => ({ counter: s.counter + n })),
}));

export function currentStep(): { mission: MissionDef; step: Step } | null {
  const s = useMissions.getState();
  const mission = BY_ID.get(s.active ?? '');
  const step = mission?.steps[s.step];
  return mission && step ? { mission, step } : null;
}

/** The next few missions not done yet: each shows its giver's marker (GTA style). */
export function availableMissions(): MissionDef[] {
  const done = new Set(useMissions.getState().completed);
  const out: MissionDef[] = [];
  for (const m of MISSIONS) {
    if (done.has(m.id)) continue;
    out.push(m);
    if (out.length >= VISIBLE_GIVERS) break;
  }
  return out;
}

export function missionsCompleted(): number {
  return useMissions.getState().completed.length;
}

/** Seconds left on the running step's clock (null: untimed). */
export function timeLeft(): number | null {
  const s = useMissions.getState();
  if (s.stepTimer == null || useCutscene.getState().active) return null;
  return Math.max(0, s.stepTimer - (performance.now() - s.stepStartedAt) / 1000);
}

/** Called a few times per second by GameLogic, and on every game event. */
export function checkMission(e: GameEvent | null) {
  const cur = currentStep();
  if (!cur || useCutscene.getState().active) return;
  const s = useMissions.getState();
  const { mission, step } = cur;
  if (useHealth.getState().wasted) {
    s.fail('You were wasted.');
    return;
  }
  const left = timeLeft();
  if (left !== null && left <= 0) {
    s.fail('You ran out of time.');
    return;
  }
  const at = step.at?.();
  const inside = at ? Math.hypot(playerPosition.x - at.x, playerPosition.z - at.z) < at.r : true;
  // counters: people talked to in the area, opponents knocked out, items collected
  if (step.count && e) {
    const counts =
      (e.type === 'talk' && step.counterLabel === 'people' && inside) ||
      (e.type === 'knockout' && e.tag === 'mission') ||
      (e.type === 'collect' && e.tag === 'mission');
    if (counts) {
      s.bump();
      const n = useMissions.getState().counter;
      useEconomy.getState().toast(`${n}/${step.count} ${step.counterLabel ?? ''}`.trim(), 'info');
    }
  }
  const ctx = { counter: useMissions.getState().counter, stepStartedAt: s.stepStartedAt, stepFrom: s.stepFrom };
  if (step.swim && !playerAnim.swimming) return;
  if (step.action) {
    if (e?.type === 'use' && e.id === `mission:${mission.id}:${s.step}` && inside) s.advance();
    return;
  }
  if (step.done) {
    if (inside && step.done(e, ctx)) s.advance();
    return;
  }
  if (inside) s.advance();
}

listen((e) => checkMission(e));

/** E at a mission spot (used by the current step's interactable). */
export function useMissionAction() {
  const s = useMissions.getState();
  if (s.active) emit({ type: 'use', id: `mission:${s.active}:${s.step}` });
}

/** E on the MISSION FAILED screen: try again from the start. */
export function retryMission() {
  const b = useMissions.getState().banner;
  if (b?.kind === 'failed' && b.retry && performance.now() < b.until) {
    useMissions.setState({ banner: null });
    useMissions.getState().begin(b.retry);
    return true;
  }
  return false;
}
