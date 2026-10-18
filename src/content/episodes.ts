import { toEpisode, type Episode } from './classify';

// Keeps the in-world episode list in step with Abel's channel without editing files:
//  1. content.json   full catalogue (refreshed daily by .github/workflows/refresh-episodes.yml)
//  2. /api/latest-episodes   his 15 newest uploads, read live from the channel feed by a small
//     server function (api/latest-episodes.ts), so new uploads appear within the hour
//  3. isAvailable()  asks YouTube (oEmbed, CORS-enabled) whether a video still exists right
//     before it is shown or played, so removed/private videos disappear immediately

export interface Content {
  links: Record<string, string>;
  episodes: Episode[];
  shows?: string[];
  featuredVideo?: string;
  contact?: { email?: string; formUrl?: string };
  [k: string]: unknown;
}

const LATEST_URL = '/api/latest-episodes';
const CACHE_KEY = 'mk.videoAvailability.v1';
const CACHE_TTL_MS = 24 * 3600 * 1000;

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

let contentPromise: Promise<Content> | null = null;

/** The catalogue baked into the bundle (vite.config.ts): used whenever the network copy can't be had. */
async function bundled(): Promise<Content> {
  try {
    const m = await import('virtual:mk-content');
    return structuredClone(m.default);
  } catch {
    return { links: {}, episodes: [] };
  }
}

/** content.json merged with any brand-new uploads (newest first). Never throws, never empty if the build has episodes. */
export function loadContent(): Promise<Content> {
  contentPromise ??= (async () => {
    // the network copy is fresher (refreshed daily); two tries, generous timeouts (the first
    // seconds of a hosted game share the connection with large model downloads)
    let base = await fetchJson<Content>('/content/content.json', 20000);
    if (!base?.episodes?.length) base = await fetchJson<Content>(`/content/content.json?r=${Date.now()}`, 20000);
    if (!base?.episodes?.length) base = await bundled();
    const latest = await fetchJson<{ videos: { id: string; title: string; published: string }[] }>(LATEST_URL, 6000);
    if (latest?.videos?.length) {
      const known = new Set(base.episodes.map((e) => e.youtubeId));
      const fresh = latest.videos
        .filter((v) => !known.has(v.id))
        .map((v) => toEpisode(v.id, v.title, v.published))
        .filter((e): e is Episode => !!e);
      base.episodes = [...fresh, ...base.episodes];
    }
    // nothing at all: let the next caller try again rather than caching an empty list forever
    if (!base.episodes.length) contentPromise = null;
    return base;
  })();
  return contentPromise;
}

// ---- availability (removed / private videos) ----
type Cache = Record<string, { ok: boolean; at: number }>;
const memory = new Map<string, Promise<boolean>>();

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache;
  } catch {
    return {};
  }
}
function writeCache(id: string, ok: boolean) {
  try {
    const c = readCache();
    c[id] = { ok, at: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable: the in-memory cache still works for this visit */
  }
}

/** True if the video is still public on YouTube. Network errors count as available (fail open). */
export function isAvailable(youtubeId: string): Promise<boolean> {
  const hit = memory.get(youtubeId);
  if (hit) return hit;
  const cached = readCache()[youtubeId];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    const p = Promise.resolve(cached.ok);
    memory.set(youtubeId, p);
    return p;
  }
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
  const p = fetch(url)
    .then((r) => {
      // 404 = removed, 401/403 = private or embedding disabled: either way, not playable in-world.
      const ok = r.ok;
      if (r.ok || r.status === 404 || r.status === 401 || r.status === 403) writeCache(youtubeId, ok);
      return r.status >= 500 ? true : ok;
    })
    .catch(() => true);
  memory.set(youtubeId, p);
  return p;
}

/** Filters a (display-sized) list down to videos that still exist, checking in parallel. */
export async function onlyAvailable(list: Episode[]): Promise<Episode[]> {
  const flags = await Promise.all(list.map((e) => isAvailable(e.youtubeId)));
  return list.filter((_, i) => flags[i]);
}

/** Call when the YouTube player reports error 100/101/150 (removed / not embeddable). */
export function markUnavailable(youtubeId: string) {
  memory.set(youtubeId, Promise.resolve(false));
  writeCache(youtubeId, false);
}
