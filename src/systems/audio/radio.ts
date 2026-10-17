import { create } from 'zustand';
import { audioContext, MIXES, SoundSystem, type MixDef, type Tone } from './music';
import { bus, noiseBuffer } from './mixer';
import { TrackPlayer } from './tracks';
import { say, stopVoice } from './voice';
import { stories } from './stories';

// The car radio (GTA style): fictional Mkurugenzi City stations, data-driven. A station is either
// MUSIC (an original procedural set with its own sound: amapiano, gengetone, afro-house, lo-fi) or
// TALK (a host or storyteller voiced through systems/audio/voice, over a soft music bed). Stations
// keep "playing" while you're tuned elsewhere (each set starts where the clock says it is), a burst
// of tuning static covers the switch, and only one station ever plays: the old one is faded out and
// disposed before anything new can stack up.
//
// Controls (while in a vehicle): , previous · . next · - / = volume · R radio on/off.
// Leaving the vehicle stops the radio; getting back in resumes the station you had.

const R = -99;

export interface Station {
  id: string;
  name: string;
  tagline: string;
  color: string;
  kind: 'music' | 'talk' | 'episodes';
  mixes?: MixDef[];
  tone?: Tone;
  /** talk stations: segments read in order (looping), with a music bed */
  segments?: { who: 'host' | 'storyteller'; title: string; lines: string[] }[];
  ident: string; // station ident read between songs / segments
  /** plays the recorded DJ mixes (systems/audio/tracks) instead of a synthesised set */
  recorded?: boolean;
}

// ---- music sets (all original patterns) ----
const GENGETONE: MixDef[] = [
  {
    name: 'Mtaani Bounce', bpm: 102, root: 45, chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0], log: [0, R, R, 0, R, R, 3, R, 0, R, R, 0, R, 7, R, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    lead: [[12, R, R, 10, R, R, 7, R, 12, R, 10, R, 7, R, 5, R], [7, R, R, 5, R, R, 3, R, 5, R, 3, R, 0, R, R, R]], leadType: 'pluck', subLen: 1,
  },
  {
    name: 'Kanairo Riddim', bpm: 98, root: 43, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0], log: [0, R, R, 0, R, R, 7, R, 5, R, R, 5, R, 4, R, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0], hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
    lead: [[R, R, 12, R, 14, R, 16, R, R, R, 14, R, 12, R, R, R], [R, R, 9, R, 11, R, 12, R, R, R, 11, R, 7, R, R, R]], leadType: 'marimba', subLen: 1,
  },
  {
    name: 'Sheng Express', bpm: 105, root: 40, chords: [[0, 3, 7], [3, 7, 10], [5, 8, 12], [3, 7, 10]],
    kick: [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0], log: [0, R, 0, R, R, R, 5, R, 0, R, 0, R, R, R, 3, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    subLen: 1,
  },
];
const AFROHOUSE: MixDef[] = [
  {
    name: 'Westlands Sunset', bpm: 120, root: 45, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-7, -3, 0, 3]],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], log: [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    pad: true, lead: [[0, R, 3, R, 7, R, 10, R, 7, R, 3, R, R, R, R, R], [R, R, R, R, 12, R, 10, R, 7, R, R, R, 5, R, R, R]], leadType: 'marimba', subLen: 0.8,
  },
  {
    name: 'Thika Road Cruise', bpm: 118, root: 42, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], log: [R, R, 0, R, R, R, R, R, R, R, 0, R, R, R, R, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0],
    pad: true, lead: [[12, R, R, R, 11, R, 7, R, R, R, R, R, 4, R, 7, R]], leadType: 'flute', subLen: 0.8,
  },
];
const LOFI: MixDef[] = [
  {
    name: 'Rainy Season Tapes', bpm: 82, root: 48, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]],
    kick: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0], log: [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    pad: true, shaker: false, lead: [[R, R, 7, R, R, R, 4, R, R, R, 2, R, 0, R, R, R], [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R]], leadType: 'pluck', subLen: 2,
  },
];

