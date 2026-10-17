#!/usr/bin/env node
// Every line the game voices, with its speaker, gathered from the game's own source (so the
// rendered clips always match what the code says). Output: JSON on stdout for gen-voices.py.
//   node tools/voice-lines.mjs > voice-lines.json
// Keys must match clipKey() in src/systems/audio/voice.ts (computed there and in gen-voices.py).
import { readFileSync } from 'node:fs';
import { LINES } from '../src/game/conductorLines.ts';
import { PASSENGER_TALK, STREET_BARKS, STREET_TALK } from '../src/game/streetTalk.ts';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strings = (block) => [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
const arrayOf = (code, name) => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(code);
  return m ? strings(m[1]) : [];
};

const out = [];
const add = (who, text) => out.push({ who, text });

// ---- conductors: every stage name and fare the game can put in a line ----
const routes = src('src/systems/vehicles/routes.ts');
const stops = [...new Set([...routes.matchAll(/name: '((?:[^'\\]|\\.)*)', x:/g)].map((m) => m[1].replace(/\\'/g, "'")))];
stops.push('Tao'); // the default when a vehicle has no next stage yet
const fares = [50, 80, 40];
for (const pool of Object.values(LINES)) {
  for (const l of pool) {
    const texts = [];
    const hasStop = l.sw.includes('{stop}');
    const hasFare = l.sw.includes('{fare}');
    for (const stop of hasStop ? stops : ['']) for (const fare of hasFare ? fares : [0]) texts.push(l.sw.replace(/\{stop\}/g, stop).replace(/\{fare\}/g, String(fare)));
    for (const t of texts) for (const who of ['conductor', 'conductor2']) add(who, t);
  }
}

// ---- shop attendants ----
const att = src('src/systems/npc/Attendants.tsx');
const catalog = src('src/game/catalog.ts');
const greetings = [...catalog.matchAll(/greeting: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
for (const name of ['GREET', 'THANKS', 'BROKE', 'BYE']) for (const t of arrayOf(att, name)) for (const who of ['attendant_f', 'attendant_m']) add(who, t);
for (const t of greetings) for (const who of ['attendant_f', 'attendant_m']) add(who, t);

// ---- the street and the ride: Sheng (src/game/streetTalk.ts), Swahili voices ----
for (const l of [...STREET_TALK, ...STREET_BARKS]) for (const who of ['passenger', 'man2', 'driver']) add(who, l.sw);
for (const l of PASSENGER_TALK) for (const who of ['passenger', 'man2']) add(who, l.sw);
const peds = src('src/systems/npc/Pedestrians.tsx');
for (const t of arrayOf(peds, 'CASTING')) for (const who of ['passenger', 'man2', 'driver']) add(who, t);

// ---- the radio ----
const radio = src('src/systems/audio/radio.ts');
for (const m of radio.matchAll(/ident: '((?:[^'\\]|\\.)*)'/g)) {
  const t = m[1].replace(/\\'/g, "'");
  add('host', t);
  add('storyteller', t);
}
for (const m of radio.matchAll(/\{ who: '(host|storyteller)', title: '(?:[^'\\]|\\.)*', lines: \[([\s\S]*?)\] \}/g)) {
  for (const t of strings(m[2])) add(m[1], t);
}

// ---- Barber Kevo at the kinyozi (ui/WardrobePanel) ----
{
  const wp = src('src/ui/WardrobePanel.tsx');
  for (const t of [...arrayOf(wp, 'BARBER_START'), ...arrayOf(wp, 'BARBER_DONE')]) add('attendant_m', t);
}

// unique
const seen = new Set();
const uniq = out.filter((l) => {
  const k = `${l.who}|${l.text}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
process.stdout.write(JSON.stringify(uniq, null, 1));
console.error(`[voice-lines] ${uniq.length} lines (${stops.length} stages)`);
