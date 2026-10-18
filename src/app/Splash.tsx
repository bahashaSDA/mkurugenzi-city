import { useEffect, useMemo, useRef, useState } from 'react';
import { loadContent } from '../content/episodes';
import { useGame } from './store';

// Cinematic loader (owner brief): a full-bleed Mkurugenzi episode playing behind the title (it starts
// muted, the only way a browser lets it autoplay; the first tap or key anywhere turns his voice on),
// a big loading counter, words cycling through his world, the title revealed letter by letter,
// then a curtain wipe into the game. The video plays from Abel's official YouTube (embed only:
// nothing is downloaded or re-hosted, SPEC 2.5).
const FALLBACK_VIDEO = 'lAI0QRtxqVE'; // the channel's featured video (public/content/content.json)
// Video only where it can't hurt loading: not on data-saver / slow links, not under automation.
const conn = (typeof navigator !== 'undefined' ? (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection : undefined);
const VIDEO_OK = typeof navigator !== 'undefined' && !navigator.webdriver && !conn?.saveData && !/(^|-)(2g|3g)$/.test(conn?.effectiveType ?? '');
const WORDS = ['Stories', 'Matatus', 'Kibera', 'Nganyas', 'The Theatre', 'The Beach', 'Utafraaaia', 'I got you'];

export function Splash({ ready, onGone }: { ready: boolean; onGone: () => void }) {
  // drei's useProgress is deliberately not used here: it would pull the 3D bundle into the
  // splash chunk. The game signals `ready` once every Suspense boundary has resolved.
  const phase = useGame((s) => s.phase);
  const [shown, setShown] = useState(0);
  const [word, setWord] = useState(0);
  const [leaving, setLeaving] = useState(false);
  // after "Tap to enter": the curtain covers the screen, the game starts BEHIND it, and it lifts
  // only once the game draws smoothly (the first frames of play pay one-off GPU costs: on this
  // PC 0.6-1 s of stalls that used to be the first thing a player saw)
  const [stage, setStage] = useState<'splash' | 'covered' | 'reveal'>('splash');
  const [video, setVideo] = useState<{ id: string; start: number } | null>(null);
  const [subs, setSubs] = useState<number | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [sound, setSound] = useState(false);
  // the browser refused sound before a gesture (most do on a first visit): only then is the
  // "Tap for sound" button shown; otherwise his voice starts on its own
  const [blocked, setBlocked] = useState(false);
  // YouTube's player API over postMessage (enablejsapi=1): unmute / volume on a user gesture
  const yt = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  const gestured = useRef(false);
  const soundOn = () => {
    gestured.current = true;
    if (sound) return;
    yt('unMute');
    yt('setVolume', [80]);
    yt('playVideo');
    setSound(true);
  };
  // Sound without a tap where the browser allows it (Chrome does for returning visitors and sites
  // the person has played sound on): the video starts muted (always allowed), then asks to unmute
  // and listens to the player. Unmuted and playing: sound is on. Paused or still muted: the browser
  // said no, so it plays on silently (never a frozen frame) until the first touch, click or key.
  useEffect(() => {
    if (!video || !VIDEO_OK) return;
    let tried = 0;
    let decided = false;
    const known: { playerState?: number; muted?: boolean } = {};
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      let d: { event?: string; info?: { playerState?: number; muted?: boolean } };
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!d.info || decided) return;
      // the player reports fields piecemeal (state in one message, muted in another): merge them
      if (d.info.playerState !== undefined) known.playerState = d.info.playerState;
      if (d.info.muted !== undefined) known.muted = d.info.muted;
      const info = known;
      if (info.playerState === 1 && tried === 0) {
        tried = 1;
        yt('unMute');
        yt('setVolume', [80]);
        yt('playVideo');
        // a strict browser takes the unmute and then PAUSES the video: judge the settled state
        setTimeout(() => {
          decided = true;
          if (known.playerState === 1 && known.muted === false) setSound(true);
          else fallBack();
        }, 1400);
        return;
      }
    };
    // muted, playing on, waiting for the first touch / click / key
    const fallBack = () => {
      yt('mute');
      yt('playVideo');
      setSound(false);
      setBlocked(true);
    };
    // ...and if the pause arrives late, step back to that
    const late = (e: MessageEvent) => {
      if (!decided || e.source !== frame.current?.contentWindow || typeof e.data !== 'string' || !e.data.includes('"playerState":2')) return;
      if (!gestured.current) fallBack();
    };
    window.addEventListener('message', late);
    window.addEventListener('message', onMsg);
    // ask the player to report its state (YouTube's iframe protocol)
    const hello = setInterval(() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'mk-splash', channel: 'widget' }), '*'), 500);
    const stop = setTimeout(() => clearInterval(hello), 15000);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('message', late);
      clearInterval(hello);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);
  useEffect(() => {
    // the first touch / click / key anywhere on the splash gives him his voice (if it isn't on yet)
    const on = () => soundOn();
    const evs = ['pointerdown', 'keydown', 'touchstart', 'click'] as const;
    for (const ev of evs) window.addEventListener(ev, on, { once: true, capture: true });
    return () => {
      for (const ev of evs) window.removeEventListener(ev, on, { capture: true });
    };
  });

  // Time-based (not per frame): while shaders compile the page may draw only a few frames, and
  // the counter must still move and finish promptly once everything is ready.
  const [t0] = useState(() => performance.now());
  const [readyAt, setReadyAt] = useState(0);
  useEffect(() => {
    if (ready && !readyAt) setReadyAt(performance.now());
  }, [ready, readyAt]);
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const loading = phase === 'detecting' ? 5 : 92 * (1 - Math.exp(-(now - t0) / 7000));
      if (!readyAt) return setShown(loading);
      const k = Math.min(1, (now - readyAt) / 700);
      setShown((s) => s + (100 - s) * k);
    }, 50);
    return () => clearInterval(id);
  }, [phase, t0, readyAt]);

  useEffect(() => {
    const id = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 1400);
    return () => clearInterval(id);
  }, []);

  // background: the featured video, or one of the latest episodes, a minute in (past the intro)
  useEffect(() => {
    let alive = true;
    loadContent()
      .then((c) => {
        if (!alive) return;
        const pool = [c.featuredVideo, ...(c.episodes ?? []).slice(0, 6).map((e) => e.youtubeId)].filter(Boolean) as string[];
        setVideo({ id: pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_VIDEO, start: 45 + Math.floor(Math.random() * 120) });
        const subs = (c.stats as { youtubeSubscribers?: number } | undefined)?.youtubeSubscribers;
        if (subs) setSubs(subs);
      })
      .catch(() => alive && setVideo({ id: FALLBACK_VIDEO, start: 60 }));
    return () => {
      alive = false;
    };
  }, []);

  const canEnter = ready && shown > 99.4;
  const enter = () => {
    if (!canEnter || leaving) return;
    setLeaving(true);
    // his voice fades under the curtain (the game's own sound takes over)
    [60, 35, 15, 0].forEach((v, i) => setTimeout(() => yt('setVolume', [v]), 150 + i * 180));
    // The first user gesture also unlocks audio; once the curtain covers the screen the game starts.
    setTimeout(() => {
      setStage('covered');
      useGame.getState().setPhase('playing');
    }, 750);
  };
  useEffect(() => {
    if (stage !== 'covered') return;
    // lift when 12 frames in a row came in under 50 ms (any device: whatever its first frames
    // cost happens under the curtain), at most 6 s after the game started
    let run = 0;
    let last = performance.now();
    let raf = 0;
    const t0 = last;
    const tick = (t: number) => {
      run = t - last < 50 ? run + 1 : 0;
      last = t;
      if (run >= 12 || t - t0 > 6000) return setStage('reveal');
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);
  useEffect(() => {
    if (stage !== 'reveal') return;
    const id = setTimeout(onGone, 950);
    return () => clearTimeout(id);
  }, [stage, onGone]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => (e.code === 'Enter' || e.code === 'Space') && enter();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const title = useMemo(() => 'MKURUGENZI'.split(''), []);
  // scale the 640x360 player to cover the screen (with a little overscan to hide YouTube's chrome)
  const [cover, setCover] = useState(3);
  useEffect(() => {
    const fit = () => setCover(Math.max(window.innerWidth / 640, window.innerHeight / 360) * 1.18);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const pct = Math.round(shown);

  return (
    <div className={`splash2${leaving ? ' leaving' : ''}${canEnter ? ' ready' : ''}${stage !== 'splash' ? ` ${stage}` : ''}`}>
      {stage === 'splash' && (
      <div className="sp-video" aria-hidden style={{ ['--sp-scale' as string]: cover }}>
        {video && <div className="sp-poster" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${video.id}/hqdefault.jpg)` }} />}
        {video && VIDEO_OK && (
          <iframe
            ref={frame}
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${video.id}&start=${video.start}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`}
            onLoad={() => sound && setTimeout(() => (yt('unMute'), yt('setVolume', [80])), 300)}
            title="Mkurugenzi"
            allow="autoplay; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            tabIndex={-1}
          />
        )}
      </div>
      )}
      <div className="sp-shade" />
      <div className="sp-grain" />

      <header className="sp-top">
        <span>Wakurugenzi, karibuni</span>
        {video && VIDEO_OK && blocked && !sound && (
          <button className={`sp-sound${sound ? ' on' : ''}`} onClick={soundOn} aria-label={sound ? 'Sound on' : 'Tap for sound'}>
            {sound ? '🔊 Sound on' : '🔇 Tap for sound'}
          </button>
        )}
        <span>{subs ? `${(subs / 1e6).toFixed(2)}M Wakurugenzi` : 'Est. Kibera'}</span>
      </header>

      <main className="sp-center">
        <h1 className="sp-title" aria-label="Mkurugenzi City">
          <span className="sp-row">
            {title.map((ch, i) => (
              <span key={i} className="sp-ch" style={{ animationDelay: `${0.25 + i * 0.06}s` }}>
                {ch}
              </span>
            ))}
          </span>
          <span className="sp-city" style={{ animationDelay: '1.05s' }}>
            CITY
          </span>
        </h1>
        <p className="sp-tag">
          A city of{' '}
          <span className="sp-word" key={word}>
            {WORDS[word]}
          </span>
        </p>
      </main>

      <footer className="sp-bottom">
        <div className="sp-count" aria-label={`Loading ${pct}%`}>
          {String(pct).padStart(2, '0')}
          <small>%</small>
        </div>
        <div className="sp-right">
          <button className="sp-enter" onClick={enter} disabled={!canEnter} aria-label={canEnter ? 'Tap to enter' : 'Loading'}>
            {canEnter ? 'Tap to enter' : 'Loading the city…'}
          </button>
          <p className="sp-note">A fan-made world celebrating the stories of Abel Mutua. Episodes play from his official YouTube.</p>
        </div>
        <div className="sp-bar">
          <span style={{ transform: `scaleX(${shown / 100})` }} />
        </div>
      </footer>
      <div className="sp-curtain" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
