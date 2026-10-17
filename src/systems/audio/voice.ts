import { useMissions } from '../../game/missions';
import { audioContext } from './music';
import { bus, panner, setPos } from './mixer';
import { useAudioSettings } from './mixer';

// Spoken dialogue, in sync with its subtitle. One call shows the line AND voices it:
//   say({ who: 'conductor', name: 'Conductor', text: 'CBD! CBD! Kuna space!', en: 'Seats free for CBD', pos })
//
// Voice source, best first:
//   1. a pre-rendered clip listed in /audio/voice/manifest.json (played through Web Audio with a
//      panner: it comes from where the speaker stands);
//   2. the browser's speech synthesiser (Web Speech API, no paid service), ONLY with a Kenyan or
//      East African voice (sw-KE, Swahili, en-KE, en-TZ/UG; Edge and Android Chrome usually have
//      one), with a per-character pitch and rate. Never a British or American voice (owner: the
//      city speaks with a Kenyan accent). Its loudness follows distance (the Web Speech API cannot
//      pan, so far speakers are quieter, not placed);
//   3. subtitles only: speech unavailable or muted, or no Kenyan / East African voice installed.
// Every line the game says today has a clip (tools/voice-coverage.mjs checks it in the running game).
// The same line is never re-triggered by repeated frames, a newer line from the same speaker
// replaces the older one, and ending an interaction stops its voice.

export type Speaker =
  | 'conductor' | 'conductor2' | 'attendant_f' | 'attendant_m' | 'host' | 'storyteller' | 'driver' | 'passenger'
  | 'abel' | 'man1' | 'man2' | 'man3' | 'woman1' | 'woman2' | 'woman3';

interface Profile {
  lang: 'sw' | 'en';
  gender: 'm' | 'f';
  pitch: number;
  rate: number;
}

const PROFILES: Record<Speaker, Profile> = {
  conductor: { lang: 'sw', gender: 'm', pitch: 1.05, rate: 1.12 }, // fast, loud, selling seats
  conductor2: { lang: 'sw', gender: 'm', pitch: 0.85, rate: 1.05 },
  attendant_f: { lang: 'sw', gender: 'f', pitch: 1.1, rate: 0.98 },
  attendant_m: { lang: 'sw', gender: 'm', pitch: 0.95, rate: 0.98 },
  host: { lang: 'en', gender: 'm', pitch: 1.0, rate: 1.04 },
  storyteller: { lang: 'en', gender: 'm', pitch: 0.82, rate: 0.9 },
  driver: { lang: 'sw', gender: 'm', pitch: 0.8, rate: 1.0 },
  passenger: { lang: 'sw', gender: 'f', pitch: 1.15, rate: 1.0 },
  // mission characters (briefings)
  abel: { lang: 'en', gender: 'm', pitch: 0.95, rate: 1.0 },
  man1: { lang: 'en', gender: 'm', pitch: 1.05, rate: 1.05 },
  man2: { lang: 'en', gender: 'm', pitch: 0.9, rate: 1.0 },
  man3: { lang: 'en', gender: 'm', pitch: 0.8, rate: 0.95 },
  woman1: { lang: 'en', gender: 'f', pitch: 1.0, rate: 1.0 },
  woman2: { lang: 'en', gender: 'f', pitch: 1.1, rate: 1.02 },
  woman3: { lang: 'en', gender: 'f', pitch: 1.15, rate: 1.05 },
};

const FEMALE_NAME = /\b(mama|shosh|auntie|madam|mrs|ms|akinyi|njeri|wanjiru|wambui|nyokabi|nduta|wanjiku|achieng|atieno|wairimu|nyambura|muthoni|chebet|jebet|adhiambo|awino|kemunto|moraa|zawadi|neema|amani|halima|fatuma|aisha|mercy|grace|faith|joy|mary|ann)\b/i;

/** The voice a mission character speaks with (stable: the same name always sounds the same). */
export function speakerFor(name: string): Speaker {
  if (/abel|mkurugenzi/i.test(name)) return 'abel';
  if (/conductor/i.test(name)) return 'conductor';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (FEMALE_NAME.test(name)) return (['woman1', 'woman2', 'woman3'] as const)[h % 3]!;
  return (['man1', 'man2', 'man3'] as const)[h % 3]!;
}

