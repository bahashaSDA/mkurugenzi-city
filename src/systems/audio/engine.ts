import { brownBuffer, noiseBuffer } from './mixer';

// Engine sound, synthesised from the physics (original, no recordings): one engine CYCLE (two
// crank turns, one firing pulse per cylinder, each pulse slightly different like a real engine) is
// rendered into a looping buffer and played back at a rate that follows the RPM. A gearbox model
// turns road speed into RPM, so you hear the revs climb, drop at each shift and settle at idle.
// Load (throttle) opens the filter and adds intake roar; a diesel clatters, the boda thumps.
//
// Nothing plays when the engine is off, and the level follows what the engine is doing: a matatu
// idling at a stage is a low burble, not the same loud drone as one pulling away.

export type EngineKind = 'petrol' | 'diesel' | 'heavy' | 'bike';

interface Profile {
  cyl: number;
  idle: number; // rpm
  shift: number; // rpm where it changes up
  gears: number[]; // top speed (m/s) of each gear at `shift` rpm
  clatter: number; // diesel knock in each pulse (0..1)
  body: number; // low-pass base (Hz)
  level: number;
  roadNoise: number;
}

const PROFILES: Record<EngineKind, Profile> = {
  petrol: { cyl: 4, idle: 800, shift: 4200, gears: [7, 13, 20, 28, 38, 50], clatter: 0.05, body: 420, level: 0.55, roadNoise: 0.35 },
  diesel: { cyl: 4, idle: 720, shift: 3200, gears: [5.5, 10, 16, 23, 32], clatter: 0.45, body: 330, level: 0.6, roadNoise: 0.4 },
  heavy: { cyl: 6, idle: 600, shift: 2300, gears: [3.5, 6.5, 10, 14, 19, 26], clatter: 0.6, body: 240, level: 0.75, roadNoise: 0.5 },
  bike: { cyl: 1, idle: 1400, shift: 7500, gears: [6, 11, 16, 21, 27], clatter: 0.1, body: 900, level: 0.5, roadNoise: 0.2 },
};

const BASE_RPM = 1000; // the cycle buffers are rendered at this rpm
const cycles = new Map<string, AudioBuffer>();

/** A few engine cycles at BASE_RPM: firing pulses with per-pulse variation, so the loop isn't a buzz. */
function cycleBuffer(ac: AudioContext, kind: EngineKind): AudioBuffer {
  const key = `${kind}@${ac.sampleRate}`;
  const hit = cycles.get(key);
  if (hit) return hit;
  const p = PROFILES[kind];
  const sr = ac.sampleRate;
  const cycleS = (2 * 60) / BASE_RPM; // two revolutions per 4-stroke cycle
  const N = 6; // cycles in the loop
  const len = Math.round(cycleS * N * sr);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let seed = kind.length * 7919;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pulses = p.cyl * N;
  for (let k = 0; k < pulses; k++) {
    // firing order spacing with a little unevenness (real engines are never perfectly even)
    const t0 = (k / pulses) * len + (rnd() - 0.5) * 0.04 * (len / pulses);
    const amp = 0.75 + rnd() * 0.5;
    const ring = 55 + rnd() * 25; // exhaust pulse resonance (Hz at base rpm)
    const decay = (p.cyl === 1 ? 0.018 : 0.009) * sr;
    const span = Math.min(len / pulses * 1.6, decay * 6);
    for (let i = 0; i < span; i++) {
      const idx = Math.floor(t0 + i) % len;
      const t = i / sr;
      const env = Math.exp(-i / decay);
      // the "whump" of each firing: a damped low oscillation plus a sharp edge and some grit
      let v = Math.sin(2 * Math.PI * ring * t) * env * 0.9 + (i < 12 ? 0.6 * (1 - i / 12) : 0);
      v += (rnd() * 2 - 1) * env * 0.25;
      // diesel knock: a bright tick at the start of combustion
      if (p.clatter && i < 0.0025 * sr) v += (rnd() * 2 - 1) * p.clatter * (1 - i / (0.0025 * sr)) * 1.4;
      d[idx]! += v * amp;
    }
  }
  // normalise, and soften the loop seam
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]!));
  for (let i = 0; i < len; i++) d[i]! /= peak || 1;
  cycles.set(key, buf);
  return buf;
}

/** Speed (m/s) and throttle -> rpm and gear, like an automatic box. */
export function gearbox(kind: EngineKind, speed: number, throttle: number, gear: number): { rpm: number; gear: number } {
  const p = PROFILES[kind];
  const v = Math.abs(speed);
  let g = gear;
  // change up at the top of a gear, down with hysteresis
  while (g < p.gears.length - 1 && v > p.gears[g]! * 0.97) g++;
  while (g > 0 && v < p.gears[g - 1]! * 0.72) g--;
  const top = p.gears[g]!;
  let rpm = (v / top) * p.shift;
  // in first (or when stopped) the clutch slips: revs follow the throttle
  const floor = p.idle + throttle * (g === 0 ? (p.shift - p.idle) * 0.45 : 0);
  rpm = Math.max(rpm, floor, p.idle);
  return { rpm: Math.min(rpm, p.shift * 1.15), gear: g };
}

