import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { onKeyPress } from '../systems/input';
import { playerAnim } from '../systems/player/AbelModel';
import { playerPosition } from '../systems/player/playerState';
import { AREAS } from '../config/areas';
import { useEconomy } from './economy';
import { updateNearest, usePrompt } from './interactables';

/** Per-frame game rules: interaction prompt, E to use, discovery rewards, walking points,
 *  hunger, and the eat/drink animation hand-off to Abel. */
export function GameLogic() {
  const st = useRef({ t: 0, lx: playerPosition.x, lz: playerPosition.z, area: '' });

  useEffect(
    () =>
      onKeyPress('KeyE', () => {
        if (useEconomy.getState().shop) return;
        usePrompt.getState().current?.use();
      }),
    [],
  );

  useFrame((_, dt) => {
    const s = st.current;
    s.t += dt;
    const eco = useEconomy.getState();
    // eating/drinking animation request from the economy store
    if (eco.action) {
      playerAnim.action = eco.action.clip;
      playerAnim.actionUntil = eco.action.until;
      useEconomy.setState({ action: null });
    }
    if (s.t < 0.15) return;
    eco.tick(s.t);
    s.t = 0;
    updateNearest();
    const d = Math.hypot(playerPosition.x - s.lx, playerPosition.z - s.lz);
    if (d > 0.05 && d < 10 && !playerAnim.riding) eco.walked(d);
    s.lx = playerPosition.x;
    s.lz = playerPosition.z;
    for (const a of AREAS) {
      if (Math.hypot(playerPosition.x - a.x, playerPosition.z - a.z) < a.r) {
        if (s.area !== a.name) {
          s.area = a.name;
          useEconomy.setState({ area: a.name });
          eco.discover(a.name, a.reward);
        }
        break;
      }
    }
  });
  return null;
}
