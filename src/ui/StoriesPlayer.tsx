import { useEffect, useRef } from 'react';
import { nextAfter, pickStart, stories, useStories } from '../systems/audio/stories';
import { useRadio } from '../systems/audio/radio';
import type { Episode } from '../content/classify';

// YouTube's embedded player for the Mkurugenzi Stories station (systems/audio/stories): small and
// visible in the radio card, never hidden. Loads the IFrame API once; tears the player down (saving
// where you were) when the station is tuned out.

interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  playVideo(): void;
  destroy(): void;
  getIframe?(): HTMLIFrameElement;
}
interface YTNamespace {
  Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTNamespace> | null = null;
function injectApi(src: string, timeoutMs: number): Promise<YTNamespace> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => reject(new Error('YouTube could not be reached')), timeoutMs);
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      s.remove();
      reject(new Error('YouTube could not be reached'));
    };
    document.head.appendChild(s);
  });
}
function loadApi(): Promise<YTNamespace> {
  // two tries (a hosted page's first seconds share the connection with big downloads)
  api ??= injectApi('https://www.youtube.com/iframe_api', 15000)
    .catch(() => injectApi(`https://www.youtube.com/iframe_api?r=${Date.now()}`, 20000))
    .catch((e) => {
      api = null;
      throw e;
    });
  return api;
}

/** Without the IFrame API (blocked script, strict network) a plain embed still plays the episode. */
function plainEmbed(el: HTMLElement, ep: Episode, t: number) {
  const f = document.createElement('iframe');
  f.width = '192';
  f.height = '108';
  f.allow = 'autoplay; encrypted-media';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.style.border = '0';
  f.src = `https://www.youtube-nocookie.com/embed/${ep.youtubeId}?autoplay=1&start=${Math.floor(t)}&playsinline=1&rel=0&modestbranding=1&controls=0&iv_load_policy=3`;
  el.replaceChildren(f);
}

export function StoriesPlayer() {
  const host = useRef<HTMLDivElement>(null);
  const volume = useRadio((s) => s.volume);
  const player = useRef<YTPlayer | null>(null);
  const ep = useStories((s) => s.episode);
  const status = useStories((s) => s.status);
  const error = useStories((s) => s.error);

  useEffect(() => {
    let dead = false;
    let cur: Episode | null = null;
    let saveTimer = 0;
    const el = document.createElement('div');
    host.current?.appendChild(el);
    const play = (e: Episode, t: number) => {
      cur = e;
      useStories.setState({ episode: e, status: 'loading' });
      useRadio.setState({ now: e.title });
      player.current?.loadVideoById({ videoId: e.youtubeId, startSeconds: Math.floor(t) });
    };
    (async () => {
      try {
        const start = await pickStart();
        if (dead || !start.ep) {
          if (!start.ep) useStories.setState({ status: 'error', error: 'No episodes available right now' });
          return;
        }
        let YT: YTNamespace;
        try {
          YT = await loadApi();
        } catch {
          if (dead) return;
          cur = start.ep;
          plainEmbed(el, start.ep, start.t);
          useStories.setState({ episode: start.ep, status: 'playing', error: '' });
          useRadio.setState({ now: start.ep.title });
          return;
        }
        if (dead) return;
        cur = start.ep;
        useStories.setState({ episode: start.ep, status: 'loading' });
        useRadio.setState({ now: start.ep.title });
        player.current = new YT.Player(el, {
          width: 192, height: 108, videoId: start.ep.youtubeId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { origin: location.origin, widget_referrer: location.href, enablejsapi: 1, autoplay: 1, start: Math.floor(start.t), playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1, iv_load_policy: 3 },
          events: {
            onReady: () => {
              player.current?.getIframe?.().setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
              player.current?.setVolume(Math.round(useRadio.getState().volume * 100));
              player.current?.playVideo();
            },
            onStateChange: (ev: { data: number }) => {
              const S = YT.PlayerState;
              if (ev.data === S.PLAYING) useStories.setState({ status: 'playing', error: '' });
              else if (ev.data === S.BUFFERING) useStories.setState({ status: 'buffering' });
              else if (ev.data === S.PAUSED) useStories.setState({ status: 'paused' });
              else if (ev.data === S.ENDED && cur) {
                stories.finished(cur);
                const done = cur;
                void nextAfter(done.youtubeId).then((n) => !dead && n && play(n, 0));
              }
            },
            onError: (ev: { data: number }) => {
              if (!cur) return;
              // 100 removed, 101/150 not embeddable: drop it and move on. Anything else (153 is a
              // page/referrer configuration error, 2/5 a bad request) is not the video's fault:
              // fall back to a plain embed of the same episode instead of blacklisting it.
              if (ev.data !== 100 && ev.data !== 101 && ev.data !== 150) {
                const h = host.current;
                const t = (() => { try { return player.current?.getCurrentTime() ?? 0; } catch { return 0; } })();
                player.current?.destroy();
                player.current = null;
                if (h) plainEmbed(h, cur, t);
                useStories.setState({ status: 'playing', error: '' });
                return;
              }
              stories.unavailable(cur);
              const bad = cur;
              void nextAfter(bad.youtubeId).then((n) => !dead && n && play(n, 0));
            },
          },
        });
        saveTimer = window.setInterval(() => {
          const p = player.current;
          if (p && cur && useStories.getState().status === 'playing') stories.progress(cur, p.getCurrentTime());
        }, 4000);
      } catch (e) {
        if (!dead) useStories.setState({ status: 'error', error: String((e as Error).message ?? e) });
      }
    })();
    return () => {
      dead = true;
      clearInterval(saveTimer);
      const p = player.current;
      if (p && cur) {
        try {
          stories.progress(cur, p.getCurrentTime());
        } catch {
          /* player not ready */
        }
      }
      p?.destroy();
      player.current = null;
      el.remove();
      useStories.setState({ status: 'idle' });
    };
  }, []);

  useEffect(() => {
    player.current?.setVolume(Math.round(volume * 100));
  }, [volume]);

  return (
    <div className="stories">
      <div className="stories-video" ref={host} />
      <div className="stories-meta">
        <b>{ep ? ep.title.replace(/\s*\|\|?.*$/, '') : 'Tuning in…'}</b>
        <small>
          {ep ? [ep.show, ep.season && `S${ep.season}`, ep.episode && `Ep ${ep.episode}`].filter(Boolean).join(' · ') : ''}
          {status === 'buffering' || status === 'loading' ? ' · buffering…' : ''}
          {status === 'error' ? ` · ${error}` : ''}
        </small>
      </div>
    </div>
  );
}
