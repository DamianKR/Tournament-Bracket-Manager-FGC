/**
 * Game & character data
 * Add new games here as they become supported.
 */

export interface Character {
  id: string;
  name: string;
}

export interface Game {
  id: string;
  name: string;
  shortName: string;
  characters: Character[];
}

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
  { id: 'mythra',           name: 'Mythra' },
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
  { id: 'pyra',             name: 'Pyra' },
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

// ── Game registry ──────────────────────────────────────────────────────────

export const GAMES: Game[] = [
  {
    id: 'ssbu',
    name: 'Super Smash Bros. Ultimate',
    shortName: 'Smash Ultimate',
    characters: SSBU_CHARACTERS,
  },
  // Future games:
  // { id: 'sf6',  name: 'Street Fighter 6',     shortName: 'SF6',  characters: [] },
  // { id: 'mk1',  name: 'Mortal Kombat 1',       shortName: 'MK1',  characters: [] },
];

export const GAMES_MAP = new Map(GAMES.map((g) => [g.id, g]));

export function getGame(id: string): Game | undefined {
  return GAMES_MAP.get(id);
}

export function getCharacter(gameId: string, characterId: string): Character | undefined {
  return getGame(gameId)?.characters.find((c) => c.id === characterId);
}
