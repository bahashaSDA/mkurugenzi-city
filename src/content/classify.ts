// Same rules as tools/fetch-episodes.py. Keep the two in sync.
export interface Episode {
  youtubeId: string;
  title: string;
  show: string;
  season: number | null;
  episode: number | null;
  durationSec: number | null;
  published?: string;
}

const SHOWS: [string, RegExp][] = [
  ['Mkurugenzi Minisodes', /mini?s?odes?|minsode/i],
  ['Mkurugenzi Diastories', /diastor/i],
  ['Young and Stupid', /young\s*(&|and|n)\s*stupid/i],
  ['Headline Hitters', /headline\s*hitters?/i],
  ['Stories of My Life', /stories\s*of\s*my\s*life/i],
  ['Celebrity First Encounters', /first\s*encounter/i],
  ['The Play House', /play\s*house/i],
  ['Shorts', /#shorts/i],
];

/** SPEC 2.5 privacy: nothing about his home or private purchases goes into the world. */
export const PRIVATE = /own a home|home owners|closing day|best purchase ever/i;

export function classify(title: string): string {
  for (const [name, rx] of SHOWS) if (rx.test(title)) return name;
  return 'Other Stories';
}

export function seasonEpisode(title: string): [number | null, number | null] {
  let m = /(\d+)\s*(?:\|\||-|,)?\s*ep(?:isode)?\.?\s*(\d+)/i.exec(title);
  if (m) return [Number(m[1]), Number(m[2])];
  m = /ep(?:isode)?\.?\s*(\d+)/i.exec(title);
  return m ? [null, Number(m[1])] : [null, null];
}

export function toEpisode(youtubeId: string, rawTitle: string, published?: string): Episode | null {
  const title = rawTitle.replace(/\s+/g, ' ').trim();
  if (PRIVATE.test(title)) return null;
  const [season, episode] = seasonEpisode(title);
  return { youtubeId, title, show: classify(title), season, episode, durationSec: null, published };
}