export interface Line {
  who: Speaker;
  name: string; // subtitle name
  text: string; // spoken (and shown)
  en?: string; // translation shown in the subtitle (not spoken)
  pos?: { x: number; y: number; z: number }; // where the speaker stands (null: in your ear)
  /** 'dialogue' shows a subtitle; 'radio' is heard only (the radio HUD shows its own text) */
  channel?: 'dialogue' | 'radio';
  volume?: number;
  /** false: don't show the HUD subtitle (the cutscene letterbox shows its own) */
  subtitle?: boolean;
  onEnd?: () => void;
}

const listener = { x: 0, y: 0, z: 0 };
/** The camera/listener position, kept fresh by the audio listener update. */
export function setVoiceListener(x: number, y: number, z: number) {
  listener.x = x;
  listener.y = y;
  listener.z = z;
}

// ---- pre-rendered clips (optional) ----
export const missingVoice = new Map<string, { who: Speaker; text: string }>();
let manifest: Record<string, string> | null = null;
const clipCache = new Map<string, Promise<AudioBuffer | null>>();
if (typeof window !== 'undefined') {
  fetch('/audio/voice/manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : null))
    .then((m) => (manifest = m))
    .catch(() => (manifest = null));
}
export function clipKey(who: Speaker, text: string) {
  let h = 2166136261;
  for (const ch of `${who}|${text}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}
function loadClip(file: string): Promise<AudioBuffer | null> {
  let p = clipCache.get(file);
  if (!p) {
    const ac = audioContext();
    p = ac
      ? fetch(`/audio/voice/${file}`)
          .then((r) => r.arrayBuffer())
          .then((b) => ac.decodeAudioData(b))
          .catch(() => null)
      : Promise.resolve(null);
    clipCache.set(file, p);
  }
  return p;
}

// ---- Web Speech voices ----
let voices: SpeechSynthesisVoice[] = [];
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
function refreshVoices() {
  voices = synth?.getVoices() ?? [];
}
if (synth) {
  refreshVoices();
  synth.addEventListener?.('voiceschanged', refreshVoices);
}

const FEMALE = /zira|susan|hazel|female|woman|zuri|asilia|libby|sonia|natasha|aria|jenny|samantha|karen|moira|tessa|fiona|victoria|google uk english female/i;
function pickVoice(p: Profile, who: Speaker): SpeechSynthesisVoice | null {
  if (!voices.length) refreshVoices();
  if (!voices.length) return null;
  const by = (re: RegExp) => voices.filter((v) => re.test(v.lang.replace('_', '-')));
  // Kenyan first, then East African. Nothing else: no British or American accent in the city
  const tiers = p.lang === 'sw' ? [by(/^sw-KE/i), by(/^sw/i), by(/^en-KE/i), by(/^en-(TZ|UG)/i)] : [by(/^en-KE/i), by(/^sw-KE/i), by(/^en-(TZ|UG)/i), by(/^sw/i)];
  for (const tier of tiers) {
    if (!tier.length) continue;
    const g = tier.filter((v) => (p.gender === 'f') === FEMALE.test(v.name));
    const pool = g.length ? g : tier;
    // stable per character: the same conductor always has the same voice
    let h = 0;
    for (const ch of who) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pool[h % pool.length]!;
  }
  return null;
}

// ---- playback ----
interface Playing {
  key: string;
  who: Speaker;
  stop: () => void;
  channel: 'dialogue' | 'radio';
}
let current: Playing | null = null;
const recent = new Map<string, number>(); // line -> last start (dedupe repeated triggers)

function spokenText(t: string) {
  // speak words, not stage directions or emphasis marks
  return t.replace(/\([^)]*\)/g, '').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
}

/** Estimated duration of a spoken line (subtitle timing when the real end is unknown). */
export function lineMs(text: string, rate = 1) {
  return Math.max(1600, (spokenText(text).length / 14) * 1000 / rate + 600);
}

export function say(line: Line): void {
  const ch = line.channel ?? 'dialogue';
  const key = `${line.who}|${line.text}`;
  const now = performance.now();
  if (now - (recent.get(key) ?? -1e9) < 2500) return; // the same line twice in a row: a re-render, not a new line
  recent.set(key, now);
  if (recent.size > 200) recent.clear();
  const p = PROFILES[line.who];
  // subtitles: always for dialogue (accessibility and when audio is blocked or muted)
  if (ch === 'dialogue' && line.subtitle !== false && useAudioSettings.getState().subtitles) {
    useMissions.getState().say(line.name, line.en ? `${line.text}  (${line.en})` : line.text, lineMs(line.text, p.rate) + 400);
  }
  // radio talk never interrupts a person talking to you; dialogue interrupts radio talk
  if (current && current.channel === 'dialogue' && ch === 'radio') {
    line.onEnd?.();
    return;
  }
  stopVoice();
  const levels = useAudioSettings.getState();
  if (levels.muted) {
    setTimeout(() => line.onEnd?.(), lineMs(line.text, p.rate));
    return;
  }
  const dist = line.pos ? Math.hypot(line.pos.x - listener.x, line.pos.y - listener.y, line.pos.z - listener.z) : 0;
  const busLevel = ch === 'radio' ? levels.levels.radio : levels.levels.voice;
  // inverse distance, like the Web Audio panners (ref 3 m)
  const att = line.pos ? 3 / (3 + Math.max(0, dist - 3) * 1.3) : 1;
  const vol = Math.max(0, Math.min(1, (line.volume ?? 1) * att * busLevel * levels.levels.master));
  if (line.pos && att < 0.04) {
    setTimeout(() => line.onEnd?.(), lineMs(line.text, p.rate)); // too far to hear
    return;
  }
  const file = manifest?.[clipKey(line.who, line.text)];
  // lines with no Kenyan clip (tools/voice-coverage.mjs reads this to find what still needs rendering)
  if (!file && manifest) missingVoice.set(`${line.who}|${line.text}`, { who: line.who, text: line.text });
  if (file) {
    const ac = audioContext();
    const out = bus(ch === 'radio' ? 'radio' : 'voice');
    if (ac && out) {
      let src: AudioBufferSourceNode | null = null;
      let stopped = false;
      const play: Playing = {
        key,
        who: line.who,
        channel: ch,
        stop: () => {
          stopped = true;
          try {
            src?.stop();
          } catch {
            /* not started */
          }
        },
      };
      current = play;
      void loadClip(file).then((buf) => {
        if (stopped || !buf) return;
        src = ac.createBufferSource();
        src.buffer = buf;
        const g = ac.createGain();
        g.gain.value = line.volume ?? 1;
        if (line.pos) {
          const pn = panner(ac, 3, 1.3);
          setPos(pn, line.pos.x, line.pos.y, line.pos.z);
          src.connect(g).connect(pn).connect(out);
        } else src.connect(g).connect(out);
        src.onended = () => {
          if (current === play) current = null;
          line.onEnd?.();
        };
        src.start();
      });
      return;
    }
  }
  if (!synth) {
    setTimeout(() => line.onEnd?.(), lineMs(line.text, p.rate));
    return;
  }
  const v = pickVoice(p, line.who);
  if (!v) {
    // no Kenyan / East African voice on this device: the subtitle carries the line
    setTimeout(() => line.onEnd?.(), lineMs(line.text, p.rate));
    return;
  }
  const u = new SpeechSynthesisUtterance(spokenText(line.text));
  u.voice = v;
  u.lang = v.lang;
  u.pitch = p.pitch;
  u.rate = p.rate;
  u.volume = vol;
  let ended = false;
  const done = () => {
    if (ended) return;
    ended = true;
    if (current?.key === key) current = null;
    line.onEnd?.();
  };
  u.onend = done;
  u.onerror = done;
  current = { key, who: line.who, channel: ch, stop: () => synth.cancel() };
  try {
    synth.speak(u);
    // Chrome sometimes never fires onend for long utterances: don't hang the radio on it
    setTimeout(done, lineMs(line.text, p.rate) * 2.5 + 2000);
  } catch {
    done();
  }
}

/** Stop whatever is being said (all speakers, or only `who`). */
export function stopVoice(who?: Speaker) {
  if (!current) return;
  if (who && current.who !== who) return;
  const c = current;
  current = null;
  c.stop();
}

export function speaking(): Speaker | null {
  return current?.who ?? null;
}
