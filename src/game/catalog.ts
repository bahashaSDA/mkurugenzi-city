// Prices are in Kenyan shillings (KSh), matching real Nairobi street prices in October 2026;
// boutique merch uses the official mkurugenzi.ke shop prices so the economy feels familiar. Fullness: how much it fills Abel (0-100).

export type ItemKind = 'food' | 'drink' | 'snack' | 'merch' | 'service';

export interface Item {
  id: string;
  name: string;
  price: number;
  kind: ItemKind;
  fullness: number;
  desc: string;
}

export const ITEMS: Record<string, Item> = {
  // market / mama mboga
  banana: { id: 'banana', name: 'Ndizi (banana)', price: 10, kind: 'food', fullness: 6, desc: 'Sweet and ripe from the stall.' },
  mango: { id: 'mango', name: 'Embe (mango)', price: 40, kind: 'food', fullness: 12, desc: 'Juicy Ngowe mango.' },
  avocado: { id: 'avocado', name: 'Parachichi (avocado)', price: 20, kind: 'food', fullness: 12, desc: 'Big Hass avocado.' },
  orange: { id: 'orange', name: 'Chungwa (orange)', price: 15, kind: 'food', fullness: 6, desc: 'Peeled and cut for you.' },
  pineapple: { id: 'pineapple', name: 'Nanasi slice', price: 30, kind: 'food', fullness: 8, desc: 'Cold pineapple slice with a toothpick.' },
  watermelon: { id: 'watermelon', name: 'Tikiti slice', price: 30, kind: 'food', fullness: 8, desc: 'Red and sweet.' },
  sugarcane: { id: 'sugarcane', name: 'Muwa (sugarcane)', price: 20, kind: 'snack', fullness: 5, desc: 'Peeled sugarcane sticks.' },
  // kiosk / duka
  soda: { id: 'soda', name: 'Soda Baridi (cold soda)', price: 60, kind: 'drink', fullness: 4, desc: 'Ice-cold glass bottle.' },
  water: { id: 'water', name: 'Maji (500 ml water)', price: 40, kind: 'drink', fullness: 3, desc: 'Bottled water.' },
  juice: { id: 'juice', name: 'Juice ya maembe', price: 50, kind: 'drink', fullness: 6, desc: 'Mango juice box.' },
  crisps: { id: 'crisps', name: 'Crisps', price: 50, kind: 'snack', fullness: 6, desc: 'Salted crisps.' },
  biscuits: { id: 'biscuits', name: 'Biskuti', price: 30, kind: 'snack', fullness: 5, desc: 'Glucose biscuits.' },
  bread: { id: 'bread', name: 'Mkate (bread)', price: 70, kind: 'food', fullness: 20, desc: 'A loaf of white bread.' },
  // hoteli
  chai: { id: 'chai', name: 'Chai', price: 30, kind: 'drink', fullness: 5, desc: 'Hot milky tea.' },
  mandazi: { id: 'mandazi', name: 'Mandazi', price: 10, kind: 'snack', fullness: 6, desc: 'Fresh this morning.' },
  chapati: { id: 'chapati', name: 'Chapati', price: 20, kind: 'food', fullness: 10, desc: 'Soft layered chapati.' },
  beans: { id: 'beans', name: 'Beans na chapo', price: 120, kind: 'food', fullness: 40, desc: 'Madondo with two chapatis.' },
  pilau: { id: 'pilau', name: 'Pilau', price: 200, kind: 'food', fullness: 55, desc: 'Spiced pilau with kachumbari.' },
  githeri: { id: 'githeri', name: 'Githeri', price: 100, kind: 'food', fullness: 40, desc: 'Maize and beans.' },
  // chips kibanda
  chips: { id: 'chips', name: 'Chips', price: 100, kind: 'food', fullness: 30, desc: 'Hot chips with tomato sauce.' },
  chips_masala: { id: 'chips_masala', name: 'Chips masala', price: 150, kind: 'food', fullness: 35, desc: 'Saucy, spicy, legendary.' },
  smokie: { id: 'smokie', name: 'Smokie pasua', price: 40, kind: 'snack', fullness: 10, desc: 'Split smokie with kachumbari.' },
  mutura: { id: 'mutura', name: 'Mutura', price: 50, kind: 'snack', fullness: 12, desc: 'Grilled on the jiko.' },
  // butchery
  nyama: { id: 'nyama', name: 'Nyama choma (1/4 kg)', price: 350, kind: 'food', fullness: 50, desc: 'Roasted goat with kachumbari.' },
  // Utafraaaia boutique: the Mkurugenzi range (mkurugenzi.ke, Oct 2026)
  cap: { id: 'cap', name: 'Aero Cap (brown & beige)', price: 1500, kind: 'merch', fullness: 0, desc: 'Signature script, EST. 2020.' },
  tee: { id: 'tee', name: 'Botanical T-shirt', price: 1800, kind: 'merch', fullness: 0, desc: 'White botanical print, MK chest logo.' },
  tee_plain: { id: 'tee_plain', name: 'Burgundy Bliss T-shirt', price: 1500, kind: 'merch', fullness: 0, desc: 'Burgundy tee, MK logo.' },
  hoodie: { id: 'hoodie', name: 'Black Excellence hoodie', price: 3000, kind: 'merch', fullness: 0, desc: 'Black hoodie, MK chest logo.' },
  quarterzip: { id: 'quarterzip', name: 'Quarter Zip (Black Excellence)', price: 2500, kind: 'merch', fullness: 0, desc: 'Black quarter zip.' },
  jacket: { id: 'jacket', name: 'Black Icon jacket', price: 3500, kind: 'merch', fullness: 0, desc: 'Black jacket.' },
  sweatsuit: { id: 'sweatsuit', name: 'Sweatsuit (Coffee Brown)', price: 6500, kind: 'merch', fullness: 0, desc: 'Crewneck and joggers, script logo.' },
  tote: { id: 'tote', name: 'Tote bag (white)', price: 850, kind: 'merch', fullness: 0, desc: 'Canvas tote.' },
  socks: { id: 'socks', name: 'Socks (pack of 3)', price: 1000, kind: 'merch', fullness: 0, desc: 'Three pairs.' },
};

