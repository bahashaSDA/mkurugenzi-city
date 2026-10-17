// What people say in the street and on the ride: Nairobi Sheng, the everyday mix of Swahili,
// English and street slang (msee, manze, mathe, buda, doo, ganji, rada, fiti, kanjo, dere...).
// Every line has an English subtitle. The voices are rendered by tools/gen-voices.py (the lines are
// read from this file by tools/voice-lines.mjs, so text and clips always match).

import type { Speaker } from '../systems/audio/voice';

export interface Talk {
  sw: string;
  en: string;
}

/** A person Abel stops to talk to (E). */
export const STREET_TALK: Talk[] = [
  { sw: 'Mkurugenzi! Ile story ya jana ilinibamba mbaya!', en: 'Mkurugenzi! That story yesterday really got me!' },
  { sw: 'Makosa Ni Yangu ilinifanya nilie, si uongo msee.', en: 'Makosa Ni Yangu made me cry, no lie, bro.' },
  { sw: 'Utafraaaia! Hiyo sasa ni slogan yangu, buda.', en: 'Utafraaaia! That is my slogan now, man.' },
  { sw: 'Leo mat zimejaa. Ukienda stage, panda ile nganya ya Route 46.', en: 'The matatus are packed today. At the stage, take the Route 46 nganya.' },
  { sw: 'Boss, unajua video hall ya Kibera inaonyesha stories zako kila jioni?', en: 'Boss, did you know the Kibera video hall shows your stories every evening?' },
  { sw: 'Niko na story pia. Siku moja nitakuambia, utaitengeneza movie.', en: 'I have a story too. One day I will tell you and you will make it a movie.' },
  { sw: 'Chipo Express wako na chips masala moto. Jaribu, ni fiti!', en: 'Chipo Express has hot masala chips. Try them, they are great!' },
  { sw: 'Untying Kantai bado iko kwa kichwa yangu, aki.', en: 'Untying Kantai is still in my head, honestly.' },
  { sw: 'Wakurugenzi tuko pamoja! Hatuachani.', en: 'Wakurugenzi, we are together! We do not split.' },
  { sw: 'Sasa Mkurugenzi! Uko poa? Mambo ya podcast iko aje?', en: 'Hey Mkurugenzi! You good? How is the podcast going?' },
  { sw: 'Usinunue soda kwa kiosk ya mwisho, iko warm. Haha!', en: 'Do not buy soda at the last kiosk, it is warm. Haha!' },
  { sw: 'Hiyo flat cap ni fire, boss. Umeitoa wapi?', en: 'That flat cap is fire, boss. Where did you get it?' },
  { sw: 'Manze, ile hoodie ya Black Excellence lazima ninunue.', en: 'Man, I have to buy that Black Excellence hoodie.' },
  { sw: 'Ukipita Rocky Ridge jioni, sunset huko ni kama movie.', en: 'Pass by Rocky Ridge in the evening, the sunset there is like a movie.' },
  { sw: 'Mathe yangu anasema anakupenda kuliko mimi. Haha, ni ukweli!', en: 'My mum says she likes you more than me. Haha, it is true!' },
  { sw: 'Buda, kanjo walikuwa hapa asubuhi, wamechukua mkokoteni ya jamaa.', en: 'Man, the county askaris were here this morning, they took a guy\'s handcart.' },
  { sw: 'Niaje msee! Siku hizi uko wapi? Hatukuoni mtaa.', en: 'Hey bro! Where have you been? We do not see you around.' },
  { sw: 'Ganji imeisha, lakini tuko na hope. Tutaomoka tu.', en: 'The money is finished, but we have hope. We will make it.' },
];

/** Passers-by, as Abel walks past (short; some to him, some to each other). */
export const STREET_BARKS: Talk[] = [
  { sw: 'Niaje Mkurugenzi!', en: 'Hey, Mkurugenzi!' },
  { sw: 'Sasa boss! Mambo?', en: 'Hey boss! What\'s up?' },
  { sw: 'Wueh, ni Mkurugenzi! Selfie basi!', en: 'Whoa, it\'s the Mkurugenzi! A selfie, please!' },
  { sw: 'Manze, leo jua ni kali!', en: 'Man, the sun is fierce today!' },
  { sw: 'Buda, unaenda tao?', en: 'Man, are you going to town?' },
  { sw: 'Poa sana, tutaonana jioni.', en: 'Cool, see you in the evening.' },
  { sw: 'Aki hii stage imejaa leo.', en: 'Honestly, this stage is packed today.' },
  { sw: 'Usijali msee, tutapanga.', en: 'Don\'t worry bro, we\'ll sort it out.' },
  { sw: 'Huyu jamaa anajua kustory, ni fire!', en: 'This guy knows how to tell a story, it\'s fire!' },
  { sw: 'Kuna bash weekend, uko ndani?', en: 'There\'s a party this weekend, you in?' },
  { sw: 'Mtaa yetu iko fiti, hakuna noma.', en: 'Our hood is fine, no trouble.' },
  { sw: 'Mathe, nimekuletea zile sukuma.', en: 'Mum, I\'ve brought you the sukuma.' },
  { sw: 'Ebu nitumie doo kidogo, nitakurudishia Ijumaa.', en: 'Send me a little cash, I\'ll pay you back Friday.' },
  { sw: 'Story za Mkurugenzi ni noma, si mchezo!', en: 'The Mkurugenzi\'s stories are serious, no joke!' },
];

/** Passengers chatting on the ride. */
export const PASSENGER_TALK: Talk[] = [
  { sw: 'Manze, hii traffic imenichosha.', en: 'Man, this traffic has worn me out.' },
  { sw: 'Niko late job, boss atanikula!', en: 'I\'m late for work, my boss will eat me alive!' },
  { sw: 'Weh, ngoma hii ni fire! Dere ongeza volume!', en: 'Whoa, this song is fire! Driver, turn it up!' },
  { sw: 'Si ni yule Mkurugenzi? Wueh, nimeona stories zake zote!', en: 'Isn\'t that the Mkurugenzi? Wow, I\'ve seen all his stories!' },
  { sw: 'Fare imepanda tena, aki maisha ni ngumu.', en: 'The fare went up again, honestly life is hard.' },
  { sw: 'Nitashuka stage ijayo, kuna msupa ananingoja.', en: 'I\'m getting off at the next stop, a girl is waiting for me.' },
  { sw: 'Hii mvua ikinyesha sasa, tumeisha.', en: 'If this rain starts now, we\'re finished.' },
  { sw: 'Leo nimeamka mapema sana, nataka kulala tu.', en: 'I woke up so early today, I just want to sleep.' },
  { sw: 'Dere ako na haraka kama ako na date!', en: 'The driver is in a hurry like he has a date!' },
  { sw: 'Hii nganya iko na vibe, si kama zile za kawaida.', en: 'This ride has vibes, not like the ordinary ones.' },
];

/** The voice a street person or passenger speaks with: Swahili voices, by name (stable). */
export function streetVoice(name: string, female: boolean): Speaker {
  if (female) return 'passenger';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 ? 'man2' : 'driver';
}

const lastPick = new Map<Talk[], number>();
/** A line from the pool, never the same one twice in a row. */
export function pickTalk(pool: Talk[]): Talk {
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === lastPick.get(pool)) i = (i + 1) % pool.length;
  lastPick.set(pool, i);
  return pool[i]!;
}
