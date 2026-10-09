import { audioContext } from './music';

// Short synthesised stingers (original, no samples): mission passed / failed, punches, splashes.
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

function tone(ac: AudioContext, out: AudioNode, freq: number, t0: number, dur: number, type: OscillatorType, gain: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function bus(ac: AudioContext, level = 0.5) {
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3800;
  const g = ac.createGain();
  g.gain.value = level;
  // cheap room: a feedback delay
  const d = ac.createDelay(0.5);
  d.delayTime.value = 0.13;
  const fb = ac.createGain();
  fb.gain.value = 0.28;
  lp.connect(g).connect(ac.destination);
  lp.connect(d).connect(fb).connect(d);
  fb.connect(g);
  return lp;
}

export function chime(kind: 'passed' | 'failed') {
  const ac = audioContext();
  if (!ac) return;
  const out = bus(ac, 0.42);
  const t = ac.currentTime + 0.03;
  if (kind === 'passed') {
    // rising brassy major arpeggio, then a held chord
    [60, 64, 67, 72].forEach((n, i) => {
      tone(ac, out, midi(n), t + i * 0.11, 0.5, 'sawtooth', 0.12);
      tone(ac, out, midi(n - 12), t + i * 0.11, 0.5, 'triangle', 0.1);
    });
    [72, 76, 79, 84].forEach((n) => tone(ac, out, midi(n), t + 0.5, 1.8, 'sawtooth', 0.07));
    tone(ac, out, midi(48), t + 0.5, 1.9, 'triangle', 0.18);
  } else {
    [67, 63, 60, 55].forEach((n, i) => tone(ac, out, midi(n), t + i * 0.18, 0.7, 'sawtooth', 0.11));
    tone(ac, out, midi(43), t + 0.6, 1.6, 'triangle', 0.2);
  }
}

function noiseBuffer(ac: AudioContext, seconds: number, decay: number) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * decay));
  return buf;
}

/** A dull body hit (fights). */
export function thump(strength = 1) {
  const ac = audioContext();
  if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140 * strength, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.5 * Math.min(1, strength), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, 0.06, 0.02);
  const ng = ac.createGain();
  ng.gain.value = 0.25;
  o.connect(g).connect(ac.destination);
  n.connect(ng).connect(ac.destination);
  o.start(t);
  o.stop(t + 0.2);
  n.start(t);
}

/** A swish of air (a missed punch). */
export function whoosh() {
  const ac = audioContext();
  if (!ac) return;
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, 0.25, 0.08);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(600, ac.currentTime);
  f.frequency.exponentialRampToValueAtTime(2400, ac.currentTime + 0.2);
  const g = ac.createGain();
  g.gain.value = 0.18;
  n.connect(f).connect(g).connect(ac.destination);
  n.start();
}

/** Water splash (entering the sea). */
export function splash() {
  const ac = audioContext();
  if (!ac) return;
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, 0.7, 0.18);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.6;
  const g = ac.createGain();
  g.gain.value = 0.5;
  n.connect(f).connect(g).connect(ac.destination);
  n.start();
}
