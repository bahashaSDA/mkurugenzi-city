import { noiseBuffer } from './mixer';

// Tyre voice of the car you drive (synthesised, original): two continuous layers that follow the
// tyres, never restarted per frame.
//   squeal  : a narrow, slightly wavering band of noise near 1.4 kHz with a tonal resonance, only
//             while a tyre slides on tarmac (drift, handbrake, locked brakes, wheelspin)
//   gravel  : low, rough crunch on murram, dirt and sand, by speed
// Levels are modest: they sit under the engine and well under dialogue and the radio.

export class TyreVoice {
  private src: AudioBufferSourceNode;
  private squeal: GainNode;
  private gravel: GainNode;
  private sqF: BiquadFilterNode;
  private lfo: OscillatorNode;
  private disposed = false;

  constructor(private ac: AudioContext, dest: AudioNode) {
    this.src = ac.createBufferSource();
    this.src.buffer = noiseBuffer(ac);
    this.src.loop = true;
    // squeal: band-pass + peaking resonance, wavering
    this.sqF = ac.createBiquadFilter();
    this.sqF.type = 'bandpass';
    this.sqF.frequency.value = 1400;
    this.sqF.Q.value = 9;
    const ring = ac.createBiquadFilter();
    ring.type = 'peaking';
    ring.frequency.value = 1750;
    ring.Q.value = 14;
    ring.gain.value = 12;
    this.lfo = ac.createOscillator();
    this.lfo.frequency.value = 5.5;
    const depth = ac.createGain();
    depth.gain.value = 90;
    this.lfo.connect(depth).connect(this.sqF.frequency);
    this.squeal = ac.createGain();
    this.squeal.gain.value = 0;
    // gravel: low-passed rumble with a little grit
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.7;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    this.gravel = ac.createGain();
    this.gravel.gain.value = 0;
    this.src.connect(this.sqF).connect(ring).connect(this.squeal).connect(dest);
    this.src.connect(hp).connect(lp).connect(this.gravel).connect(dest);
    this.src.start();
    this.lfo.start();
  }

  /** slip 0..1 on tarmac, gravel 0..1 off it, speed m/s */
  update(slip: number, gravel: number, speed: number) {
    if (this.disposed) return;
    const t = this.ac.currentTime;
    const sq = slip > 0.25 && speed > 2 ? Math.min(1, (slip - 0.25) * 1.6) : 0;
    this.squeal.gain.setTargetAtTime(sq * 0.16, t, sq > this.squeal.gain.value ? 0.04 : 0.12);
    this.sqF.frequency.setTargetAtTime(1150 + sq * 500 + Math.min(speed, 25) * 6, t, 0.1);
    this.gravel.gain.setTargetAtTime(gravel * 0.11, t, 0.15);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ac.currentTime;
    this.squeal.gain.setTargetAtTime(0, t, 0.08);
    this.gravel.gain.setTargetAtTime(0, t, 0.08);
    this.src.stop(t + 0.5);
    this.lfo.stop(t + 0.5);
  }
}
