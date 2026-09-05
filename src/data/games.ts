/**
 * Game & character data
 * Add new games here as they become supported.
 */

export interface Character {
  id: string;
  name: string;
  /** Large render (profile). External CDN. */
  imageUrl?: string;
  /** Small icon (podium/thumbnails). External CDN. */
  imageIconUrl?: string;
  /** Filename inside public/images/characters/{gameId}/. */
  imageFile?: string;
}

export interface Game {
  id: string;
  name: string;
  shortName: string;
  characters: Character[];
}

const ASSET_BASE = 'https://raw.githubusercontent.com/joaorb64/StreamHelperAssets/main/games';

// ── Super Smash Bros. Ultimate ─────────────────────────────────────────────
// Full roster as of Version 13.0.1 (all DLC included)

const SSBU_CHARACTERS: Character[] = [
  { id: 'bayonetta',        name: 'Bayonetta' },
  { id: 'bowser',           name: 'Bowser' },
  { id: 'bowser_jr',        name: 'Bowser Jr.' },
  { id: 'byleth',           name: 'Byleth' },
  { id: 'captain_falcon',   name: 'Captain Falcon' },
  { id: 'chrom',            name: 'Chrom' },
  { id: 'cloud',            name: 'Cloud' },
  { id: 'corrin',           name: 'Corrin' },
  { id: 'daisy',            name: 'Daisy' },
  { id: 'dark_pit',         name: 'Dark Pit' },
  { id: 'dark_samus',       name: 'Dark Samus' },
  { id: 'diddy_kong',       name: 'Diddy Kong' },
  { id: 'donkey_kong',      name: 'Donkey Kong' },
  { id: 'dr_mario',         name: 'Dr. Mario' },
  { id: 'duck_hunt',        name: 'Duck Hunt' },
  { id: 'falco',            name: 'Falco' },
  { id: 'fox',              name: 'Fox' },
  { id: 'ganondorf',        name: 'Ganondorf' },
  { id: 'greninja',         name: 'Greninja' },
  { id: 'hero',             name: 'Hero' },
  { id: 'ice_climbers',     name: 'Ice Climbers' },
  { id: 'ike',              name: 'Ike' },
  { id: 'incineroar',       name: 'Incineroar' },
  { id: 'inkling',          name: 'Inkling' },
  { id: 'isabelle',         name: 'Isabelle' },
  { id: 'jigglypuff',       name: 'Jigglypuff' },
  { id: 'joker',            name: 'Joker' },
  { id: 'kazuya',           name: 'Kazuya' },
  { id: 'ken',              name: 'Ken' },
  { id: 'king_dedede',      name: 'King Dedede' },
  { id: 'king_k_rool',      name: 'King K. Rool' },
  { id: 'kirby',            name: 'Kirby' },
  { id: 'link',             name: 'Link' },
  { id: 'little_mac',       name: 'Little Mac' },
  { id: 'lucario',          name: 'Lucario' },
  { id: 'lucas',            name: 'Lucas' },
  { id: 'lucina',           name: 'Lucina' },
  { id: 'luigi',            name: 'Luigi' },
  { id: 'mario',            name: 'Mario' },
  { id: 'marth',            name: 'Marth' },
  { id: 'mega_man',         name: 'Mega Man' },
  { id: 'meta_knight',      name: 'Meta Knight' },
  { id: 'mewtwo',           name: 'Mewtwo' },
  { id: 'mii_brawler',      name: 'Mii Brawler' },
  { id: 'mii_gunner',       name: 'Mii Gunner' },
  { id: 'mii_swordfighter', name: 'Mii Swordfighter' },
  { id: 'min_min',          name: 'Min Min' },
  { id: 'mr_game_and_watch',name: 'Mr. Game & Watch' },
  { id: 'ness',             name: 'Ness' },
  { id: 'olimar',           name: 'Olimar' },
  { id: 'pac_man',          name: 'Pac-Man' },
  { id: 'palutena',         name: 'Palutena' },
  { id: 'peach',            name: 'Peach' },
  { id: 'pichu',            name: 'Pichu' },
  { id: 'pikachu',          name: 'Pikachu' },
  { id: 'piranha_plant',    name: 'Piranha Plant' },
  { id: 'pit',              name: 'Pit' },
  { id: 'pokemon_trainer',  name: 'Pokémon Trainer' },
  { id: 'pyra_mythra',      name: 'Pyra / Mythra' },
  { id: 'richter',          name: 'Richter' },
  { id: 'ridley',           name: 'Ridley' },
  { id: 'rob',              name: 'R.O.B.' },
  { id: 'robin',            name: 'Robin' },
  { id: 'rosalina',         name: 'Rosalina & Luma' },
  { id: 'roy',              name: 'Roy' },
  { id: 'ryu',              name: 'Ryu' },
  { id: 'samus',            name: 'Samus' },
  { id: 'sephiroth',        name: 'Sephiroth' },
  { id: 'sheik',            name: 'Sheik' },
  { id: 'shulk',            name: 'Shulk' },
  { id: 'simon',            name: 'Simon' },
  { id: 'snake',            name: 'Snake' },
  { id: 'sonic',            name: 'Sonic' },
  { id: 'sora',             name: 'Sora' },
  { id: 'steve',            name: 'Steve' },
  { id: 'terry',            name: 'Terry' },
  { id: 'toon_link',        name: 'Toon Link' },
  { id: 'villager',         name: 'Villager' },
  { id: 'wario',            name: 'Wario' },
  { id: 'wii_fit_trainer',  name: 'Wii Fit Trainer' },
  { id: 'wolf',             name: 'Wolf' },
  { id: 'yoshi',            name: 'Yoshi' },
  { id: 'young_link',       name: 'Young Link' },
  { id: 'zelda',            name: 'Zelda' },
  { id: 'zero_suit_samus',  name: 'Zero Suit Samus' },
].sort((a, b) => a.name.localeCompare(b.name));

