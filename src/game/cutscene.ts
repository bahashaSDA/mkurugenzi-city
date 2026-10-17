import { create } from 'zustand';
import { playerPosition, playerView } from '../systems/player/playerState';
import { heightAt } from '../world/heights';
import type { Line, MissionDef } from './missionData';

// GTA-style mission briefings: letterbox bars, the HUD hidden, a few cinematic shots while the
// characters talk. The last-but-one shot flies from Abel to the objective so you see where you are
// going. Space / Enter skips.

export type V3 = [number, number, number];
export interface Shot {
  seconds: number;
  from: V3; // camera position at the start of the shot
  to: V3; // ...and at the end (eased)
  lookFrom: V3;
  lookTo: V3;
  line?: Line;
  title?: string;
  subtitle?: string;
}

interface CutsceneState {
  active: boolean;
  shots: Shot[];
  startedAt: number;
  onEnd: (() => void) | null;
  play: (shots: Shot[], onEnd?: () => void) => void;
  skip: () => void;
  stop: () => void;
}

export const useCutscene = create<CutsceneState>((set, get) => ({
  active: false,
  shots: [],
  startedAt: 0,
  onEnd: null,
  play: (shots, onEnd) => set({ active: shots.length > 0, shots, startedAt: performance.now(), onEnd: onEnd ?? null }),
  skip: () => {
    const end = get().onEnd;
    set({ active: false, shots: [], onEnd: null });
    end?.();
  },
  stop: () => set({ active: false, shots: [], onEnd: null }),
}));

/** The line being voiced: a shot holds on its last frame until its speaker has finished. */
export const cutsceneVoice = { index: -1, speaking: false, held: 0 };

/** Which shot is playing and how far through it (0..1). Ends the cutscene when time is up. */
export function cutsceneNow(): { shot: Shot; t: number; index: number } | null {
  const s = useCutscene.getState();
  if (!s.active) return null;
  let e = (performance.now() - s.startedAt) / 1000;
  for (let i = 0; i < s.shots.length; i++) {
    const shot = s.shots[i]!;
    if (e < shot.seconds) return { shot, t: e / shot.seconds, index: i };
    // still talking: hold this shot (up to 8 s extra) instead of cutting the speaker off
    if (cutsceneVoice.index === i && cutsceneVoice.speaking && cutsceneVoice.held < 8) {
      const over = e - shot.seconds;
      cutsceneVoice.held += over;
      s.startedAt += over * 1000;
      return { shot, t: 1, index: i };
    }
    e -= shot.seconds;
  }
  s.skip();
  return null;
}

const readSeconds = (text: string) => Math.max(3.2, Math.min(7, 1.2 + text.length / 17));

function firstTarget(m: MissionDef): { x: number; z: number } | null {
  for (const st of m.steps) {
    const at = st.at?.();
    if (at) return at;
    if (st.spawn && 'at' in st.spawn) return st.spawn.at;
    if (st.spawn && 'from' in st.spawn) return st.spawn.from;
  }
  return null;
}

/** Briefing shots for a mission, built around where Abel stands and where the objective is. */
export function briefingShots(m: MissionDef): Shot[] {
  const p = { x: playerPosition.x, y: playerPosition.y - 0.85, z: playerPosition.z };
  const f = playerView.facing; // Abel's facing (radians, +Z forward at 0)
  const fx = Math.sin(f);
  const fz = Math.cos(f);
  const head: V3 = [p.x, p.y + 1.6, p.z];
  const target = firstTarget(m);
  const lines = m.lines.length ? m.lines : [{ who: m.giver, text: m.title }];
  const shots: Shot[] = [];
  // 1: slow push-in on Abel from the front three-quarter, with the title card
  shots.push({
    seconds: readSeconds(lines[0]!.text) + 0.8,
    from: [p.x + fx * 4.2 + fz * 2.2, p.y + 1.9, p.z + fz * 4.2 - fx * 2.2],
    to: [p.x + fx * 2.6 + fz * 1.4, p.y + 1.75, p.z + fz * 2.6 - fx * 1.4],
    lookFrom: head,
    lookTo: head,
    line: lines[0],
    title: m.title,
  });
  // 2: over-the-shoulder the other way for the reply
  if (lines[1]) {
    shots.push({
      seconds: readSeconds(lines[1].text),
      from: [p.x - fx * 2.4 - fz * 1.6, p.y + 1.8, p.z - fz * 2.4 + fx * 1.6],
      to: [p.x - fx * 2.0 - fz * 2.4, p.y + 1.7, p.z - fz * 2.0 + fx * 2.4],
      lookFrom: [p.x + fx * 3, p.y + 1.5, p.z + fz * 3],
      lookTo: [p.x + fx * 3, p.y + 1.4, p.z + fz * 3],
      line: lines[1],
    });
  }
  // 3: crane up and fly toward the objective (shows where to go), then a ground reveal there
  if (target && Math.hypot(target.x - p.x, target.z - p.z) > 25) {
    const ty = heightAt(target.x, target.z);
    const dist = Math.hypot(target.x - p.x, target.z - p.z);
    const up = Math.min(140, 35 + dist * 0.12);
    shots.push({
      seconds: Math.max(4, Math.min(6.5, 3 + dist / 400)),
      from: [p.x, p.y + 12, p.z],
      to: [target.x - (target.x - p.x) * 0.25 / Math.max(1, dist / 100), ty + up, target.z - (target.z - p.z) * 0.25 / Math.max(1, dist / 100) + 30],
      lookFrom: head,
      lookTo: [target.x, ty, target.z],
      line: lines[2],
      subtitle: lines[2] ? undefined : 'Your next stop',
    });
    shots.push({
      seconds: 3.4,
      from: [target.x + 16, ty + 6, target.z + 16],
      to: [target.x + 9, ty + 3.5, target.z - 8],
      lookFrom: [target.x, ty + 1.5, target.z],
      lookTo: [target.x, ty + 1.5, target.z],
      line: lines[3],
    });
  } else if (lines[2]) {
    shots.push({
      seconds: readSeconds(lines[2].text),
      from: [p.x + fz * 5, p.y + 3, p.z - fx * 5],
      to: [p.x + fz * 4, p.y + 2.2, p.z - fx * 4 + 2],
      lookFrom: head,
      lookTo: head,
      line: lines[2],
    });
  }
  // 4: back behind Abel, ready to play
  shots.push({
    seconds: 1.6,
    from: [p.x - fx * 6, p.y + 3.2, p.z - fz * 6],
    to: [p.x - fx * 4.2, p.y + 2.1, p.z - fz * 4.2],
    lookFrom: head,
    lookTo: head,
  });
  return shots;
}
