// Legends Series — profiles mirrored from the ARCHV Instagram Legends Series.
// Illustrated D50 headshots (navy/gold, brand style), one football great per entry.
// British English, plain, no AI tells. Numbered to match the IG series.
export interface Legend {
  no: string;       // series number, e.g. "No. 02"
  name: string;     // player name
  nation: string;   // country
  years?: string;   // life or playing era, optional
  headshot: string; // illustrated portrait URL
  bio: string;      // one or two plain sentences
}

const HS = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EYxWWaCOckmLgYMAE2OyJqeh3I/';

export const legends: Legend[] = [
  {
    no: 'No. 02',
    name: 'Diogo Jota',
    nation: 'Portugal',
    years: '1996–2025',
    headshot: HS + 'hf_20260614_123746_7d91762e-0a64-4b87-8d88-c37a24cb510c_min.webp',
    bio: 'Liverpool’s sharp, humble finisher and a Nations League winner with Portugal. Remembered as much for the person as the player.',
  },
  {
    no: 'No. 03',
    name: 'Javier "Chicharito" Hernández',
    nation: 'Mexico',
    headshot: HS + 'hf_20260614_123748_9d916059-e3be-4e63-bb3d-6f22a44578a7_min.webp',
    bio: 'Mexico’s all-time leading scorer, the poacher who turned up in the box when it mattered, from Chivas to Old Trafford and back.',
  },
  {
    no: 'No. 04',
    name: 'Cobi Jones',
    nation: 'USA',
    headshot: HS + 'hf_20260614_123752_dfb66b6e-3dd5-441e-bd4c-481a8c8d469c_min.webp',
    bio: 'The most-capped USMNT player and an LA Galaxy one-club man who carried American soccer through the 1990s.',
  },
  {
    no: 'No. 05',
    name: 'Atiba Hutchinson',
    nation: 'Canada',
    headshot: HS + 'hf_20260614_123755_0d3df697-7a4d-40ba-b19e-2a45f515752d_min.webp',
    bio: 'Canada’s most-capped man and the captain who led the country back to a World Cup after 36 years.',
  },
  {
    no: 'No. 06',
    name: 'Johan Cruyff',
    nation: 'Netherlands',
    years: '1947–2016',
    headshot: HS + 'hf_20260614_123757_4eb8ea69-7379-430c-b3eb-a24fa4b6b66f_min.webp',
    bio: 'The mind behind Total Football. Three Ballon d’Ors as a player, then the architect of Barcelona’s modern game.',
  },
  {
    no: 'No. 07',
    name: 'Andrés Iniesta',
    nation: 'Spain',
    headshot: HS + 'hf_20260614_123722_4a551900-4bb0-4ee5-afe4-2c0b449df8fd_min.webp',
    bio: 'Barcelona’s quiet metronome who scored Spain’s World Cup-winning goal in the 116th minute in 2010.',
  },
  {
    no: 'No. 08',
    name: 'Sir Bobby Charlton',
    nation: 'England',
    years: '1937–2023',
    headshot: HS + 'hf_20260614_130958_47544de6-c393-4549-9d72-ea59eb94e893_min.webp',
    bio: 'Munich survivor, 1966 World Cup winner and United’s heart. A Ballon d’Or and a lifetime of grace.',
  },
  {
    no: 'No. 09',
    name: 'Ricardo Quaresma',
    nation: 'Portugal',
    headshot: HS + 'hf_20260614_131000_7f188155-b4c1-4412-9546-5db62af7f915_min.webp',
    bio: 'The king of the trivela, Portugal’s restless magician and a Euro 2016 champion.',
  },
  {
    no: 'No. 10',
    name: 'Diego Maradona',
    nation: 'Argentina',
    years: '1960–2020',
    headshot: HS + 'hf_20260614_131003_7d5deffe-bddd-4950-b193-44e2265fe6b2_min.webp',
    bio: 'The golden boy of Argentina. 1986 was his, the Hand of God and the Goal of the Century in a single match.',
  },
  {
    no: 'No. 11',
    name: 'Pelé',
    nation: 'Brazil',
    years: '1940–2022',
    headshot: HS + 'hf_20260614_131006_c99294f6-158a-46c2-ab45-cc2c0db7367c_min.webp',
    bio: 'O Rei. The only man to win three World Cups, and football’s first global icon.',
  },
  {
    no: 'No. 12',
    name: 'Michel Platini',
    nation: 'France',
    headshot: HS + 'hf_20260614_131008_77fdd41b-a811-4e75-9831-692161d6f155_min.webp',
    bio: 'France’s conductor. Three straight Ballon d’Ors and a Euro 1984 he won almost on his own.',
  },
  {
    no: 'No. 13',
    name: 'Jay-Jay Okocha',
    nation: 'Nigeria',
    headshot: HS + 'hf_20260614_131010_7de4e475-f592-4aa6-a7d2-218a161ad52c_min.webp',
    bio: 'So good they named him twice. Nigeria’s showman and one of football’s great entertainers.',
  },
];