// ── Street Fighter 6 ────────────────────────────────────────────────────────
// Base roster (18) + Year 1, 2 & 3 DLC (12) = 30 fighters as of 2026
// Images: StreamHelperAssets (GitHub raw)

const sf6Char = (id: string, name: string, codename: string): Character => ({
  id,
  name,
  imageUrl: `${ASSET_BASE}/sf6/full/file_${codename}_0.png`,
  imageIconUrl: `${ASSET_BASE}/sf6/base_files/icon/${codename}_0.png`,
});

const SF6_CHARACTERS: Character[] = [
  sf6Char('ryu',      'Ryu',       'Ryu'),
  sf6Char('luke',     'Luke',      'Luke'),
  sf6Char('jamie',    'Jamie',     'Jamie'),
  sf6Char('chunli',   'Chun-Li',   'ChunLi'),
  sf6Char('guile',    'Guile',     'Guile'),
  sf6Char('kimberly', 'Kimberly',  'Kimberly'),
  sf6Char('juri',     'Juri',      'Juri'),
  sf6Char('ken',      'Ken',       'Ken'),
  sf6Char('blanka',   'Blanka',    'Blanka'),
  sf6Char('dhalsim',  'Dhalsim',   'Dhalsim'),
  sf6Char('ehonda',   'E. Honda',  'Honda'),
  sf6Char('deejay',   'Dee Jay',   'DeeJay'),
  sf6Char('manon',    'Manon',     'Manon'),
  sf6Char('marisa',   'Marisa',    'Marisa'),
  sf6Char('jp',       'JP',        'JP'),
  sf6Char('zangief',  'Zangief',   'Zangief'),
  sf6Char('lily',     'Lily',      'Lily'),
  sf6Char('cammy',    'Cammy',     'Cammy'),
  sf6Char('rashid',   'Rashid',    'Rashid'),
  sf6Char('aki',      'A.K.I.',    'AKI'),
  sf6Char('ed',       'Ed',        'Ed'),
  sf6Char('akuma',    'Akuma',     'Akuma'),
  sf6Char('mbison',   'M. Bison',  'Bison'),
  sf6Char('terry',    'Terry',     'Terry'),
  sf6Char('mai',      'Mai',       'Mai'),
  sf6Char('elena',    'Elena',     'Elena'),
  sf6Char('sagat',    'Sagat',     'Sagat'),
  sf6Char('cviper',   'C. Viper',  'Viper'),
  sf6Char('alex',     'Alex',      'Alex'),
  sf6Char('ingrid',   'Ingrid',    'Ingrid'),
].sort((a, b) => a.name.localeCompare(b.name));

// ── Guilty Gear -STRIVE- ────────────────────────────────────────────────────

const ggstChar = (id: string, name: string, codename: string): Character => ({
  id,
  name,
  imageUrl: `${ASSET_BASE}/ggst/full/full_${codename}_0.png`,
  imageIconUrl: `${ASSET_BASE}/ggst/base_files/icon/icon_${codename}_0.png`,
});

