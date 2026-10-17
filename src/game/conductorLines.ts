// What matatu, nganya and bus conductors say, by situation. Kenyan Swahili / Sheng the way a
// conductor actually sells seats (short, fast, friendly), each with an English subtitle. Picked at
// random without repeating the last line, so a stage never loops one phrase. {stop} is the next
// stage, {fare} the fare.

export type ConductorContext =
  | 'call' // calling passengers at a stage
  | 'invite' // Abel walks up to the door
  | 'board' // Abel climbs in and pays
  | 'full' // no seats: stand and hold the rail
  | 'broke' // Abel can't pay
  | 'depart' // pulling away
  | 'toDriver' // to the driver
  | 'arrive' // arriving at a stop (Abel aboard)
  | 'wait' // Abel wants off between stops
  | 'alight' // Abel gets off
  | 'hail' // pulling over for Abel's wave
  | 'ride'; // chatting on the way (Abel aboard)

interface L {
  sw: string;
  en: string;
}

export const LINES: Record<ConductorContext, L[]> = {
  call: [
    { sw: '{stop}! {stop}! Twende!', en: '{stop}! Let\'s go!' },
    { sw: '{stop}, kuna space! Panda panda!', en: '{stop}, seats free! Get in!' },
    { sw: 'Mbili mbili {stop}! Tunaondoka sasa!', en: 'Two more for {stop}! We\'re leaving now!' },
    { sw: 'Mia moja... hapana, {fare} tu! {stop}!', en: 'A hundred... no, just {fare}! {stop}!' },
    { sw: 'Haraka haraka, gari inajaa! {stop}!', en: 'Hurry, it\'s filling up! {stop}!' },
    { sw: 'Madam, {stop}? Kuna kiti dirishani!', en: 'Madam, {stop}? There\'s a window seat!' },
    { sw: '{stop} tu-tu-tu! Kuna space, panda tu-go!', en: 'Straight to {stop}! There\'s space, get in and let\'s go!' },
    { sw: 'Manze, {stop} ni {fare} bob! Gari ni moto, ingia!', en: 'Yo, {stop} is {fare} bob! Hot ride, get in!' },
    { sw: 'Msee wa {stop}, kuja! Hii gari iko na vibe mbaya!', en: 'Anyone for {stop}, come! This ride has serious vibes!' },
    { sw: 'Mathe, {stop}? Kiti ya dirisha iko!', en: 'Ma\'am, {stop}? The window seat is free!' },
    { sw: 'Sasa, {stop} direct! Hatusimami ovyo!', en: 'Now, {stop} direct! No stopping all over!' },
    { sw: 'Wee buda, {stop}? Panda tukupeleke!', en: 'Hey man, {stop}? Get in, we\'ll take you!' },
  ],
  invite: [
    { sw: 'Karibu, boss! Panda, tunaenda {stop}!', en: 'Welcome, boss! Get in, we\'re going to {stop}!' },
    { sw: 'Mkurugenzi! Kiti iko, karibu!', en: 'Mkurugenzi! There\'s a seat for you!' },
    { sw: 'Boss, {stop}? Panda tukuende!', en: 'Boss, {stop}? Get in, let\'s go!' },
    { sw: 'Niaje boss! {stop}? Panda tu-chill!', en: 'Hey boss! {stop}? Get in and chill!' },
    { sw: 'Ah, Mkurugenzi mwenyewe! Leo ni free... utani, ni {fare}!', en: 'Ah, the Mkurugenzi himself! Today it\'s free... joking, it\'s {fare}!' },
    { sw: 'Boss, ingia ndani, si uko na ganji ya {fare}?', en: 'Boss, get in, you\'ve got the {fare} on you, right?' },
  ],
  board: [
    { sw: 'Fare ni {fare}, asante boss!', en: 'The fare is {fare}, thanks boss!' },
    { sw: '{fare} bob, poa! Kaa nyuma hapo.', en: '{fare} shillings, cool! Sit at the back there.' },
    { sw: 'Asante! Jifunge, tunaondoka.', en: 'Thanks! Belt up, we\'re leaving.' },
    { sw: 'Doo ni {fare}, asante msee! Songa nyuma kidogo.', en: 'The fare\'s {fare}, thanks bro! Move back a little.' },
    { sw: 'Poa! Tulia hapo, tunaondoka saa hii.', en: 'Cool! Relax there, we leave right now.' },
    { sw: 'Asante boss, change yako hii hapa. Kaa ukae!', en: 'Thanks boss, here\'s your change. Have a seat!' },
  ],
  full: [
    { sw: 'Imejaa! Simama hapo, shika rail.', en: 'It\'s full! Stand there and hold the rail.' },
    { sw: 'Hakuna kiti, boss, lakini tutafika tu!', en: 'No seats, boss, but we\'ll get there!' },
    { sw: 'Imejaa kabisa, lakini tutakusqueeze! Shika rail, boss.', en: 'Completely full, but we\'ll squeeze you in! Hold the rail, boss.' },
  ],
  broke: [
    { sw: 'Pesa haitoshi, boss. Gari inayofuata!', en: 'Not enough money, boss. Next one!' },
    { sw: 'Hapana boss, {fare} bob kwanza.', en: 'No boss, {fare} shillings first.' },
    { sw: 'Aki boss, bila doo hakuna kuride. Pole!', en: 'Honestly boss, no cash, no ride. Sorry!' },
  ],
  depart: [
    { sw: 'Twende! Twende!', en: 'Let\'s go! Let\'s go!' },
    { sw: 'Sawa dere, songa!', en: 'Okay driver, move!' },
    { sw: 'Tumejaa, tuende!', en: 'We\'re full, let\'s go!' },
    { sw: 'Dere, songa! Tuko late!', en: 'Driver, move! We\'re late!' },
    { sw: 'Twende kazi! Wasee, tuko rada?', en: 'Let\'s get going! Folks, everyone ready?' },
  ],
  toDriver: [
    { sw: 'Dere, pole pole kwa bump!', en: 'Driver, slowly over the bump!' },
    { sw: 'Dere, simama {stop}, kuna mtu anashuka.', en: 'Driver, stop at {stop}, someone\'s getting off.' },
    { sw: 'Dere, kanjo wako mbele, punguza!', en: 'Driver, the county askaris are ahead, slow down!' },
  ],
  arrive: [
    { sw: '{stop}! {stop}! Shukisha!', en: '{stop}! Anyone getting off?' },
    { sw: 'Stage ya {stop}! Mnashuka?', en: '{stop} stage! Getting off?' },
    { sw: 'Hapa ni {stop}, boss! Stage yako?', en: 'This is {stop}, boss! Your stop?' },
    { sw: '{stop} stage! Kama ni wewe, shuka haraka msee!', en: '{stop} stage! If it\'s yours, hop off quick, bro!' },
  ],
  wait: [
    { sw: 'Ngoja stage ifike, boss!', en: 'Wait for the next stop, boss!' },
    { sw: 'Stage yako iko mbele, tulia!', en: 'Your stop is just ahead, relax!' },
    { sw: 'Tulia boss, hatuwezi simama hapa, kanjo watatushika!', en: 'Easy boss, we can\'t stop here, the county askaris will catch us!' },
  ],
  alight: [
    { sw: 'Shukisha! Asante boss.', en: 'Off you go! Thanks boss.' },
    { sw: 'Poa, safari njema!', en: 'Cool, safe journey!' },
    { sw: 'Asante, karibu tena!', en: 'Thanks, come again!' },
    { sw: 'Poa msee, enjoy! Uende salama.', en: 'Cool bro, enjoy! Go well.' },
    { sw: 'Fiti boss, tukutane tena!', en: 'Alright boss, see you again!' },
  ],
  hail: [
    { sw: 'Mkurugenzi! Panda, {stop}!', en: 'Mkurugenzi! Get in, {stop}!' },
    { sw: 'Umeita gari? Karibu boss!', en: 'You waved? Welcome, boss!' },
    { sw: 'Eeh boss, ume-wave? Ingia, tuko na space!', en: 'Hey boss, you waved? Get in, we\'ve got space!' },
  ],
  ride: [
    { sw: 'Wasee, shikilieni doo zenu, tunakuja kucollect.', en: 'Folks, have your fares ready, we\'re coming to collect.' },
    { sw: 'Dere, weka ile ngoma ya gengetone! Volume juu!', en: 'Driver, put on that gengetone track! Volume up!' },
    { sw: 'Mkurugenzi, leo una story gani? Tunataka kusikia!', en: 'Mkurugenzi, what\'s the story today? We want to hear it!' },
    { sw: 'Hii jam si mchezo! Dere, chukua shortcut.', en: 'This jam is no joke! Driver, take the shortcut.' },
    { sw: 'Mama, unashuka stage ijayo? Niambie mapema.', en: 'Ma\'am, getting off at the next stop? Tell me early.' },
    { sw: 'Wasee, hii ndio gari fresh zaidi kwa route hii, sio?', en: 'Folks, this is the freshest ride on this route, right?' },
  ],
};

const last = new Map<ConductorContext, number>();

/** A line for the situation, never the same as last time. */
export function conductorLine(ctx: ConductorContext, vars: { stop?: string; fare?: number } = {}): { text: string; en: string } {
  const pool = LINES[ctx];
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === last.get(ctx)) i = (i + 1) % pool.length;
  last.set(ctx, i);
  const fill = (s: string) => s.replace(/\{stop\}/g, vars.stop ?? 'Tao').replace(/\{fare\}/g, String(vars.fare ?? 50));
  return { text: fill(pool[i]!.sw), en: fill(pool[i]!.en) };
}
