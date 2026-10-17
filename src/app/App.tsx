import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useGame } from './store';
import { detectTier, hasWebGL2 } from '../perf/tiers';
import { BUDGETS } from '../perf/budgets';
import { LITE_DPR, lite } from '../perf/lite';
import { Splash } from './Splash';
import { Fallback } from './Fallback';

// The 3D bundle (three, R3F, Rapier) loads in parallel with the splash and never on the fallback page.
// Requested right away, not after the GPU check (that waits on a benchmark download: ~1 s).
const gameChunk = hasWebGL2() ? import('./Game') : null;
const Game = lazy(() => gameChunk ?? import('./Game'));

export function App() {
  const phase = useGame((s) => s.phase);
  const [gameReady, setGameReady] = useState(false);
  const onReady = useCallback(() => setGameReady(true), []);
  const [splashGone, setSplashGone] = useState(false);
  const onSplashGone = useCallback(() => setSplashGone(true), []); // stable: a new one re-ran the world's Ready

  useEffect(() => {
    if (!hasWebGL2()) {
      useGame.getState().setPhase('fallback');
      return;
    }
    let cancelled = false;
    detectTier().then(({ tier, tooWeak, gpu }) => {
      if (cancelled) return;
      const g = useGame.getState();
      if (tooWeak) return g.setPhase('fallback');
      g.setDetected(tier, gpu);
      if (gpu === 'forced') g.setQuality(tier); // ?tier=… pins quality (no adaptive changes)
      g.setDpr(Math.min(lite.on ? LITE_DPR : BUDGETS[tier].dprMax, window.devicePixelRatio || 1));
      g.setPhase('splash');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'fallback') return <Fallback />;

  return (
    <>
      {phase !== 'detecting' && (
        <Suspense fallback={null}>
          <Game onReady={onReady} />
        </Suspense>
      )}
      {!splashGone && <Splash ready={gameReady} onGone={onSplashGone} />}
    </>
  );
}
