import { useEffect, useMemo, useState } from 'react';
import { useGame } from './store';

// Cinematic loader (owner brief): a full-bleed, muted Mkurugenzi episode playing behind the title,
// a big loading counter, words cycling through his world, the title revealed letter by letter,
// then a curtain wipe into the game. The video plays from Abel's official YouTube (embed only:
// nothing is downloaded or re-hosted, SPEC 2.5).
const FALLBACK_VIDEO = 'lAI0QRtxqVE'; // the channel's featured video (public/content/content.json)
// Video only where it can't hurt loading: not on data-saver / slow links, not under automation.
const conn = (typeof navigator !== 'undefined' ? (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection : undefined);
const VIDEO_OK = typeof navigator !== 'undefined' && !navigator.webdriver && !conn?.saveData && !/(^|-)(2g|3g)$/.test(conn?.effectiveType ?? '');
const WORDS = ['Stories', 'Matatus', 'Kibera', 'Nganyas', 'The Theatre', 'The Beach', 'Utafraaaia', 'I got you'];

export function Splash({ ready }: { ready: boolean }) {
  // drei's useProgress is deliberately not used here: it would pull the 3D bundle into the
  // splash chunk. The game signals `ready` once every Suspense boundary has resolved.
  const phase = useGame((s) => s.phase);
  const [shown, setShown] = useState(0);
  const [word, setWord] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [video, setVideo] = useState<{ id: string; start: number } | null>(null);
  const [subs, setSubs] = useState<number | null>(null);

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
    fetch('/content/content.json')
      .then((r) => r.json())
      .then((c: { featuredVideo?: string; episodes?: { youtubeId: string }[]; stats?: { youtubeSubscribers?: number } }) => {
        if (!alive) return;
        const pool = [c.featuredVideo, ...(c.episodes ?? []).slice(0, 6).map((e) => e.youtubeId)].filter(Boolean) as string[];
        setVideo({ id: pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_VIDEO, start: 45 + Math.floor(Math.random() * 120) });
        if (c.stats?.youtubeSubscribers) setSubs(c.stats.youtubeSubscribers);
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
    // The first user gesture also unlocks audio; the curtain finishes, then the game takes over.
    setTimeout(() => useGame.getState().setPhase('playing'), 900);
  };
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
    <div className={`splash2${leaving ? ' leaving' : ''}${canEnter ? ' ready' : ''}`}>
      <div className="sp-video" aria-hidden style={{ ['--sp-scale' as string]: cover }}>
        {video && <div className="sp-poster" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${video.id}/hqdefault.jpg)` }} />}
        {video && VIDEO_OK && (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${video.id}&start=${video.start}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`}
            title="Mkurugenzi"
            allow="autoplay; encrypted-media"
            tabIndex={-1}
          />
        )}
      </div>
      <div className="sp-shade" />
      <div className="sp-grain" />

      <header className="sp-top">
        <span>Wakurugenzi, karibuni</span>
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