const GGST_CHARACTERS: Character[] = [
  ggstChar('anji',       'Anji Mito',               'Anji'),
  ggstChar('axl',        'Axl Low',                 'Axl'),
  ggstChar('chipp',      'Chipp Zanuff',            'Chipp'),
  ggstChar('faust',      'Faust',                   'Faust'),
  ggstChar('giovanna',   'Giovanna',                'Giovanna'),
  ggstChar('i_no',       'I-No',                    'I-No'),
  ggstChar('ky',         'Ky Kiske',                'Ky'),
  ggstChar('leo',        'Leo Whitefang',           'Leo'),
  ggstChar('may',        'May',                     'May'),
  ggstChar('millia',     'Millia Rage',             'Millia'),
  ggstChar('nagoriyuki', 'Nagoriyuki',              'Nagoriyuki'),
  ggstChar('potemkin',   'Potemkin',                'Potemkin'),
  ggstChar('ramlethal',  'Ramlethal Valentine',     'Ramlethal'),
  ggstChar('sol',        'Sol Badguy',              'Sol'),
  ggstChar('zato',       'Zato=1',                  'Zato'),
  ggstChar('goldlewis',  'Goldlewis Dickinson',     'Goldlewis'),
  ggstChar('jack_o',     'Jack-O\'',                'Jack-O'),
  ggstChar('happy_chaos','Happy Chaos',             'HappyChaos'),
  ggstChar('baiken',     'Baiken',                  'Baiken'),
  ggstChar('testament',  'Testament',               'Testament'),
  ggstChar('bridget',    'Bridget',                 'Bridget'),
  ggstChar('sin',        'Sin Kiske',               'Sin'),
  ggstChar('bed',        'Bedman?',                 'Bed'),
  ggstChar('asuka',      'Asuka R#',                'Asuka'),
  ggstChar('johnny',     'Johnny',                  'Johnny'),
  ggstChar('elphelt',    'Elphelt Valentine',       'Elphelt'),
  ggstChar('aba',        'A.B.A',                   'ABA'),
  ggstChar('slayer',     'Slayer',                  'Slayer'),
  ggstChar('dizzy',      'Queen Dizzy',             'Dizzy'),
  ggstChar('venom',      'Venom',                   'Venom'),
  ggstChar('unika',      'Unika',                   'Unika'),
  ggstChar('lucy',       'Lucyna "Lucy" Kushinada', 'Lucy'),
  ggstChar('jam',        'Jam Kuradoberi',          'Jam'),
  ggstChar('robo',       'Robo-Ky',                 'Robo'),
].sort((a, b) => a.name.localeCompare(b.name));

// ── Mortal Kombat 11 ─────────────────────────────────────────────────────────

const mk11Icon = (codename: string) =>
  `${ASSET_BASE}/mk11/base_files/icon/175816_${codename}_0.png`;

const mk11Char = (
  id: string,
  name: string,
  codename: string,
): Character => ({
  id,
  name,
  imageFile: `${id}.webp`,
  imageIconUrl: mk11Icon(codename),
});

const MK11_CHARACTERS: Character[] = [
  mk11Char('baraka',       'Baraka',          '15'),
  mk11Char('cassie_cage',  'Cassie Cage',     '10'),
  mk11Char('cetrion',      'Cetrion',         '38'),
  mk11Char('dvorah',       'D\'Vorah',        '28'),
  mk11Char('erron_black',  'Erron Black',     '27'),
  mk11Char('frost',        'Frost',           '04'),
  mk11Char('fujin',        'Fujin',           '39'),
  mk11Char('geras',        'Geras',           '33'),
  mk11Char('jacqui_briggs','Jacqui Briggs',   '17'),
  mk11Char('jade',         'Jade',            '24'),
  mk11Char('jax',          'Jax Briggs',      '11'),
  mk11Char('rambo',        'John Rambo',      '31'),
  mk11Char('johnny_cage',  'Johnny Cage',     '08'),
  mk11Char('kabal',        'Kabal',           '20'),
  mk11Char('kano',         'Kano',            '19'),
  mk11Char('kitana',       'Kitana',          '22'),
  mk11Char('kollector',    'Kollector',       '34'),
  mk11Char('kotal_kahn',   'Kotal Kahn',      '29'),
  mk11Char('kung_lao',     'Kung Lao',        '23'),
  mk11Char('liu_kang',     'Liu Kang',        '21'),
  mk11Char('mileena',      'Mileena',         '36'),
  mk11Char('nightwolf',    'Nightwolf',       '05'),
  mk11Char('noob_saibot',  'Noob Saibot',     '14'),
  mk11Char('raiden',       'Raiden',          '16'),
  mk11Char('rain',         'Rain',            '40'),
  mk11Char('robocop',      'RoboCop',         '25'),
  mk11Char('scorpion',     'Scorpion',        '13'),
  mk11Char('shang_tsung',  'Shang Tsung',     '02'),
  mk11Char('shao_kahn',    'Shao Kahn',       '03'),
  mk11Char('sheeva',       'Sheeva',          '30'),
  mk11Char('sindel',       'Sindel',          '35'),
  mk11Char('skarlet',      'Skarlet',         '26'),
  mk11Char('sonya_blade',  'Sonya Blade',     '09'),
  mk11Char('spawn',        'Spawn',           '12'),
  mk11Char('sub_zero',     'Sub-Zero',        '18'),
  mk11Char('joker',        'The Joker',       '07'),
  mk11Char('terminator',   'The Terminator',  '32'),
  mk11Char('kronika',      'Kronika',         '41'),
].sort((a, b) => a.name.localeCompare(b.name));

