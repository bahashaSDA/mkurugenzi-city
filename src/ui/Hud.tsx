import { useEffect, useState } from 'react';
import { useGame, type QualitySetting } from '../app/store';
import { formatClock, useClock } from '../world/clock';

/** Phase 0 HUD: controls hint, camera toggle, quality preset. Phase 1 adds minimap, quests and the phone. */
export function Hud() {
  const isTouch = useGame((s) => s.isTouch);
  const quality = useGame((s) => s.quality);
  const setQuality = useGame((s) => s.setQuality);
  const cameraMode = useGame((s) => s.cameraMode);
  const toggleCamera = useGame((s) => s.toggleCamera);
  const [hint, setHint] = useState(true);
  const hours = useClock((s) => s.hours);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 9000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="hud">
      {hint && (
        <div className="hud-hint">
          {isTouch
            ? 'Left stick to move · drag right side to look · tap RUN to sprint'
            : 'Click to look · WASD move · Shift sprint · Space jump · E use · F matatu · I bag · V first-person'}
        </div>
      )}
      <div className="hud-clock" aria-label="Time of day">{formatClock(hours)}</div>
      <div className="hud-settings">
        <button onClick={toggleCamera} aria-label="Toggle camera">
          {cameraMode === 'third' ? '1st' : '3rd'}
        </button>
        <select value={quality} onChange={(e) => setQuality(e.target.value as QualitySetting)} aria-label="Graphics quality">
          <option value="auto">Auto</option>
          <option value="low">Low</option>
          <option value="mid">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
    </div>
  );
}