export class EngineVoice {
  readonly output: GainNode;
  private src: AudioBufferSourceNode;
  private oct: AudioBufferSourceNode; // an octave up, quieter: richer harmonics
  private lp: BiquadFilterNode;
  private peak: BiquadFilterNode;
  private intake: GainNode;
  private intakeF: BiquadFilterNode;
  private road: GainNode;
  private roadF: BiquadFilterNode;
  private mainG: GainNode;
  private p: Profile;
  gear = 0;
  rpm = 0;

  constructor(private ac: AudioContext, readonly kind: EngineKind, dest: AudioNode) {
    this.p = PROFILES[kind];
    const buf = cycleBuffer(ac, kind);
    this.output = ac.createGain();
    this.output.gain.value = 0;
    this.output.connect(dest);
    this.mainG = ac.createGain();
    this.lp = ac.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.9;
    this.peak = ac.createBiquadFilter();
    this.peak.type = 'peaking';
    this.peak.frequency.value = this.p.body * 0.6;
    this.peak.gain.value = 5;
    this.peak.Q.value = 1.2;
    this.src = ac.createBufferSource();
    this.src.buffer = buf;
    this.src.loop = true;
    this.oct = ac.createBufferSource();
    this.oct.buffer = buf;
    this.oct.loop = true;
    const octG = ac.createGain();
    octG.gain.value = kind === 'bike' ? 0.25 : 0.15;
    this.src.connect(this.peak);
    this.oct.connect(octG).connect(this.peak);
    this.peak.connect(this.lp).connect(this.mainG).connect(this.output);
    // intake / turbo whoosh under load
    const n = ac.createBufferSource();
    n.buffer = noiseBuffer(ac);
    n.loop = true;
    this.intakeF = ac.createBiquadFilter();
    this.intakeF.type = 'bandpass';
    this.intakeF.Q.value = 0.8;
    this.intake = ac.createGain();
    this.intake.gain.value = 0;
    n.connect(this.intakeF).connect(this.intake).connect(this.output);
    // tyres on tarmac: grows with speed, independent of the engine
    const r = ac.createBufferSource();
    r.buffer = brownBuffer(ac);
    r.loop = true;
    this.roadF = ac.createBiquadFilter();
    this.roadF.type = 'lowpass';
    this.road = ac.createGain();
    this.road.gain.value = 0;
    r.connect(this.roadF).connect(this.road).connect(this.output);
    const t = ac.currentTime + Math.random() * 0.05;
    this.src.start(t, Math.random() * buf.duration);
    this.oct.start(t, Math.random() * buf.duration);
    n.start(t, Math.random());
    r.start(t, Math.random() * 3);
    this.update(0, 0, true);
  }

  /**
   * speed m/s (signed), throttle 0..1, running = engine on. level scales the whole voice (distance
   * pools fade voices in and out with it).
   */
  update(speed: number, throttle: number, running: boolean, level = 1) {
    const t = this.ac.currentTime;
    const p = this.p;
    const gb = gearbox(this.kind, speed, throttle, this.gear);
    const shifted = gb.gear !== this.gear;
    this.gear = gb.gear;
    this.rpm = gb.rpm;
    const rate = gb.rpm / BASE_RPM;
    this.src.playbackRate.setTargetAtTime(rate, t, shifted ? 0.09 : 0.05);
    this.oct.playbackRate.setTargetAtTime(rate * 2, t, shifted ? 0.09 : 0.05);
    const load = Math.max(0, Math.min(1, throttle));
    const r01 = Math.min(1, (gb.rpm - p.idle) / (p.shift - p.idle));
    this.lp.frequency.setTargetAtTime(p.body + r01 * p.body * 2.5 + load * 1400, t, 0.06);
    // idle is a low burble; pulling away is loud; coasting is in between
    const engineLevel = running ? p.level * (0.32 + 0.38 * r01 + 0.35 * load) : 0;
    this.mainG.gain.setTargetAtTime(engineLevel * (shifted ? 0.6 : 1), t, shifted ? 0.04 : 0.08);
    this.intakeF.frequency.setTargetAtTime(600 + r01 * 2200, t, 0.08);
    this.intake.gain.setTargetAtTime(running ? load * r01 * 0.12 : 0, t, 0.1);
    const v = Math.abs(speed);
    this.roadF.frequency.setTargetAtTime(250 + v * 18, t, 0.2);
    this.road.gain.setTargetAtTime(Math.min(1, v / 25) * p.roadNoise, t, 0.2);
    this.output.gain.setTargetAtTime(level, t, 0.25);
  }

  /** Fade out and free. */
  dispose(fade = 0.5) {
    const t = this.ac.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setTargetAtTime(0, t, fade / 3);
    setTimeout(() => {
      try {
        this.src.stop();
        this.oct.stop();
      } catch {
        /* already stopped */
      }
      this.output.disconnect();
    }, fade * 1000 + 300);
  }
}

/** Engine kind of a traffic vehicle / kit piece. */
export function engineKindOf(kind: string): EngineKind {
  if (kind === 'bus' || kind === 'nganya') return 'heavy';
  if (kind === 'matatu') return 'diesel';
  if (kind === 'bike' || kind === 'boda') return 'bike';
  return 'petrol';
}
