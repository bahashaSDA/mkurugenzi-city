import { audioContext } from './music';
import { bus, noiseBuffer, panner, setPos } from './mixer';

// One-shot sound effects, synthesised (original, no samples): car doors, matatu steps, the boda's
// kickstand, impacts of every size, tyre squeal, horns. Positional when a position is given.

export type Sfx = 'doorOpen' | 'doorClose' | 'slidingDoor' | 'step' | 'kickstand' | 'click';

type Pos = { x: number; y: number; z: number };

function out(ac: AudioContext, pos: Pos | undefined, gain: number): GainNode | null {
  const b = bus('sfx');
  if (!b) return null;
  const g = ac.createGain();
  g.gain.value = gain;
  if (pos) {
    const p = panner(ac, 3, 1.4);
    setPos(p, pos.x, pos.y, pos.z);
    g.connect(p).connect(b);
  } else g.connect(b);
  return g;
}

function burst(ac: AudioContext, dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, attack = 0.002) {
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac);
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(dest);
  n.start(t, Math.random() * 1.5);
  n.stop(t + dur + 0.02);
}

function thump(ac: AudioContext, dest: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number) {
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function ring(ac: AudioContext, dest: AudioNode, t: number, freq: number, dur: number, peak: number) {
  const o = ac.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function playSfx(kind: Sfx, pos?: Pos, vol = 1) {
  const ac = audioContext();
  if (!ac || ac.state !== 'running') return;
  const o = out(ac, pos, vol);
  if (!o) return;
  const t = ac.currentTime + 0.01;
  switch (kind) {
    case 'doorOpen':
      // handle pull, latch release, a little hinge
      burst(ac, o, t, 0.05, 'bandpass', 2400, 3, 0.35);
      burst(ac, o, t + 0.07, 0.09, 'bandpass', 1200, 2, 0.4);
      thump(ac, o, t + 0.07, 180, 90, 0.08, 0.25);
      break;
    case 'doorClose':
      // a solid car-door thunk: body resonance, latch, rattle of the trim
      thump(ac, o, t, 120, 48, 0.22, 0.9);
      burst(ac, o, t, 0.12, 'lowpass', 900, 0.7, 0.7);
      burst(ac, o, t + 0.015, 0.05, 'bandpass', 3200, 4, 0.25);
      break;
    case 'slidingDoor':
      // matatu sliding door: roller rumble then the slam
      burst(ac, o, t, 0.45, 'bandpass', 500, 1.2, 0.25, 0.08);
      thump(ac, o, t + 0.42, 140, 55, 0.25, 0.8);
      burst(ac, o, t + 0.42, 0.15, 'lowpass', 1400, 0.7, 0.6);
      break;
    case 'step':
      // boot on the steel step of a matatu/bus
      thump(ac, o, t, 160, 70, 0.09, 0.45);
      ring(ac, o, t, 820 + Math.random() * 120, 0.12, 0.05);
      burst(ac, o, t, 0.05, 'highpass', 2500, 0.7, 0.12);
      break;
    case 'kickstand':
      ring(ac, o, t, 1450, 0.18, 0.12);
      ring(ac, o, t + 0.005, 2210, 0.12, 0.07);
      burst(ac, o, t, 0.04, 'bandpass', 3000, 3, 0.3);
      break;
    case 'click':
      burst(ac, o, t, 0.02, 'bandpass', 4000, 5, 0.2);
      break;
  }
  setTimeout(() => o.disconnect(), 1500);
}

/** A collision: soft knock to a heavy crunch with glass, by impact speed (m/s). */
export function impact(speed: number, pos?: Pos) {
  const ac = audioContext();
  if (!ac || ac.state !== 'running' || speed < 1) return;
  const k = Math.min(1, speed / 18);
  const o = out(ac, pos, 0.4 + k * 0.8);
  if (!o) return;
  const t = ac.currentTime + 0.005;
  thump(ac, o, t, 95 + k * 40, 40, 0.18 + k * 0.25, 0.9);
  burst(ac, o, t, 0.12 + k * 0.4, 'lowpass', 700 + k * 2500, 0.8, 0.6 + k * 0.4);
  if (k > 0.35) {
    // crumpling panel
    for (let i = 0; i < 5; i++) burst(ac, o, t + 0.02 + Math.random() * 0.15 * k, 0.06, 'bandpass', 800 + Math.random() * 1800, 3, 0.3 * k);
  }
  if (k > 0.6) {
    // glass
    for (let i = 0; i < 9; i++) ring(ac, o, t + 0.04 + Math.random() * 0.35, 3000 + Math.random() * 4500, 0.08 + Math.random() * 0.12, 0.05);
  }
  setTimeout(() => o.disconnect(), 2000);
}

/** Horn: a pair of reed horns (cars), a deep air horn (buses, nganyas) or a little boda bleat. */
export function horn(kind: 'car' | 'heavy' | 'bike', pos?: Pos, ms = 450) {
  const ac = audioContext();
  if (!ac || ac.state !== 'running') return;
  const o = out(ac, pos, 0.5);
  if (!o) return;
  const t = ac.currentTime + 0.01;
  const end = t + ms / 1000;
  const freqs = kind === 'heavy' ? [196, 247, 294] : kind === 'bike' ? [520] : [415, 494];
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = kind === 'heavy' ? 1800 : 2600;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
  g.gain.setValueAtTime(0.3, end - 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  lp.connect(g).connect(o);
  for (const f of freqs) {
    const os = ac.createOscillator();
    os.type = kind === 'bike' ? 'square' : 'sawtooth';
    os.frequency.value = f;
    os.connect(lp);
    os.start(t);
    os.stop(end + 0.02);
  }
  setTimeout(() => o.disconnect(), ms + 600);
}

/**
 * Electric hair clippers for `ms`: a 120 Hz motor buzz (square wave through a resonant band) with
 * a faint blade hiss, swelling as the blades meet the hair in a few passes.
 */
export function clippers(ms: number, pos?: Pos) {
  const ac = audioContext();
  if (!ac || ac.state !== 'running') return;
  const o = out(ac, pos, 0.35);
  if (!o) return;
  const t = ac.currentTime + 0.01;
  const end = t + ms / 1000;
  const motor = ac.createOscillator();
  motor.type = 'square';
  motor.frequency.value = 120;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900;
  band.Q.value = 2.5;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
  // passes over the head: louder while cutting, a moment of plain buzz between
  for (let k = t + 0.4; k < end - 0.4; k += 0.9) {
    g.gain.setTargetAtTime(0.2, k, 0.05);
    g.gain.setTargetAtTime(0.11, k + 0.55, 0.08);
  }
  g.gain.setTargetAtTime(0.0001, end - 0.15, 0.05);
  motor.connect(band).connect(g).connect(o);
  motor.start(t);
  motor.stop(end + 0.1);
  burst(ac, o, t + 0.2, ms / 1000 - 0.3, 'highpass', 5200, 0.6, 0.02, 0.2);
  setTimeout(() => o.disconnect(), ms + 600);
}