// ── Tekken 8 ─────────────────────────────────────────────────────────────────

const t8Char = (id: string, name: string, codename: string): Character => ({
  id,
  name,
  imageUrl: `${ASSET_BASE}/tekken8/vs_renders/${codename}_0.png`,
  imageIconUrl: `${ASSET_BASE}/tekken8/base_files/icon/T_UI_STIW_HUD_Character_MessageWin_${codename}_0.png`,
});

const T8_CHARACTERS: Character[] = [
  t8Char('asuka',       'Asuka Kazama',                 'asu'),
  t8Char('azucena',     'Azucena',                      'azu'),
  t8Char('bryan',       'Bryan Fury',                   'bry'),
  t8Char('claudio',     'Claudio Serafino',             'cla'),
  t8Char('lili',        'Emilie "Lili" de Rochefort',   'lil'),
  t8Char('feng',        'Feng Wei',                     'fen'),
  t8Char('hwoarang',    'Hwoarang',                     'hwo'),
  t8Char('jack_8',      'Jack-8',                       'jac'),
  t8Char('jin',         'Jin Kazama',                   'jin'),
  t8Char('jun',         'Jun Kazama',                   'jun'),
  t8Char('kazuya',      'Kazuya Mishima',               'kaz'),
  t8Char('king',        'King II',                      'kin'),
  t8Char('kuma',        'Kuma',                         'kum'),
  t8Char('lars',        'Lars Alexandersson',           'lar'),
  t8Char('leo',         'Leo Kliesen',                  'leo'),
  t8Char('leroy',       'Leroy Smith',                  'ler'),
  t8Char('xiaoyu',      'Ling Xiaoyu',                  'xia'),
  t8Char('law',         'Marshall Law',                 'law'),
  t8Char('nina',        'Nina Williams',                'nin'),
  t8Char('panda',       'Panda',                        'pan'),
  t8Char('paul',        'Paul Phoenix',                 'pau'),
  t8Char('raven',       'Raven',                        'rav'),
  t8Char('dragunov',    'Sergei Dragunov',              'dra'),
  t8Char('shaheen',     'Shaheen',                      'sha'),
  t8Char('steve',       'Steve Fox',                    'ste'),
  t8Char('yoshimitsu',  'Yoshimitsu',                   'yos'),
  t8Char('zafina',      'Zafina',                       'zaf'),
  t8Char('lee',         'Lee Chaolan',                  'lee'),
  t8Char('alisa',       'Alisa Bosconovitch',           'ali'),
  t8Char('devil_jin',   'Devil Jin',                    'dvj'),
  t8Char('victor',      'Victor Chevalier',             'vic'),
  t8Char('reina',       'Reina',                        'rei'),
  t8Char('eddy',        'Eddy Gordo',                   'edd'),
  t8Char('lidia',       'Lidia Sobieska',               'nsd'),
  t8Char('heihachi',    'Heihachi Mishima',             'hei'),
  t8Char('clive',       'Clive Rosfield',               'cli'),
  t8Char('anna',        'Anna Williams',                'ann'),
  t8Char('fahkumram',   'Fahkumram',                    'fak'),
  t8Char('armor_king',  'Armor King',                   'arm'),
  t8Char('miary_zo',    'Miary Zo',                     'mia'),
  t8Char('kunimitsu',   'Kunimitsu II',                 'kun'),
  t8Char('bob',         'Robert "Bob" Richards',        'bob'),
  t8Char('roger_jr',    'Roger Jr.',                    'rog'),
  t8Char('yujiro',      'Yujiro Hanma',                 'yuj'),
].sort((a, b) => a.name.localeCompare(b.name));