export interface ShopDef {
  id: string;
  title: string;
  greeting: string;
  items: string[];
}

export const SHOPS: Record<string, ShopDef> = {
  market: { id: 'market', title: 'Mama Mboga stall', greeting: 'Karibu! Tunda ni fresh leo.', items: ['banana', 'mango', 'avocado', 'orange', 'pineapple', 'watermelon', 'sugarcane'] },
  kiosk: { id: 'kiosk', title: 'Mama Wanjiku Kiosk', greeting: 'Soda iko baridi sana!', items: ['soda', 'water', 'juice', 'crisps', 'biscuits', 'bread'] },
  hoteli: { id: 'hoteli', title: 'Chai Moto Hoteli', greeting: 'Kaa chini, chai iko moto.', items: ['chai', 'mandazi', 'chapati', 'beans', 'githeri', 'pilau'] },
  chips: { id: 'chips', title: 'Chipo Express kibanda', greeting: 'Chips moto moto!', items: ['chips', 'chips_masala', 'smokie', 'mutura', 'soda'] },
  butchery: { id: 'butchery', title: 'Nyama Bora Butchery', greeting: 'Nyama choma iko tayari.', items: ['nyama', 'soda'] },
  boutique: { id: 'boutique', title: 'Utafraaaia Boutique', greeting: 'Wakurugenzi! Merch mpya iko.', items: ['cap', 'tee', 'tee_plain', 'hoodie', 'quarterzip', 'jacket', 'sweatsuit', 'tote', 'socks'] },
};

export const FARES = { matatu: 50, nganya: 80, bus: 40 } as const;