const BED: MixDef[] = [
  {
    name: 'bed', bpm: 76, root: 45, chords: [[0, 3, 7, 10], [-4, 0, 3, 7]],
    kick: Array(16).fill(0), log: Array(16).fill(R), clap: Array(16).fill(0), hat: Array(16).fill(0), pad: true, shaker: false, subLen: 0.5,
  },
];

export const STATIONS: Station[] = [
  {
    // Abel's real episodes from his YouTube channel (systems/audio/stories, ui/RadioHud StoriesPlayer)
    id: 'stories', name: 'Mkurugenzi Stories', tagline: "Abel's episodes, newest first", color: '#c86bff', kind: 'episodes',
    ident: 'Mkurugenzi Stories.',
  },
  {
    id: 'nganya', name: 'Nganya Radio', tagline: 'Nganya mixes by DJ Mysticc and DJ Pasamiz', color: '#e0302a', kind: 'music', recorded: true,
    mixes: MIXES, tone: { bass: 8, drive: 1.6, level: 0.55 }, ident: 'Nganya Radio. Volume juu!',
  },
  {
    id: 'mtaa', name: 'Mtaa FM', tagline: 'Gengetone and street sounds', color: '#ffc72c', kind: 'music',
    mixes: GENGETONE, tone: { bass: 5, drive: 1.4, level: 0.5 }, ident: 'Mtaa FM. Sauti ya mtaa.',
  },
  {
    id: 'drive', name: 'Nairobi Drive', tagline: 'Afro-house for the open road', color: '#3fb27f', kind: 'music',
    mixes: [...AFROHOUSE, ...LOFI], tone: { bass: 3, drive: 1.1, level: 0.5, crackle: false }, ident: 'Nairobi Drive. Take it easy.',
  },
];

interface RadioState {
  on: boolean;
  index: number; // station
  volume: number; // 0..1
  inVehicle: boolean;
  now: string; // now playing: mix name or segment title
  changedAt: number; // last station change (the HUD shows the station card a while)
}

const KEY = 'mk.radio.v1';
function load(): Pick<RadioState, 'on' | 'index' | 'volume'> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { on: true, index: 0, volume: 0.8, ...(JSON.parse(raw) as object) };
  } catch {
    /* storage blocked */
  }
  return { on: true, index: 0, volume: 0.8 };
}

export const useRadio = create<RadioState>(() => ({ ...load(), inVehicle: false, now: '', changedAt: 0 }));

function persist() {
  const { on, index, volume } = useRadio.getState();
  try {
    localStorage.setItem(KEY, JSON.stringify({ on, index, volume }));
  } catch {
    /* ignore */
  }
}

// ---- the one live source ----
let live: { stop: () => void } | null = null;
let gain: GainNode | null = null;
let talkToken = 0;

function output(): GainNode | null {
  const ac = audioContext();
  const b = bus('radio');
  if (!ac || !b) return null;
  if (!gain) {
    gain = ac.createGain();
    // a car radio: no deep sub, a little presence
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 45;
    gain.connect(hp).connect(b);
  }
  gain.gain.setTargetAtTime(useRadio.getState().volume, ac.currentTime, 0.1);
  return gain;
}

function tuneStatic() {
  const ac = audioContext();
  const out = output();
  if (!ac || !out) return;
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  f.Q.value = 0.6;
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  n.connect(f).connect(g).connect(out);
  n.start(t, Math.random());
  n.stop(t + 0.35);
}

function stopLive() {
  stories.setActive(false);
  live?.stop();
  live = null;
  talkToken++;
  stopVoice('host');
  stopVoice('storyteller');
}

