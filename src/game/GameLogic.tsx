import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { onKeyPress } from '../systems/input';
import { playerAnim } from '../systems/player/AbelModel';
import { playerPosition } from '../systems/player/playerState';
import { AREAS } from '../config/areas';
import { useEconomy } from './economy';
import { nearestFor, updateNearest, usePrompt } from './interactables';
import { checkMission } from './missions';
import { useHealth } from './health';
import { useCutscene } from './cutscene';

/** Per-frame game rules: interaction prompt, E to use, discovery rewards, walking points,
 *  hunger, and the eat/drink animation hand-off to Abel. */
function use(key: 'KeyE' | 'KeyF') {
  if (useEconomy.getState().shop || useCutscene.getState().active) return;
  const cur = usePrompt.getState().current;
  if (cur && (cur.key ?? 'KeyE') === key) cur.use();
  else nearestFor(key)?.use(); // the shown prompt is for the other key: use the nearest one for this key
}

export function GameLogic() {
  const st = useRef({ t: 0, lx: playerPosition.x, lz: playerPosition.z, area: '' });

  useEffect(
    () =>
      // E uses E-prompts (shops, doors, people); F uses F-prompts (vehicles)
      [onKeyPress('KeyE', () => use('KeyE')), onKeyPress('KeyF', () => use('KeyF'))].reduce((a, b) => () => {
        a();
        b();
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
      playerAnim.prop = eco.action.prop;
      useEconomy.setState({ action: null });
    }
    if (s.t < 0.15) return;
    eco.tick(s.t);
    useHealth.getState().tick(s.t);
    playerAnim.limp = useHealth.getState().hp < 30;
    s.t = 0;
    updateNearest();
    checkMission(null);
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
