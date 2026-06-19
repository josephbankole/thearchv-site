// World Cup — daily wrap-up. Each entry is a sub-1-minute read for one match day.
// status 'verified' = filed and fact-checked against two sources. 'pending' = the live
// tracker is ready but the day is not yet written. The daily engine prepends new days.
export interface DayEntry {
  date: string;       // ISO
  day: string;        // short label, e.g. "Day 2"
  headline: string;   // period-terminated
  dek: string;        // one-line standfirst
  body: string;       // 70-130 words, brand voice
  status: 'verified' | 'pending';
  image?: string;     // OPTIONAL brand-illustrated headshot only (navy/gold, no crest, not a photo)
  imageAlt?: string;  // editorial alt text
}

export const worldCupDays: DayEntry[] = [
  {
    date: "2026-06-18",
    day: "Day 8",
    headline: "Canada make history. Mexico go through.",
    dek: "A six-goal rout, and the hosts qualify first.",
    body: "Day eight closed the first full round of group games, and the co-hosts owned it. Canada thrashed Qatar six nil in Vancouver, Jonathan David helping himself to a hat-trick on a night that set a new mark for the country. Mexico were tighter but no less effective, Luis Romo's second-half goal beating South Korea one nil and making them the first team into the knockout rounds. Switzerland eased past Bosnia and Herzegovina four one. Czechia and South Africa could not be separated in a one all draw. The hosts are flying, and the new 48-team bracket is taking shape.",
    status: "verified",
  },
  {
    date: "2026-06-17",
    day: "Day 7",
    headline: "England open up. Kane closes on a record.",
    dek: "Four past Croatia, and the captain ties Lineker.",
    body: "England started their World Cup the hard way and still won it well, four two over Croatia in Group L. Harry Kane scored twice, the first from the spot, and his header drew him level with Gary Lineker on ten World Cup goals for England. Croatia twice hit back, through Martin Baturina and Petar Musa, but Jude Bellingham restored the lead straight after the break and Marcus Rashford came off the bench to finish it late. Colombia beat Uzbekistan three one, Ghana edged Panama one nil, and Portugal were held by DR Congo. The seventh day had its share of jeopardy.",
    status: "verified",
  },
  {
    date: "2026-06-16",
    day: "Day 6",
    headline: "Messi answers with a hat-trick.",
    dek: "The holders open with a statement; France and Norway roll.",
    body: "The holders waited until day six to start, and Lionel Messi made it worth the wait. A hat-trick against Algeria, three goals in a three nil win, on his record sixth World Cup and his two hundredth cap for Argentina. The goals took him level with Miroslav Klose on sixteen, the most anyone has scored at World Cups. He was not the only one busy. France beat Senegal three one; Kylian Mbappé's two goals made him France's all time leading scorer. Erling Haaland struck twice in Norway's four one win over Iraq. Austria saw off Jordan three one. The big names arrived together.",
    status: "verified",
  },
  {
    date: "2026-06-15",
    day: "Day 5",
    headline: "A day of four draws. Cape Verde hold Spain.",
    dek: "A forty year old goalkeeper denies the European champions.",
    body: "Day five refused to pick a winner. All four matches finished level, and the one they will retell came in Atlanta. Cape Verde, on their World Cup debut, held European champions Spain to a goalless draw. Spain had twenty seven shots and could not beat Vozinha, the forty year old goalkeeper who turned aside Oyarzabal, Laporte and everything else thrown at him. For one of the smallest nations ever to qualify, a point off the favourites is a night they keep for good. The rest matched the mood. Iran and New Zealand traded blows in Los Angeles for a two all, Elijah Just scoring twice before Ramin Rezaeian and Mohammed Mohebbi hauled Iran level. Belgium drew with Egypt, Saudi Arabia with Uruguay.",
    status: "verified",
  },
  {
    date: "2026-06-14",
    day: "Day 4",
    headline: "Amad's late strike stuns Ecuador. The big guns roar.",
    dek: "Ivory Coast nick it in the ninetieth as Germany and Sweden run riot.",
    body: "Day four had a ninetieth-minute twist. Amad Diallo came off the bench, met Wilfried Singo's cutback and steered it past the keeper. Ivory Coast won one nil, ended Ecuador's nineteen-match unbeaten run and took their first World Cup win since 2014. The favourites were blunter about it. Germany battered Curacao seven one for the biggest scoreline of the tournament so far, Kai Havertz scoring twice. Sweden kept pace, seeing off Tunisia five one on a Yasin Ayari brace, with Alexander Isak and Viktor Gyokeres also on the mark. The best of the football came in a draw. Japan twice pegged the Netherlands back to finish two all, Daichi Kamada level at eighty eight minutes.",
    status: "verified",
  },
  {
    date: "2026-06-13",
    day: "Day 3",
    headline: "Scotland end a 36-year wait. The favourites stumble.",
    dek: "McGinn settles it as Brazil and Switzerland drop points.",
    body: "Day three belonged to the underdogs. Scotland beat Haiti one nil in Group C, John McGinn turning in a rebound on twenty eight minutes for the Tartan Army's first World Cup win since 1990, enough to sit top of the group on the night. Above them the favourites wobbled. Brazil were held to a one all draw by Morocco, and Switzerland, dominant for long spells, conceded a late Boualem Khoukhi equaliser to draw one all with Qatar after Breel Embolo's early penalty. Australia delivered the upset of the day, beating Turkiye two nil in Vancouver through Nestory Irankunda and Connor Metcalfe. The big names have been warned.",
    status: "verified",
  },
  {
    date: '2026-06-12', day: 'Day 2',
    headline: 'The hosts arrive. The USA make a statement.',
    dek: "Balogun's brace, Canada rescued late.",
    body: 'Day two belonged to the co-hosts. The United States opened with a four one win over Paraguay, Folarin Balogun scoring twice inside the first half before an own goal and a late Gio Reyna strike finished the job. It was the dominant start the tournament wanted from its biggest host. Canada had to settle for less. Bosnia and Herzegovina led in Toronto, and the home side needed Cyle Larin, set up by Jonathan David, to level it one all deep in the game. One host roared. One host survived. The group stage was up and running.',
    status: 'verified',
    image: '/heads/balogun.webp',
    imageAlt: 'Folarin Balogun, illustrated by The ARCHV.',
  },
  {
    date: '2026-06-11', day: 'Day 1',
    headline: 'It begins at the Azteca. And it bites.',
    dek: 'Mexico win the opener amid three red cards.',
    body: 'The tournament kicked off where two of its greatest editions were staged. Mexico beat South Africa two nil at the Estadio Azteca, Julián Quiñones striking inside nine minutes and Raúl Jiménez adding the second, on a feisty night that produced three red cards. The Azteca became the first ground to host matches at three different mens World Cups, after 1970 and 1986. Later, in Guadalajara, South Korea came from behind to beat Czechia two one. Ladislav Krejci put the Czechs ahead, then In-Beom Hwang and Hyeon-Gyu Oh turned it around. A comeback to close the opening day. The tournament had found its jeopardy early.',
    status: 'verified',
    image: '/heads/jimenez.webp',
    imageAlt: 'Raúl Jiménez, illustrated by The ARCHV.',
  },
];
