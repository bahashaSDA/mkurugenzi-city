import { create } from 'zustand';
import { audioContext } from './music';

// Mix buses (GTA-style audio settings): every sound goes through one of these, so the radio,
// voices, engines and the city can be balanced and muted separately.
//
//   sfx      doors, steps, impacts, horns, tyres
//   engines  vehicle engines (yours and the traffic)
//   ambience the city bed: distant traffic, birds, crickets, market murmur
//   world    music heard in the world (nganya sound systems, kiosks)
//   radio    the car radio
//   voice    conductors, shop attendants, radio hosts
// All of them feed `master`.

export type Bus = 'sfx' | 'engines' | 'ambience' | 'world' | 'radio' | 'voice';
const BUSES: Bus[] = ['sfx', 'engines', 'ambience', 'world', 'radio', 'voice'];
const DEFAULTS: Record<Bus | 'master', number> = { master: 0.9, sfx: 0.9, engines: 0.75, ambience: 0.7, world: 0.8, radio: 0.8, voice: 1.0 };

const KEY = 'mk.audio.v1';
function load(): Record<Bus | 'master', number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Record<Bus | 'master', number>>) };
  } catch {
    /* storage blocked */
  }
  return { ...DEFAULTS };
}

export const useAudioSettings = create<{
  levels: Record<Bus | 'master', number>;
  muted: boolean;
  subtitles: boolean;
  set: (bus: Bus | 'master', v: number) => void;
  toggleMute: () => void;
}>((set, get) => ({
  levels: load(),
  muted: false,
  subtitles: true,
  set: (bus, v) => {
    const levels = { ...get().levels, [bus]: Math.max(0, Math.min(1, v)) };
    set({ levels });
    apply();
    try {
      localStorage.setItem(KEY, JSON.stringify(levels));
    } catch {
      /* ignore */
    }
  },
  toggleMute: () => {
    set({ muted: !get().muted });
    apply();
  },
}));

let nodes: { master: GainNode; buses: Record<Bus, GainNode>; out: AudioNode; muffle: BiquadFilterNode } | null = null;

function apply() {
  if (!nodes) return;
  const { levels, muted } = useAudioSettings.getState();
  const t = nodes.master.context.currentTime;
  nodes.master.gain.setTargetAtTime(muted ? 0 : levels.master, t, 0.05);
  for (const b of BUSES) nodes.buses[b].gain.setTargetAtTime(levels[b], t, 0.05);
}

/** The bus node to connect a sound to (null until the browser allows audio). */
export function bus(b: Bus): GainNode | null {
  const ac = audioContext();
  if (!ac) return null;
  if (!nodes) {
    const master = ac.createGain();
    // gentle limiter on the master so stacked sounds never clip
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -6;
    lim.ratio.value = 12;
    lim.attack.value = 0.003;
    lim.release.value = 0.25;
    // underwater: everything through a low-pass (wide open in air)
    const muffle = ac.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 20000;
    muffle.Q.value = 0.5;
    master.connect(muffle).connect(lim).connect(ac.destination);
    const buses = Object.fromEntries(BUSES.map((k) => [k, ac.createGain()])) as Record<Bus, GainNode>;
    for (const k of BUSES) buses[k].connect(master);
    nodes = { master, buses, out: lim, muffle };
    apply();
  }
  return nodes.buses[b];
}

/** Underwater (Player): the whole mix goes dull and distant. */
export function setUnderwater(under: boolean) {
  if (!nodes) return;
  nodes.muffle.frequency.setTargetAtTime(under ? 650 : 20000, nodes.master.context.currentTime, 0.15);
}

/** A positional source: inverse-distance rolloff, smooth with distance (no hard cut-offs). */
export function panner(ac: AudioContext, ref = 4, rolloff = 1.2, max = 400): PannerNode {
  const p = ac.createPanner();
  p.panningModel = 'equalpower'; // HRTF costs a convolution per source; equal-power is plenty here
  p.distanceModel = 'inverse';
  p.refDistance = ref;
  p.rolloffFactor = rolloff;
  p.maxDistance = max;
  return p;
}

export function setPos(p: PannerNode, x: number, y: number, z: number) {
  if (p.positionX) {
    const t = p.context.currentTime;
    p.positionX.setTargetAtTime(x, t, 0.03);
    p.positionY.setTargetAtTime(y, t, 0.03);
    p.positionZ.setTargetAtTime(z, t, 0.03);
  } else (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
}

let noiseBuf: AudioBuffer | null = null;
/** 2 s of white noise, shared. */
export function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

let brownBuf: AudioBuffer | null = null;
/** 4 s of brown (rumbly) noise, shared: traffic beds, road noise. */
export function brownBuffer(ac: AudioContext): AudioBuffer {
  if (!brownBuf) {
    brownBuf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
    const d = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return brownBuf;
}

/**
 * ?debug / tests: record what the player hears (the final mix after the limiter) for `ms` and
 * return it as a base64 WebM/Opus string. Used by tools/audio-test.mjs to check the soundscape.
 */
export async function recordMix(ms: number): Promise<string> {
  const ac = audioContext();
  bus('sfx');
  if (!ac || !nodes) return '';
  const dest = ac.createMediaStreamDestination();
  nodes.out.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);
  await new Promise((r) => setTimeout(r, ms));
  rec.stop();
  await done;
  nodes.out.disconnect(dest);
  const buf = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
  let bin = '';
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
