import { Suspense, lazy, useEffect, useState } from 'react';
import { useGame } from './store';
import { detectTier, hasWebGL2 } from '../perf/tiers';
import { BUDGETS } from '../perf/budgets';
import { Splash } from './Splash';
import { Fallback } from './Fallback';

// The 3D bundle (three, R3F, Rapier) loads in parallel with the splash and never on the fallback page.
const Game = lazy(() => import('./Game'));

export function App() {
  const phase = useGame((s) => s.phase);
  const [gameReady, setGameReady] = useState(false);

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
      g.setDpr(Math.min(BUDGETS[tier].dprMax, window.devicePixelRatio || 1));
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
          <Game onReady={() => setGameReady(true)} />
        </Suspense>
      )}
      {phase !== 'playing' && <Splash ready={gameReady} />}
    </>
  );
}
