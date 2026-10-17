// Original procedural music (no samples, no copyright), synthesised with WebAudio: kick, log-drum
// bass with pitch glide, sub bass, shakers, hats, claps, detuned chord stabs, Rhodes pads, a
// marimba/pluck lead and vinyl crackle, through a tone-shaped, compressed bus. Each "mix" (tempo,
// key, patterns) plays ~90 s like a DJ set. The nganya sound systems play the amapiano set with the
// bass cranked; the car radio's music stations (systems/audio/radio) each have their own set.

let ctx: AudioContext | null = null;

/** The AudioContext is only created/resumed after a user gesture (browser rule). */
export function audioContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    audioContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export interface MixDef {
  bpm: number;
  root: number; // MIDI note of the key root
  chords: number[][]; // semitone offsets per bar
  kick: number[]; // 16 steps
  log: number[]; // 16 steps: semitone offset (-99 = rest)
  clap: number[];
  hat: number[];
  name: string;
  /** optional lead line: 16 steps per bar, semitone offsets above root+24 (-99 = rest), 1-4 bars */
  lead?: number[][];
  leadType?: 'marimba' | 'pluck' | 'flute';
  /** soft sustained Rhodes-style chords instead of short stabs */
  pad?: boolean;
  /** shaker 16ths (default on) */
  shaker?: boolean;
  /** sustained sub bass under each bar (short by default: a long sub note is the 'drone') */
  subLen?: number;
}

/** How a sound system sounds: bass shelf (dB), saturation, overall level. */
export interface Tone {
  bass: number;
  drive: number;
  level: number;
  crackle?: boolean;
}

export const NGANYA_TONE: Tone = { bass: 9, drive: 1.8, level: 0.55 };

