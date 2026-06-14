// Legends Series — profiles mirrored from the ARCHV Instagram Legends Series.
// Illustrated D50 headshots (navy/gold, brand style), one football great per entry.
// Headshots are self-hosted in public/legends/ (run scripts/fetch-legends-headshots.sh once).
// British English, plain, no AI tells. Numbered to match the IG series.
export interface Legend {
  no: string;       // series number, e.g. "No. 02"
  name: string;     // player name
  nation: string;   // country
  years?: string;   // life or playing era, optional
  headshot: string; // illustrated portrait, served from /legends/
  bio: string;      // one or two plain sentences
}

export const legends: Legend[] = [
  {
    no: 'No. 01',
    name: 'Patrice Evra',
    nation: 'France',
    headshot: '/legends/evra.webp',
    bio: 'Monaco-made left-back who became the heartbeat of Manchester United’s defence and captain of France. One of the great modern full-backs.',
  },
  {
    no: 'No. 02',
    name: 'Diogo Jota',
    nation: 'Portugal',
    years: '1996–2025',
    headshot: '/legends/jota.webp',
    bio: 'Liverpool’s sharp, humble finisher and a Nations League winner with Portugal. Remembered as much for the person as the player.',
  },
  {
    no: 'No. 03',
    name: 'Javier "Chicharito" Hernández',
    nation: 'Mexico',
    headshot: '/legends/chicharito.webp',
    bio: 'Mexico’s all-time leading scorer, the poacher who turned up in the box when it mattered, from Chivas to Old Trafford and back.',
  },
  {
    no: 'No. 04',
    name: 'Cobi Jones',
    nation: 'USA',
    headshot: '/legends/cobi-jones.webp',
    bio: 'The most-capped USMNT player and an LA Galaxy one-club man who carried American soccer through the 1990s.',
  },
  {
    no: 'No. 05',
    name: 'Atiba Hutchinson',
    nation: 'Canada',
    headshot: '/legends/atiba-hutchinson.webp',
    bio: 'Canada’s most-capped man and the captain who led the country back to a World Cup after 36 years.',
  },
  {
    no: 'No. 06',
    name: 'Johan Cruyff',
    nation: 'Netherlands',
    years: '1947–2016',
    headshot: '/legends/cruyff.webp',
    bio: 'The mind behind Total Football. Three Ballon d’Ors as a player, then the architect of Barcelona’s modern game.',
  },
  {
    no: 'No. 07',
    name: 'Andrés Iniesta',
    nation: 'Spain',
    headshot: '/legends/iniesta.webp',
    bio: 'Barcelona’s quiet metronome who scored Spain’s World Cup-winning goal in the 116th minute in 2010.',
  },
  {
    no: 'No. 08',
    name: 'Sir Bobby Charlton',
    nation: 'England',
    years: '1937–2023',
    headshot: '/legends/bobby-charlton.webp',
    bio: 'Munich survivor, 1966 World Cup winner and United’s heart. A Ballon d’Or and a lifetime of grace.',
  },
  {
    no: 'No. 09',
    name: 'Ricardo Quaresma',
    nation: 'Portugal',
    headshot: '/legends/quaresma.webp',
    bio: 'The king of the trivela, Portugal’s restless magician and a Euro 2016 champion.',
  },
  {
    no: 'No. 10',
    name: 'Diego Maradona',
    nation: 'Argentina',
    years: '1960–2020',
    headshot: '/legends/maradona.webp',
    bio: 'The golden boy of Argentina. 1986 was his, the Hand of God and the Goal of the Century in a single match.',
  },
  {
    no: 'No. 11',
    name: 'Pelé',
    nation: 'Brazil',
    years: '1940–2022',
    headshot: '/legends/pele.webp',
    bio: 'O Rei. The only man to win three World Cups, and football’s first global icon.',
  },
  {
    no: 'No. 12',
    name: 'Michel Platini',
    nation: 'France',
    headshot: '/legends/platini.webp',
    bio: 'France’s conductor. Three straight Ballon d’Ors and a Euro 1984 he won almost on his own.',
  },
  {
    no: 'No. 13',
    name: 'Jay-Jay Okocha',
    nation: 'Nigeria',
    headshot: '/legends/okocha.webp',
    bio: 'So good they named him twice. Nigeria’s showman and one of football’s great entertainers.',
  },
];
