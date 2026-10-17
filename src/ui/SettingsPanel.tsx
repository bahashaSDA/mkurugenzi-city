import { useState } from 'react';
import { ACTIONS, bindKey, capture, inputLock, keyFor, keyName, resetKeys } from '../systems/input';
import { useAudioSettings, type Bus } from '../systems/audio/mixer';

// Settings (Parts 6.9, 19.3, 19.4): volume per kind of sound and remappable keys. Click a key, press
// the new one (Esc cancels); a key already used by another action swaps with it, so two actions can
// never share a key. Everything is saved per browser.

const VOLUMES: [Bus | 'master', string][] = [
  ['master', 'Master'],
  ['radio', 'Radio and music'],
  ['voice', 'Voices and dialogue'],
  ['engines', 'Vehicles'],
  ['sfx', 'Effects'],
  ['ambience', 'City ambience'],
  ['world', 'Music from the world'],
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const levels = useAudioSettings((s) => s.levels);
  const setLevel = useAudioSettings((s) => s.set);
  const muted = useAudioSettings((s) => s.muted);
  const toggleMute = useAudioSettings((s) => s.toggleMute);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [, bump] = useState(0);
  const groups = [...new Set(ACTIONS.map((a) => a.group))];

  const rebind = (code: string) => {
    setWaiting(code);
    capture.fn = (k) => {
      bindKey(code, k);
      setWaiting(null);
      bump((n) => n + 1);
    };
  };

  return (
    <div className="credits-panel settings-panel" role="dialog" aria-label="Settings" onPointerDown={() => (inputLock.ui = true)}>
      <h2>Settings</h2>
      <h3>Sound</h3>
      <div className="settings-grid">
        {VOLUMES.map(([b, label]) => (
          <label key={b}>
            <span>{label}</span>
            <input type="range" min={0} max={1} step={0.05} value={levels[b]} onChange={(e) => setLevel(b, Number(e.target.value))} />
            <small>{Math.round(levels[b] * 100)}%</small>
          </label>
        ))}
        <label>
          <span>Mute everything</span>
          <input type="checkbox" checked={muted} onChange={toggleMute} />
        </label>
      </div>
      <h3>Controls</h3>
      <p className="settings-note">Click a key, then press the new one (Esc cancels). Mouse: look · left click punch · right button guard. Arrow keys also move.</p>
      {groups.map((g) => (
        <div key={g} className="settings-keys">
          <h4>{g}</h4>
          {ACTIONS.filter((a) => a.group === g).map((a) => (
            <div key={a.code} className="settings-key">
              <span>{a.label}</span>
              <button className={waiting === a.code ? 'waiting' : undefined} onClick={() => rebind(a.code)}>
                {waiting === a.code ? 'Press a key…' : keyName(keyFor(a.code))}
              </button>
            </div>
          ))}
        </div>
      ))}
      <footer>
        <button
          onClick={() => {
            resetKeys();
            bump((n) => n + 1);
          }}
        >
          Reset keys
        </button>
        <button
          onClick={() => {
            capture.fn = null;
            onClose();
          }}
        >
          Close
        </button>
      </footer>
    </div>
  );
}
