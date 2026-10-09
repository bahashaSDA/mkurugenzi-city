#!/usr/bin/env node
// End-to-end checks for the GTA systems: a mission's cinematic briefing and objective, a street
// fight, swimming in the sea, and a night at the Grand Theatre.
//   npm run build && npx vite preview --port 4173      (other terminal)
//   node tools/gta-test.mjs [screenshotDir]
import { chromium } from 'playwright';

const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = {};
const errors = [];

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:4173/?debug&tier=low&time=12&freeze&${query}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 600000 });
  await page.waitForTimeout(4000);
  return page;
}
const mk = (page, fn, arg) => page.evaluate(fn, arg);

// 1. Mission: E at the first giver -> letterboxed briefing -> Space skips -> objective is live
{
  const page = await open('spawn=10.5,38');
  let prompt = '';
  for (let t = 0; t < 40 && !prompt.startsWith('Start mission'); t++) {
    await page.waitForTimeout(1000);
    prompt = await mk(page, () => window.__mk.usePrompt.getState().current?.label ?? '');
  }
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2500);
  const cine = await mk(page, () => window.__mk.useCutscene.getState().active);
  await page.screenshot({ path: `${SP}/gta_1_briefing.png`, timeout: 120000 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  const m = await mk(page, () => ({ active: window.__mk.useMissions.getState().active, cine: window.__mk.useCutscene.getState().active }));
  await page.screenshot({ path: `${SP}/gta_2_objective.png`, timeout: 120000 });
  results.mission = { prompt, briefingPlayed: cine, active: m.active, skipped: !m.cine };
  await page.close();
}

// 2. Fight: put a street person in front of Abel and throw punches until they go down
{
  const page = await open('spawn=10.5,38');
  await page.waitForTimeout(6000);
  const r = await mk(page, async () => {
    const { combatants, playerPosition, playerAttack } = window.__mk;
    const target = [...combatants.values()].find((c) => c.tag === 'street');
    if (!target) return { found: false };
    const hp0 = target.hp;
    // stand them right in front of Abel (playerView.facing is updated by the player each frame)
    target.x = playerPosition.x;
    target.z = playerPosition.z - 1.2;
    const fx = () => {
      target.x = playerPosition.x;
      target.z = playerPosition.z - 1.2;
    };
    for (let i = 0; i < 14 && target.state !== 'down'; i++) {
      fx();
      playerAttack(i % 4 === 3 ? 'kick' : 'punch');
      await new Promise((res) => setTimeout(res, 700));
    }
    return { found: true, hp0, hp: target.hp, state: target.state };
  });
  await page.screenshot({ path: `${SP}/gta_3_fight.png`, timeout: 120000 });
  results.fight = r;
  await page.close();
}

// 3. Swimming: start in the sea off Mkurugenzi Beach
{
  const page = await open('spawn=1660,0');
  await page.waitForTimeout(5000);
  const r = await mk(page, () => ({ swimming: window.__mk.playerAnim.swimming, y: window.__mk.playerPosition.y }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: `${SP}/gta_4_swim.png`, timeout: 120000 });
  results.swim = r;
  await page.close();
}

// 4. Theatre: rich enough for a ticket, buy at the booth, sit in Row J, the episode plays
{
  const page = await open('spawn=-188,-971');
  await mk(page, () => window.__mk.useEconomy.setState({ money: 80000 }));
  await page.waitForTimeout(6000);
  let label = await mk(page, () => window.__mk.usePrompt.getState().current?.label ?? '');
  if (label.startsWith('Buy a ticket')) await page.keyboard.press('KeyE');
  await page.waitForTimeout(800);
  const ticket = await mk(page, () => window.__mk.useTheatre.getState().ticket);
  await page.screenshot({ path: `${SP}/gta_5_lobby.png`, timeout: 120000 });
  // walk-free: jump to the seat's prompt and sit
  await mk(page, () => {
    const { playerPosition } = window.__mk;
    window.__mkTeleport = true;
    playerPosition.set(-169.7, playerPosition.y, -1000.2);
  });
  await page.evaluate(() => window.__mk.useTheatre.getState().sit());
  await page.evaluate(() => Object.assign(window.__mk.seat, { active: true, x: -169.7, y: window.__mk.playerPosition.y, z: -999.5, facing: Math.PI, camX: -169.2, camY: window.__mk.playerPosition.y + 1.5, camZ: -998.3, lookX: -170, lookY: window.__mk.playerPosition.y + 6, lookZ: -1022.6 }));
  await page.waitForTimeout(9000);
  const th = await mk(page, () => ({ seated: window.__mk.useTheatre.getState().seated, video: window.__mk.useTheatre.getState().video?.title ?? null }));
  await page.screenshot({ path: `${SP}/gta_6_theatre.png`, timeout: 120000 });
  results.theatre = { promptAtBooth: label, ticket, ...th };
  await page.close();
}

console.log(JSON.stringify(results, null, 2));
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
