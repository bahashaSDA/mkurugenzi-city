import { useEffect, useState } from 'react';
import { useHealth } from '../game/health';

/** GTA V-style: a health bar under the radar, a red pulse when hurt, and "WASTED". */
export function HealthUI() {
  const hp = useHealth((s) => s.hp);
  const hurtAt = useHealth((s) => s.hurtAt);
  const wasted = useHealth((s) => s.wasted);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!hurtAt) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 380);
    return () => clearTimeout(t);
  }, [hurtAt]);

  return (
    <>
      <div className="health-bar" aria-label={`Health ${Math.round(hp)}`}>
        <span style={{ width: `${hp}%`, background: hp < 25 ? '#d8352a' : '#58a34a' }} className={hp < 25 ? 'low' : ''} />
      </div>
      <div className={`hurt-vignette${flash ? ' on' : ''}${hp < 25 && !wasted ? ' low' : ''}`} />
      {wasted && (
        <div className="wasted">
          <div className="wasted-band">
            <h2>WASTED</h2>
          </div>
          <p>Waking up at {wasted.hospital.name}…</p>
        </div>
      )}
    </>
  );
}
