import { create } from 'zustand';
import { loadContent, markUnavailable } from '../../content/episodes';
import type { Episode } from '../../content/classify';

// "Mkurugenzi Stories" on the car radio: Abel's real episodes from his YouTube channel, newest
// first (content.json + the live feed, so new uploads appear on their own). They play through
// YouTube's own embedded player, shown small in the radio card (YouTube's terms don't allow a
// hidden audio-only player). Radio rules:
//   * one episode at a time; when it ends the next (older) one starts
//   * tune away or get out, then come back: it resumes the same episode where you left it
//     (remembered per browser), so you never miss the end of a story
//   * the radio volume and R (on/off) apply; the player is torn down when not listening
// See ui/RadioHud (StoriesPlayer) for the player itself.

const KEY = 'mk.stories.v1';
interface Saved { id: string; t: number; done: string[] }

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Saved>;
    return { id: typeof s.id === 'string' ? s.id : '', t: typeof s.t === 'number' ? s.t : 0, done: Array.isArray(s.done) ? s.done.slice(-400) : [] };
  } catch {
    return { id: '', t: 0, done: [] };
  }
}

export const useStories = create<{
  /** the station is tuned in (in a vehicle, radio on): the HUD shows the player */
  active: boolean;
  episode: Episode | null;
  status: 'idle' | 'loading' | 'playing' | 'buffering' | 'paused' | 'error';
  error: string;
}>(() => ({ active: false, episode: null, status: 'idle', error: '' }));

let saved = load();
let queue: Episode[] = [];

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage blocked: it just won't resume next session */
  }
}

/** The programme: real episodes (no shorts, no live streams, nothing under 4 minutes), newest first. */
async function programme(): Promise<Episode[]> {
  if (queue.length) return queue;
  const c = await loadContent();
  // the live feed has no durations: an unknown length only counts if it's in one of his series
  // (that keeps out shorts and promos such as the merch-site clip)
  const SERIES = /minisode|diastor|young and stupid|headline|stories of my life|first encounter|play house/i;
  queue = c.episodes.filter((e) => e.show !== 'Shorts' && !/live/i.test(e.show) && (e.durationSec != null ? e.durationSec >= 240 : SERIES.test(e.show)));
  return queue;
}

/** Where to start: the episode he was listening to (and when), else the newest he hasn't finished. */
export async function pickStart(): Promise<{ ep: Episode | null; t: number }> {
  const list = await programme();
  const cur = list.find((e) => e.youtubeId === saved.id);
  if (cur) return { ep: cur, t: saved.t };
  return { ep: list.find((e) => !saved.done.includes(e.youtubeId)) ?? list[0] ?? null, t: 0 };
}

/** The episode after `id` in the programme (wrapping round). */
export async function nextAfter(id: string): Promise<Episode | null> {
  const list = await programme();
  if (!list.length) return null;
  const i = list.findIndex((e) => e.youtubeId === id);
  for (let k = 1; k <= list.length; k++) {
    const e = list[(i + k + list.length) % list.length]!;
    if (!saved.done.includes(e.youtubeId) || k === list.length) return e;
  }
  return list[0]!;
}

export const stories = {
  /** the radio tuned in / out (called by systems/audio/radio) */
  setActive(on: boolean) {
    if (useStories.getState().active !== on) useStories.setState({ active: on, status: on ? 'loading' : 'idle', error: '' });
  },
  /** the player reports where it is (every few seconds and when it stops) */
  progress(ep: Episode, t: number) {
    saved = { ...saved, id: ep.youtubeId, t: Math.max(0, t - 2) }; // back 2 s: pick up mid-sentence cleanly
    persist();
  },
  finished(ep: Episode) {
    saved = { id: '', t: 0, done: [...saved.done.filter((d) => d !== ep.youtubeId), ep.youtubeId] };
    persist();
  },
  unavailable(ep: Episode) {
    markUnavailable(ep.youtubeId);
    queue = queue.filter((e) => e.youtubeId !== ep.youtubeId);
    if (saved.id === ep.youtubeId) saved = { ...saved, id: '', t: 0 };
    persist();
  },
};
