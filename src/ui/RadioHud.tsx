import { useEffect, useState } from 'react';
import { radio, STATIONS, useRadio } from '../systems/audio/radio';
import { inputLock, onKeyPress } from '../systems/input';
import { useGame } from '../app/store';
import { useStories } from '../systems/audio/stories';
import { StoriesPlayer } from './StoriesPlayer';

/**
 * Compact car-radio card (top centre, GTA style): station name and colour, what's on, an
 * equaliser that moves while it plays, volume, and the key hints. Shows for a few seconds after
 * getting in or touching a control, then shrinks to a small strip so it never covers the road.
 */
export function RadioHud() {
  const st = useRadio();
  const isTouch = useGame((s) => s.isTouch);
  const storiesOn = useStories((s) => s.active);
  const [, tick] = useState(0);
  useEffect(() => {
    // (not while a menu or the map has the keyboard)
    const k = (fn: () => void) => () => !inputLock.ui && fn();
    const offs = [
      onKeyPress('Comma', k(() => radio.step(-1))),
      onKeyPress('Period', k(() => radio.step(1))),
      onKeyPress('Minus', k(() => radio.volume(-0.1))),
      onKeyPress('Equal', k(() => radio.volume(0.1))),
      onKeyPress('KeyR', k(() => radio.toggle())),
    ];
    const id = setInterval(() => tick((t) => t + 1), 500);
    return () => {
      offs.forEach((f) => f());
      clearInterval(id);
    };
  }, []);
  if (!st.inVehicle) return null;
  const station = STATIONS[st.index]!;
  const expanded = performance.now() - st.changedAt < 4500;
  return (
    <div className={`radio${expanded ? ' expanded' : ''}${st.on ? '' : ' off'}`} style={{ ['--st' as string]: station.color }} aria-live="polite">
      <div className="radio-row">
        <span className="radio-dot" aria-hidden />
        <b className="radio-name">{st.on ? station.name : 'Radio off'}</b>
        {st.on && (
          <span className="radio-eq" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      {storiesOn && <StoriesPlayer />}
      {expanded && st.on && (
        <>
          {!storiesOn && <div className="radio-now">{st.now || station.tagline}</div>}
          <div className="radio-stations" aria-label="Stations">
            {STATIONS.map((s, i) => (
              <span key={s.id} className={i === st.index ? 'cur' : ''} style={{ background: s.color }} title={s.name} />
            ))}
          </div>
          <div className="radio-vol" aria-label={`Volume ${Math.round(st.volume * 100)}%`}>
            <span style={{ width: `${st.volume * 100}%` }} />
          </div>
        </>
      )}
      {expanded && (
        <div className="radio-keys">
          {isTouch ? (
            <>
              <button onClick={() => radio.step(-1)} aria-label="Previous station">◀</button>
              <button onClick={() => radio.toggle()} aria-label="Radio on or off">⏻</button>
              <button onClick={() => radio.step(1)} aria-label="Next station">▶</button>
            </>
          ) : (
            <>
              <kbd>,</kbd>
              <kbd>.</kbd> station · <kbd>-</kbd>
              <kbd>=</kbd> volume · <kbd>R</kbd> {st.on ? 'off' : 'on'}
            </>
          )}
        </div>
      )}
    </div>
  );
}