function startStation() {
  stopLive();
  const st = useRadio.getState();
  if (!st.on || !st.inVehicle) return;
  const ac = audioContext();
  const out = output();
  if (!ac || !out) return;
  const station = STATIONS[st.index]!;
  if (station.kind === 'episodes') {
    // the episode plays in YouTube's player in the radio card; it reports what's on
    stories.setActive(true);
    live = { stop: () => stories.setActive(false) };
    return;
  }
  const clockS = Date.now() / 1000; // stations keep playing while you're tuned away
  const seed = station.id.length;
  const mixes = station.kind === 'music' ? station.mixes! : BED;
  const tone = station.kind === 'music' ? station.tone! : { bass: 2, drive: 1, level: 0.22 };
  if (station.recorded) {
    // the real DJ sets, joined where the station "is" (its own running order)
    const p = new TrackPlayer(ac, 4242, (clockS % 480) / 480);
    p.output.connect(out);
    p.setVolume(1, 0.25);
    p.onError = () => {
      // can't stream: fall back to the synth set so the station still plays
      p.dispose();
      const sys = new SoundSystem(ac, seed, mixes, tone, clockS % (90 * mixes.length));
      sys.output.connect(out);
      sys.setVolume(1, 0.25);
      live = { stop: () => sys.dispose() };
    };
    live = { stop: () => p.dispose() };
    useRadio.setState({ now: 'Live DJ set' });
    setTimeout(() => useRadio.setState({ now: p.mixName }), 1500);
    setTimeout(() => {
      if (live && useRadio.getState().index === st.index) say({ who: 'host', name: station.name, text: station.ident, channel: 'radio', volume: 0.8 });
    }, 900);
    return;
  }
  const sys = new SoundSystem(ac, seed, mixes, tone, clockS % (90 * mixes.length));
  sys.output.connect(out);
  sys.setVolume(1, 0.25);
  sys.onMix = (name) => station.kind === 'music' && useRadio.setState({ now: name });
  live = { stop: () => sys.dispose() };
  if (station.kind === 'music') {
    useRadio.setState({ now: sys.mixName });
    // the station ident over the intro
    setTimeout(() => {
      if (live && useRadio.getState().index === st.index) say({ who: 'host', name: station.name, text: station.ident, channel: 'radio', volume: 0.8 });
    }, 900);
    return;
  }
  // talk: read the segments in turn, picking up where the station "is"
  const token = talkToken;
  const segs = station.segments!;
  const total = segs.reduce((a, sg) => a + sg.lines.length, 0);
  let k = Math.floor(clockS / 7) % total; // ~7 s per line on the station clock
  const next = (first: boolean) => {
    if (token !== talkToken) return;
    let i = k % total;
    let seg = 0;
    while (i >= segs[seg]!.lines.length) i -= segs[seg++]!.lines.length;
    const s = segs[seg]!;
    useRadio.setState({ now: s.title });
    const text = s.lines[i]!;
    k++;
    const line = () => say({ who: s.who, name: station.name, text, channel: 'radio', onEnd: () => setTimeout(() => next(false), 700) });
    // tuning in at the top of a segment: the station ident first (its own clip), then the line
    if (first && i === 0) say({ who: s.who, name: station.name, text: station.ident, channel: 'radio', onEnd: () => setTimeout(line, 400) });
    else line();
  };
  setTimeout(() => next(true), 600);
}

export const radio = {
  enterVehicle() {
    useRadio.setState({ inVehicle: true, changedAt: performance.now() });
    startStation();
  },
  exitVehicle() {
    useRadio.setState({ inVehicle: false });
    stopLive();
  },
  step(d: number) {
    const st = useRadio.getState();
    if (!st.inVehicle) return;
    const index = (st.index + d + STATIONS.length) % STATIONS.length;
    useRadio.setState({ index, on: true, changedAt: performance.now(), now: '' });
    persist();
    tuneStatic();
    startStation();
  },
  toggle() {
    const st = useRadio.getState();
    if (!st.inVehicle) return;
    useRadio.setState({ on: !st.on, changedAt: performance.now() });
    persist();
    if (st.on) stopLive();
    else {
      tuneStatic();
      startStation();
    }
  },
  volume(d: number) {
    const st = useRadio.getState();
    if (!st.inVehicle) return;
    useRadio.setState({ volume: Math.max(0, Math.min(1, Math.round((st.volume + d) * 10) / 10)), changedAt: performance.now() });
    persist();
    output();
  },
};