const R = -99;
export const MIXES: MixDef[] = [
  {
    name: 'Mkurugenzi Piano Vibes', bpm: 112, root: 45,
    chords: [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    log: [R, R, R, 0, R, R, 7, R, R, 5, R, R, 3, R, 0, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
  },
  {
    name: 'Gengetone Mtaani', bpm: 100, root: 43,
    chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    log: [0, R, R, 0, R, R, 3, R, 0, R, R, 0, R, 5, R, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  {
    name: 'Utafraaaia Deep Log', bpm: 114, root: 41,
    chords: [[0, 3, 7, 12], [-4, 0, 3, 8], [-2, 2, 5, 10], [-5, -1, 2, 7]],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    log: [R, R, 0, R, R, 0, R, 7, R, R, 0, R, 10, R, 7, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
  },
];

export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** One sound system (a vehicle's speakers). Connect `output` to a panner or the destination. */
export class SoundSystem {
  readonly output: GainNode;
  private bus: GainNode;
  private bassBus: BiquadFilterNode;
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private mixIndex: number;
  private mixStarted = 0;
  private alive = true;
  private mixes: MixDef[];
  private crackleSrc: AudioBufferSourceNode | null = null;
  /** Called when the set moves on to the next mix (radio 'now playing'). */
  onMix?: (name: string) => void;

  /**
   * `mixes` and `tone` default to the nganya set. `offsetS` starts the set part-way through (radio
   * stations keep playing while you're tuned elsewhere, like GTA).
   */
  constructor(private c: AudioContext, seed: number, mixes: MixDef[] = MIXES, tone: Tone = NGANYA_TONE, offsetS = 0) {
    this.mixes = mixes;
    this.mixIndex = (seed + Math.floor(offsetS / 90)) % mixes.length;
    this.output = c.createGain();
    this.output.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    // speaker character: low shelf + saturation ("loud nganya speakers" by default)
    this.bassBus = c.createBiquadFilter();
    this.bassBus.type = 'lowshelf';
    this.bassBus.frequency.value = 90;
    this.bassBus.gain.value = tone.bass;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * tone.drive) / Math.tanh(tone.drive);
    }
    shaper.curve = curve;
    this.bus = c.createGain();
    this.bus.gain.value = tone.level;
    this.bus.connect(this.bassBus);
    this.bassBus.connect(shaper);
    shaper.connect(comp);
    comp.connect(this.output);
    if (tone.crackle) this.crackle();
    this.nextTime = c.currentTime + 0.1;
    this.mixStarted = c.currentTime - (offsetS % 90);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  get mixName() {
    return this.mixes[this.mixIndex]!.name;
  }

  /** vinyl/radio crackle bed (lo-fi stations) */
  private crackle() {
    const c = this.c;
    const len = c.sampleRate * 3;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0) + (Math.random() * 2 - 1) * 0.012;
    const src = c.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const g = c.createGain();
    g.gain.value = 0.18;
    src.connect(hp).connect(g).connect(this.output);
    src.start();
    this.crackleSrc = src;
  }

  setVolume(v: number, t = 0.3) {
    this.output.gain.setTargetAtTime(v, this.c.currentTime, t);
  }

  /** Kick timing for the bass camera shake (seconds since last kick). */
  lastKick = 0;

  private schedule() {
    if (!this.alive) return;
    const c = this.c;
    const mix = this.mixes[this.mixIndex]!;
    const stepDur = 60 / mix.bpm / 4;
    while (this.nextTime < c.currentTime + 0.12) {
      this.playStep(mix, this.step % 16, Math.floor(this.step / 16) % mix.chords.length, this.nextTime);
      this.nextTime += stepDur;
      this.step++;
    }
    if (c.currentTime - this.mixStarted > 90) {
      this.mixIndex = (this.mixIndex + 1) % this.mixes.length; // DJ moves to the next mix
      this.mixStarted = c.currentTime;
      this.onMix?.(this.mixName);
    }
  }

  private playStep(mix: MixDef, s: number, bar: number, t: number) {
    const c = this.c;
    const swing = s % 2 === 1 ? 0.012 : 0;
    t += swing;
    if (mix.kick[s]) this.kick(t);
    if (mix.log[s] !== R) this.logDrum(midi(mix.root + mix.log[s]!), t);
    if (mix.clap[s]) this.clap(t);
    if (mix.hat[s]) this.hat(t, 0.08);
    if (mix.shaker !== false) this.hat(t, 0.025, 9000); // shaker 16ths
    const chord = mix.chords[bar]!.map((o) => midi(mix.root + 24 + o));
    if (mix.pad) {
      if (s === 0) this.pad(chord, t, (60 / mix.bpm) * 4);
    } else if (s === 0 || s === 6 || s === 10) this.chord(chord, t, s === 0 ? 0.5 : 0.18);
    // the sub bass under each bar: short and decaying (a whole-bar sustained sub is a drone)
    if (s === 0) this.sub(midi(mix.root + mix.chords[bar]![0]! - 12), t, (60 / mix.bpm) * (mix.subLen ?? 1.5));
    if (mix.lead) {
      const line = mix.lead[bar % mix.lead.length]!;
      const n = line[s]!;
      if (n !== R) this.lead(midi(mix.root + 24 + n), t, mix.leadType ?? 'marimba', 60 / mix.bpm);
    }
    void c;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private kick(t: number) {
    const c = this.c;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 1.0, 0.38);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.45);
    this.lastKick = t;
  }

  private logDrum(f: number, t: number) {
    const c = this.c;
    const o = c.createOscillator();
    o.type = 'triangle';
    const g = c.createGain();
    o.frequency.setValueAtTime(f * 1.9, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.env(g, t, 0.005, 0.85, 0.42);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.5);
  }

  private sub(f: number, t: number, dur: number) {
    const c = this.c;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.24, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** soft Rhodes-style chord: sine + a little bell, slow attack, long release */
  private pad(fs: number[], t: number, len: number) {
    const c = this.c;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.98);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(g).connect(this.bus);
    for (const f of fs) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const tine = c.createOscillator();
      tine.type = 'sine';
      tine.frequency.value = f * 4.01;
      const tg = c.createGain();
      tg.gain.setValueAtTime(0.25, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(lp);
      tine.connect(tg).connect(lp);
      o.start(t);
      tine.start(t);
      o.stop(t + len);
      tine.stop(t + 0.45);
    }
  }

  /** lead voices: marimba (Kenyan benga/afro-house), nylon pluck, breathy flute */
  private lead(f: number, t: number, type: 'marimba' | 'pluck' | 'flute', beat: number) {
    const c = this.c;
    const g = c.createGain();
    g.connect(this.bus);
    if (type === 'flute') {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const vib = c.createOscillator();
      vib.frequency.value = 5.2;
      const vg = c.createGain();
      vg.gain.value = f * 0.006;
      vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.9);
      o.connect(g);
      o.start(t);
      vib.start(t);
      o.stop(t + beat);
      vib.stop(t + beat);
      return;
    }
    const o = c.createOscillator();
    o.type = type === 'pluck' ? 'sawtooth' : 'sine';
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(type === 'pluck' ? 3000 : 2400, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    const over = c.createOscillator(); // marimba's woody overtone
    over.type = 'sine';
    over.frequency.value = f * 3.9;
    const og = c.createGain();
    og.gain.setValueAtTime(type === 'marimba' ? 0.35 : 0, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (type === 'pluck' ? 0.35 : 0.5));
    o.connect(lp).connect(g);
    over.connect(og).connect(g);
    o.start(t);
    over.start(t);
    o.stop(t + 0.55);
    over.stop(t + 0.12);
  }

  private hat(t: number, vol: number, hp = 7000) {
    const c = this.c;
    const n = c.createBufferSource();
    n.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = c.createGain();
    this.env(g, t, 0.001, vol, 0.05);
    n.connect(f).connect(g).connect(this.bus);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.08);
  }

  private clap(t: number) {
    const c = this.c;
    const n = c.createBufferSource();
    n.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1600;
    f.Q.value = 0.8;
    const g = c.createGain();
    this.env(g, t, 0.002, 0.5, 0.16);
    n.connect(f).connect(g).connect(this.bus);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.2);
  }

  private chord(fs: number[], t: number, len: number) {
    const c = this.c;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + len);
    const g = c.createGain();
    this.env(g, t, 0.01, 0.12, len);
    lp.connect(g).connect(this.bus);
    for (const f of fs) {
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + len + 0.05);
      }
    }
  }

  dispose() {
    this.alive = false;
    clearInterval(this.timer);
    try {
      this.crackleSrc?.stop(this.c.currentTime + 0.5);
    } catch {
      /* not started */
    }
    this.output.gain.setTargetAtTime(0, this.c.currentTime, 0.1);
    setTimeout(() => this.output.disconnect(), 600);
  }
}