// ── SoulCalibur VI ──────────────────────────────────────────────────────────

const sc6Char = (id: string, name: string, codename: string): Character => ({
  id,
  name,
  imageUrl: `${ASSET_BASE}/sc6/full/museum_portrait_chara_${codename}_0.png`,
  imageIconUrl: `${ASSET_BASE}/sc6/base_files/icon/UI_Chara_2D_${codename}_0.png`,
});

const SC6_CHARACTERS: Character[] = [
  sc6Char('2b',          '2B',                          '2B'),
  sc6Char('amy',         'Amy Sorel',                   'Amy'),
  sc6Char('astaroth',    'Astaroth',                    'Astaroth'),
  sc6Char('azwel',       'Azwel',                       'Azwel'),
  sc6Char('cassandra',   'Cassandra Alexandra',         'Cassandra'),
  sc6Char('cervantes',   'Cervantes de Leon',           'Cervantes'),
  sc6Char('xianghua',    'Chai Xianghua',               'Xianghua'),
  sc6Char('geralt',      'Geralt of Rivia',             'Geralt'),
  sc6Char('groh',        'Grøh',                        'Groh'),
  sc6Char('haohmaru',    'Haohmaru',                    'Haohmaru'),
  sc6Char('mitsurugi',   'Heishiro Mitsurugi',          'Mitsurugi'),
  sc6Char('hilde',       'Hildegard von Krone',         'Hilde'),
  sc6Char('hwang',       'Hwang Seong-gyeong',          'Hwang'),
  sc6Char('inferno',     'Inferno',                     'Inferno'),
  sc6Char('ivy',         'Ivy Valentine',               'Ivy'),
  sc6Char('kilik',       'Kilik',                       'Kilik'),
  sc6Char('maxi',        'Maxi',                        'Maxi'),
  sc6Char('nightmare',   'Nightmare',                   'Nightmare'),
  sc6Char('raphael',     'Raphael Sorel',               'Raphael'),
  sc6Char('seong_mina',  'Seong Mi-na',                 'SeongMina'),
  sc6Char('setsuka',     'Setsuka',                     'Setsuka'),
  sc6Char('siegfried',   'Siegfried Schtauffen',        'Siegfried'),
  sc6Char('sophitia',    'Sophitia Alexandra',          'Sophitia'),
  sc6Char('taki',        'Taki',                        'Taki'),
  sc6Char('talim',       'Talim',                       'Talim'),
  sc6Char('tira',        'Tira',                        'Tira'),
  sc6Char('voldo',       'Voldo',                       'Voldo'),
  sc6Char('yoshimitsu',  'Yoshimitsu',                  'Yoshimitsu'),
  sc6Char('zasalamel',   'Zasalamel',                   'Zasalamel'),
].sort((a, b) => a.name.localeCompare(b.name));

// ── Game registry ──────────────────────────────────────────────────────────

export const GAMES: Game[] = [
  {
    id: 'ssbu',
    name: 'Super Smash Bros. Ultimate',
    shortName: 'Smash Ultimate',
    characters: SSBU_CHARACTERS,
  },
  {
    id: 'sf6',
    name: 'Street Fighter 6',
    shortName: 'SF6',
    characters: SF6_CHARACTERS,
  },
  {
    id: 'ggst',
    name: 'Guilty Gear -STRIVE-',
    shortName: 'GGST',
    characters: GGST_CHARACTERS,
  },
  {
    id: 'mk11',
    name: 'Mortal Kombat 11',
    shortName: 'MK11',
    characters: MK11_CHARACTERS,
  },
  {
    id: 'tekken8',
    name: 'Tekken 8',
    shortName: 'T8',
    characters: T8_CHARACTERS,
  },
  {
    id: 'sc6',
    name: 'SoulCalibur VI',
    shortName: 'SC6',
    characters: SC6_CHARACTERS,
  },
];

export const GAMES_MAP = new Map(GAMES.map((g) => [g.id, g]));

export function getGame(id: string): Game | undefined {
  return GAMES_MAP.get(id);
}

export function getCharacter(gameId: string, characterId: string): Character | undefined {
  return getGame(gameId)?.characters.find((c) => c.id === characterId);
}
