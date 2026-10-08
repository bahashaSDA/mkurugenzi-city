import { useEffect, useState } from 'react';
import { useGame } from './store';

/** SPEC 12.1: title, a matatu travelling along a route as the progress bar, and "Tap to enter". */
export function Splash({ ready }: { ready: boolean }) {
  // drei's useProgress is deliberately not used here: it would pull the 3D bundle into the
  // splash chunk. The game signals `ready` once every Suspense boundary has resolved.
  const phase = useGame((s) => s.phase);
  const [shown, setShown] = useState(0);

  const target = phase === 'detecting' ? 5 : ready ? 100 : 90;
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown((s) => (Math.abs(target - s) < 0.1 ? target : s + (target - s) * (ready ? 0.2 : 0.02))));
    return () => cancelAnimationFrame(id);
  }, [shown, target]);

  const canEnter = ready;
  const enter = () => {
    if (!canEnter) return;
    // The first user gesture also unlocks audio (Phase 1 audio system hooks in here).
    useGame.getState().setPhase('playing');
  };

  return (
    <div className="splash">
      <div className="splash-inner">
        <p className="splash-kicker">Wakurugenzi, karibuni</p>
        <h1 className="splash-title">
          MKURUGENZI <span>CITY</span>
        </h1>
        <div className="route" aria-label={`Loading ${Math.round(shown)}%`}>
          <div className="route-line" />
          <div className="route-stops">
            <span>Stage</span>
            <span>Tao</span>
            <span>Mtaa</span>
          </div>
          <div className="matatu" style={{ left: `${shown}%` }}>
            <svg viewBox="0 0 64 28" width="64" height="28" aria-hidden>
              <rect x="2" y="4" width="58" height="16" rx="4" fill="#FFC72C" />
              <rect x="2" y="13" width="58" height="3" fill="#0B5D3B" />
              <rect x="8" y="7" width="9" height="5" rx="1" fill="#0E0E10" />
              <rect x="20" y="7" width="9" height="5" rx="1" fill="#0E0E10" />
              <rect x="32" y="7" width="9" height="5" rx="1" fill="#0E0E10" />
              <rect x="46" y="7" width="12" height="6" rx="1" fill="#0E0E10" />
              <circle cx="15" cy="21" r="4" fill="#0E0E10" />
              <circle cx="49" cy="21" r="4" fill="#0E0E10" />
              <rect x="2" y="21" width="58" height="1.5" fill="#FF2E88" opacity="0.8" />
            </svg>
          </div>
        </div>
        <button className="enter-btn" onClick={enter} disabled={!canEnter}>
          {canEnter ? 'Tap to enter' : 'Loading…'}
        </button>
        <p className="splash-note">A fan-made world celebrating the stories of Abel Mutua.</p>
      </div>
    </div>
  );
}
