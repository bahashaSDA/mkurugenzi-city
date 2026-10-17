// Recorded audio, streamed (not decoded into memory): the nganya DJ mixes and the looping
// field-recording beds of the city. Both play through HTMLAudioElements routed into Web Audio, so
// they get the same filters, panners and mix buses as everything else.
//
// Sources (see ASSETS.md / Credits): DJ Mysticc "Nganya Drive Mix 2026 Vol 2", DJ Pasamiz "Nganya
// Vibes Mix 01/02" (used with the owner's permission), cut into 8-minute sections by loudness-
// normalised ffmpeg passes; ambience from Kenyan field recordings.

/** 8-minute sections of the three nganya mixes (public/audio/music). */
export const MIX_TRACKS: { url: string; name: string }[] = [
  ...[0, 1, 2, 3].map((k) => ({ url: `/audio/music/mysticc_v2_${k}.webm`, name: 'DJ Mysticc · Nganya Drive Mix Vol 2' })),
  ...[0, 1, 2, 3].map((k) => ({ url: `/audio/music/pasamiz_01_${k}.webm`, name: 'DJ Pasamiz · Nganya Vibes 01' })),
  ...[0, 1, 2, 3].map((k) => ({ url: `/audio/music/pasamiz_02_${k}.webm`, name: 'DJ Pasamiz · Nganya Vibes 02' })),
];

const TRACK_LEN = 480; // seconds per section

/** Anything that plays music into a vehicle's speakers (a recorded mix, or the synth fallback). */
export interface MusicSource {
  readonly output: AudioNode;
  readonly mixName: string;
  setVolume(v: number, t?: number): void;
  dispose(): void;
}

/**
 * A vehicle's sound system playing the real mixes: section after section in a shuffled order,
 * joined into the set "already playing" (starts part-way through, so two matatus never play the
 * same moment). Falls back via onError if the browser can't stream them.
 */
export class TrackPlayer implements MusicSource {
  readonly output: GainNode;
  private el: HTMLAudioElement;
  private src: MediaElementAudioSourceNode | null = null;
  private order: number[];
  private pos = 0;
  private alive = true;
  mixName = '';
  onError?: () => void;

  constructor(private ac: AudioContext, seed: number, startAt = Math.random()) {
    this.output = ac.createGain();
    this.output.gain.value = 0;
    // a shuffled running order per vehicle (deterministic from the seed)
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    this.order = MIX_TRACKS.map((_, i) => i).sort(() => rnd() - 0.5);
    this.el = new Audio();
    this.el.crossOrigin = 'anonymous';
    this.el.preload = 'auto';
    this.el.addEventListener('ended', () => this.next());
    this.el.addEventListener('error', () => {
      if (this.alive) this.onError?.();
    });
    try {
      this.src = ac.createMediaElementSource(this.el);
      this.src.connect(this.output);
    } catch {
      queueMicrotask(() => this.onError?.());
    }
    this.load(startAt * TRACK_LEN * 0.9);
  }

  private load(offset = 0) {
    const t = MIX_TRACKS[this.order[this.pos % this.order.length]!]!;
    this.mixName = t.name;
    this.el.src = t.url;
    if (offset > 0) {
      const seek = () => {
        this.el.currentTime = Math.min(offset, (this.el.duration || TRACK_LEN) - 5);
        this.el.removeEventListener('loadedmetadata', seek);
      };
      this.el.addEventListener('loadedmetadata', seek);
    }
    void this.el.play().catch(() => {
      /* autoplay blocked until a gesture: the AudioContext unlock retries */
    });
  }

  private next() {
    if (!this.alive) return;
    this.pos++;
    this.load(0);
  }

  setVolume(v: number, t = 0.3) {
    this.output.gain.setTargetAtTime(v, this.ac.currentTime, t);
    if (this.el.paused && this.alive) void this.el.play().catch(() => {});
  }

  dispose() {
    this.alive = false;
    this.output.gain.setTargetAtTime(0, this.ac.currentTime, 0.15);
    setTimeout(() => {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
      this.src?.disconnect();
      this.output.disconnect();
    }, 700);
  }
}

/**
 * A field-recording bed that loops without a seam: two players crossfade over the last few
 * seconds of the file. Starts lazily and sleeps (pauses) while its level stays at zero.
 */
export class LoopBed {
  readonly output: GainNode;
  private els: HTMLAudioElement[] = [];
  private gains: GainNode[] = [];
  private cur = 0;
  private timer = 0;
  private level = 0;
  private quietSince = 0;
  private started = false;
  ok = true;

  constructor(private ac: AudioContext, url: string, private fade = 4) {
    this.output = ac.createGain();
    this.output.gain.value = 0;
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'none';
      el.src = url;
      el.addEventListener('error', () => (this.ok = false));
      const g = ac.createGain();
      g.gain.value = 0;
      try {
        ac.createMediaElementSource(el).connect(g).connect(this.output);
      } catch {
        this.ok = false;
      }
      this.els.push(el);
      this.gains.push(g);
    }
  }

  private start() {
    this.started = true;
    const a = this.els[0]!;
    // begin anywhere in the recording, so a returning player doesn't hear the same opening
    a.addEventListener(
      'loadedmetadata',
      () => {
        if (a.duration > this.fade * 3) a.currentTime = Math.random() * (a.duration - this.fade * 2);
      },
      { once: true },
    );
    void a.play().catch(() => {});
    this.gains[0]!.gain.setTargetAtTime(1, this.ac.currentTime, 0.3);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  private tick() {
    const a = this.els[this.cur]!;
    if (!a.duration || a.paused) return;
    if (a.duration - a.currentTime < this.fade) {
      // crossfade into the other player from the top
      const n = 1 - this.cur;
      const b = this.els[n]!;
      b.currentTime = 0;
      void b.play().catch(() => {});
      const t = this.ac.currentTime;
      this.gains[n]!.gain.setTargetAtTime(1, t, this.fade / 3);
      this.gains[this.cur]!.gain.setTargetAtTime(0, t, this.fade / 3);
      const old = a;
      setTimeout(() => old.pause(), this.fade * 1000 + 300);
      this.cur = n;
    }
  }

  /** Target level 0..1 (smoothed). The bed starts on the first non-zero level, sleeps after 12 s of silence. */
  set(v: number, t = 1.2) {
    if (!this.ok) return;
    if (v > 0.002 && !this.started) this.start();
    this.output.gain.setTargetAtTime(v, this.ac.currentTime, t);
    const now = performance.now();
    if (v > 0.002) {
      this.quietSince = 0;
      if (this.started && this.els[this.cur]!.paused) void this.els[this.cur]!.play().catch(() => {});
    } else if (this.started) {
      if (!this.quietSince) this.quietSince = now;
      else if (now - this.quietSince > 12000) for (const e of this.els) e.pause();
    }
    this.level = v;
  }

  get playing() {
    return this.started && this.level > 0.002;
  }

  dispose() {
    clearInterval(this.timer);
    for (const e of this.els) {
      e.pause();
      e.removeAttribute('src');
      e.load();
    }
    this.output.disconnect();
  }
}

/** One-shot recordings (bird calls, roosters...), decoded once and shared. */
const shots = new Map<string, Promise<AudioBuffer | null>>();
export function loadShot(ac: AudioContext, url: string): Promise<AudioBuffer | null> {
  let p = shots.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ac.decodeAudioData(b))
      .catch(() => null);
    shots.set(url, p);
  }
  return p;
}
