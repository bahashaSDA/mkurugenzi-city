// In-game credits for third-party models (CC BY 4.0 requires attribution and a note of changes).
// Every model was decimated, re-baked into game textures and some were re-painted (original
// liveries replace real brands); see blender/scripts/build_real_kit.py and ASSETS.md.
export interface Credit {
  what: string;
  title: string;
  author: string;
  licence: string;
  url: string;
}

export const MODEL_CREDITS: Credit[] = [
  { what: 'Nganya', title: 'Isuzu NQR Kenyan Nganya', author: 'samydepapelo3', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/isuzu-nqr-kenyan-nganya-30e1fff31e594867a5b4efece8bf55bf' },
  { what: 'Matatu', title: 'Volkswagen Crafter', author: 'geyges', licence: 'Sketchfab Standard', url: 'https://sketchfab.com/3d-models/volkswagen-crafter-647fb3d619c645a4b8e62d80db7cab98' },
  { what: 'Car', title: 'Volkswagen Golf GTI (2025)', author: 'geyges', licence: 'Sketchfab Standard', url: 'https://sketchfab.com/3d-models/volkswagen-golf-gti-2025-84fe6c2b9feb4c8a854d16f3daf33eab' },
  { what: 'Matatu', title: '2005 Toyota Hiace', author: 'DisneyCars', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/2005-toyota-hiace-a066fa74844c43878f7174d3ade85773' },
  { what: 'Nganya', title: 'Tulaga. Ma3. Minibus', author: 'DoggFathera', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/tulaga-ma3-minibus-037a598003964c22b252a9c3a33aa4dd' },
  { what: 'Matatu', title: 'Graffiti Safari (Matatu) Van', author: 'dkomb', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/graffiti-safari-matatuvan-24320939dc8841ab94f6bbe04f47b24c' },
  { what: 'Bus', title: 'Stagecoach Bus Kenya (repainted)', author: 'DoggFathera', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/stagecoach-bus-kenya-01507b499b8b4069840635e2b189b4af' },
  { what: 'Car', title: '2014 Toyota Corolla E180 EU', author: 'Armored Wave', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/2014-toyota-corolla-e180-eu-with-interior-36f95efb0585464cae43a25a3b3392e8' },
  { what: 'Car', title: 'Toyota Land Cruiser', author: 'Game Garage', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/toyota-land-cruiser-cbcbd901e8874205b5be294fa3dd3df2' },
  { what: 'Boda', title: 'Motorcycle Bonda', author: 'TraianDumbrava', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/motorcycle-bonda-290e77e5a7f44a47aa76910e59dfc806' },
  { what: 'Flats', title: 'Low Poly Soviet Apartment Building 8K', author: 'Colin.Greenall', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/low-poly-soviet-apartment-building-8k-05229ac1d1f94e6c8cacaad91110c602' },
  { what: 'Apartments', title: 'Old Residential Building [4k]', author: 'Andrej Grave', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/old-residential-building-4k-dd400ed693cf416e940c5b8e3107205e' },
  { what: 'Shop', title: 'Abandoned Building Shop Old House', author: 'YadroGames', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/abandoned-building-shop-old-house-0ed14367314946b298d9a58db66da040' },
  { what: 'CBD tower', title: 'Coop House 3d Model', author: 'cgkenya', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/coop-house-3d-model-3a29447d1f9d4713ab891c67f2769df9' },
  { what: 'CBD tower', title: 'Atlanta Corporate Office Building', author: '99.Miles', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/free-atlanta-corperate-office-building-d96380fb001345cca9a9be121f3e43d5' },
  { what: 'CBD tower', title: 'Singapore Office Skyscraper', author: '99.Miles', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/singapore-office-skyscraper-free-2305f0fe03ba44229a1f768dcb48bd8f' },
  { what: 'CBD tower', title: 'London Skyscraper', author: '99.Miles', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/free-london-skyscraper-52b73f6ea18a440cb42734840d5edc72' },
  { what: 'Tree', title: 'Acacia tree', author: 'evolveduk', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/acacia-tree-bb14c2bb679b4d0bb1c578a27e2ddabf' },
  { what: 'Tree', title: 'JACARANDA_TREE', author: 'Uncanny Bingchilling', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/jacaranda-tree-380a2c4bfa6d4ac5b73dc6b001651b4c' },
  { what: 'Tree', title: 'Coconut Palm', author: 'evolveduk', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/coconut-palm-26e787f2ff2e4c0fb004c3b0210805a3' },
  { what: 'Tree', title: 'Realistic Palm Tree Free', author: 'Next Spring', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/realistic-palm-tree-free-39052ea764c945858449e699318efa53' },
];

// Sound. The matatu mixes and the ambience beds were extracted from YouTube with the owner's
// permission (the owner states they hold the rights); confirm those rights cover a public release.
// Bird and insect one-shots are from Wikimedia Commons: each file page names its author and licence.
// Voices are generated offline with Piper TTS (tools/gen-voices.py).
export const AUDIO_CREDITS: Credit[] = [
  { what: 'Matatu mix', title: 'Nganya Drive Mix Vol 2', author: 'DJ Mysticc', licence: 'used with permission', url: 'https://youtu.be/irTMtQPJQg0' },
  { what: 'Matatu mix', title: 'Nganya Vibes 01', author: 'DJ Pasamiz', licence: 'used with permission', url: 'https://youtu.be/DR_j_q9OVYA' },
  { what: 'Matatu mix', title: 'Nganya Vibes 02', author: 'DJ Pasamiz', licence: 'used with permission', url: 'https://youtu.be/-jhwGyHPnPY' },
  { what: 'Ambience', title: 'Nairobi street, day', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/MIh3We_xJO8' },
  { what: 'Ambience', title: 'Nairobi night', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/UM9AT5U7WEc' },
  { what: 'Ambience', title: 'Market', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/7EEOCB3urRg' },
  { what: 'Ambience', title: 'Suburban morning', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/qv3_rQ1GEL8' },
  { what: 'Ambience', title: 'Amboseli birds', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/mS11b7dSuxI' },
  { what: 'Ambience', title: 'Laikipia birds', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/Rav4yNVBYmA' },
  { what: 'Ambience', title: 'Wind', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/sFEUL523ERg' },
  { what: 'Ambience', title: 'Tsavo night', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/bsuYcwlzr2w' },
  { what: 'Ambience', title: 'Diani sea', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/HBIS_aHxr60' },
  { what: 'Ambience', title: 'Dusk', author: 'YouTube', licence: 'used with permission', url: 'https://youtu.be/pjsDqXcreDw' },
  { what: 'Hadada ibis', title: 'Bostrychia hagedash (3 recordings)', author: 'Wikimedia Commons', licence: 'see file page', url: 'https://commons.wikimedia.org/wiki/File:Bostrychia_hagedash_call.flac' },
  { what: 'Rooster', title: 'Rooster crowing (3 recordings)', author: 'Wikimedia Commons', licence: 'see file page', url: 'https://commons.wikimedia.org/wiki/File:Rooster_crowing.ogg' },
  { what: 'Songbirds', title: 'Red-vented Bulbul XC129368, African Pied Wagtail XC366687', author: 'Wikimedia Commons / xeno-canto', licence: 'see file page', url: 'https://commons.wikimedia.org/wiki/File:Motacilla_aguimp_-_African_Pied_Wagtail_XC366687.mp3' },
  { what: 'Crickets', title: 'Field cricket; Ringing cricket winding down', author: 'Wikimedia Commons', licence: 'see file page', url: 'https://commons.wikimedia.org/wiki/File:Field_cricket_unedited.ogg' },
  { what: 'Voices', title: 'Piper TTS (sw_CD lanfrica, en_GB alan, en_GB southern/northern English)', author: 'Rhasspy / OpenSLR 83', licence: 'CC BY-SA 4.0 and others', url: 'https://huggingface.co/rhasspy/piper-voices' },
];
