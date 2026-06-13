// "The Giant-Killers" — ten nights the bracket broke.
// Brand voice: British English, period-terminated, no em-dashes. Scorelines use en-dash.
// Facts checked against the editor gate; the 2002 USA result is the accurate 3-2.
export interface Upset {
  n: string;
  match: string;
  meta: string;
  body: string;
}

export const giantKillersIntro =
  'Every tournament sells you the favourites. This is the other history. The nights the bracket broke, the holders went home, and a country nobody fancied walked off the pitch immortal.';

export const giantKillersOutro =
  'The favourites are never as safe as the bracket says. That is the whole reason we watch.';

export const upsets: Upset[] = [
  {
    n: '01', match: 'USA 1–0 England', meta: '1950 · Belo Horizonte',
    body: 'England arrived as the inventors of the game and one of the favourites to win it. A part-time American side, a dishwasher and a teacher and a hearse driver among them, was not supposed to lay a glove on them. Then Joe Gaetjens threw himself at a header just before half-time. The English press reportedly thought the scoreline was a typo. It was not.',
  },
  {
    n: '02', match: 'North Korea 1–0 Italy', meta: '1966 · Middlesbrough',
    body: 'Two-time world champions against a side almost no one in England had seen play. Pak Doo-ik struck just before half-time, the defence held, and Italy were out. Middlesbrough adopted the underdogs on the spot. It remains one of the most improbable results the tournament has ever produced.',
  },
  {
    n: '03', match: 'Algeria 2–1 West Germany', meta: '1982 · Gijón',
    body: 'The reigning European champions, humbled by a nation playing in its first ever tournament. Rabah Madjer and Lakhdar Belloumi tore the favourites apart. What happened next, a mutually convenient result between two European sides, is the reason every final group game now kicks off at the same time. The upset literally changed the rules.',
  },
  {
    n: '04', match: 'Cameroon 1–0 Argentina', meta: '1990 · Milan, opening night',
    body: 'Defending champions. Diego Maradona. The opening match of the whole tournament. Cameroon finished it with nine men after two red cards, and still won, a header somehow squirming under the keeper. The Indomitable Lions reached the quarter-finals and changed how the world saw African football forever.',
  },
  {
    n: '05', match: 'Senegal 1–0 France', meta: '2002 · opening match',
    body: 'The holders. The world champions. Beaten in the very first game by a Senegal side making its tournament debut, several of whom had grown up in the French league system. Papa Bouba Diop scored, danced by the corner flag, and gave the tournament its defining image inside ninety minutes.',
  },
  {
    n: '06', match: 'USA 3–2 Portugal', meta: '2002 · Suwon',
    body: 'A Portugal golden generation of Figo and Rui Costa, stunned by a USA team no one rated. The Americans raced into a three-goal lead before Portugal pulled two back in a frantic finish. It announced the USA as a side that could hurt anybody on the day, and it still defines a generation of American fans.',
  },
  {
    n: '07', match: 'South Korea 2–0 Germany', meta: '2018 · Kazan',
    body: 'The defending champions needed a win to survive. Instead, two stoppage-time goals sent Germany crashing out in the group stage for the first time in eighty years. The picture of the goalkeeper caught upfield as Korea rolled into an empty net became the holders-curse photograph of the decade.',
  },
  {
    n: '08', match: 'Saudi Arabia 2–1 Argentina', meta: '2022 · opening group game',
    body: 'Lionel Messi scored early. Then the fifty-first ranked team in the world scored twice in five second-half minutes and defended like their lives depended on it, ending a thirty-six match unbeaten run. Argentina went on to win the whole thing. They lost only once all tournament. Here.',
  },
  {
    n: '09', match: 'Japan 2–1 Germany & 2–1 Spain', meta: '2022 · group stage',
    body: 'Not one shock but two. Japan came from behind to beat Germany, then did the exact same thing to Spain, identical comebacks, to win the so-called group of death ahead of both European giants. Germany were eliminated in the group stage for the second tournament running.',
  },
  {
    n: '10', match: 'Morocco, the run', meta: '2022 · the history-makers',
    body: 'Top of a group containing Croatia and Belgium. Spain beaten on penalties. Portugal beaten one nil. The Atlas Lions became the first African nation ever to reach a World Cup semi-final, carried by a wall of a defence, a goalkeeper in the form of his life, and the loudest travelling support in Qatar.',
  },
];
