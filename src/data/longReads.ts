// Long Reads — The ARCHV essays. Football, read like a business.
// Expanded, humanised long-form. Full text in the DOM for SEO (crawlable).
// British English, no em-dash spam, no AI tells. The daily engine prepends new essays
// (newest first) after stripping any dead newsletter CTA. Ten distinct topics, no overlap.
export interface LongRead {
  kicker: string;   // small category label
  title: string;    // period-terminated headline
  meta: string;     // subject · era
  date: string;     // ISO, for ordering
  body: string;     // full essay; paragraphs separated by a blank line
}

export const longReads: LongRead[] = [
  {
    kicker: 'The Playbook',
    title: 'The collapse of the Galácticos.',
    meta: 'Real Madrid · 2000–2003',
    date: '2026-06-12',
    body: `Between 2000 and 2003, Real Madrid signed Figo, Zidane, Ronaldo and Beckham. One global icon every summer. It was the most marketable squad ever assembled, and for three years it won nothing that mattered.

The problem was never the talent. It was the shape around it. Madrid started picking players for shirt sales and reach as much as for what the team needed on the pitch. The marketing plan quietly took over from the football plan, and nobody in the building stopped it.

Then they sold the balance. In 2003 they let Claude Makélélé leave for Chelsea, the unglamorous midfielder who did the dirty work that made the stars look good. Zidane put it best: why add another coat of gold paint to the Bentley when you are taking out the engine?

For a while the accounts looked great while the team got worse. Commercial income kept climbing as results slid. That gap is the whole lesson. When the most visible part of an organisation starts making the calls the operating core should own, spending on the brand cannot paper over a broken structure. Stars sell shirts. Systems win seasons.`,
  },
  {
    kicker: 'Systems',
    title: 'Ajax: the academy as the institution.',
    meta: 'Ajax · the production model',
    date: '2026-06-11',
    body: `Ajax does not really sell players. It sells finished products from a factory it spent fifty years building.

Most clubs treat their academy as a cost. A hopeful pipeline that now and then coughs up a first-teamer. Ajax flipped that. The academy is the institution. The first team is just the showroom.

Three things make it hold. First, a written playing identity. The house style is not stuck in one coach's head. It is documented, taught from the youngest age groups up, and applied the same way at every level. The method is the asset, not any single person. Second, a clear exit. Players are produced to a known standard, then sold at peak value to fund the next group. Selling well is the business model, not an accident of a good season. Third, knowledge that survives turnover. Coaches go. Stars go. Directors go. The method stays, because it was written down instead of improvised.

The lesson travels a long way past football. Organisations built on individuals are fragile. Organisations built on documented systems compound. Your most defensible asset is rarely your best person. It is the knowledge that lets you replace them without missing a beat.`,
  },
  {
    kicker: 'Dynasty',
    title: "The Class of '92.",
    meta: 'Manchester United · 1992–1999',
    date: '2026-06-10',
    body: `In 1992, Manchester United promoted a group of academy kids. By 1999 they had won the treble and become the richest club in the world.

That was not luck. It was a model. Build talent rather than buy it. Let a dressing room enforce its own standards before the manager has to. Turn that identity into commercial pull, and feed the money back into the team.

The uncomfortable question for most clubs is not "can we afford to develop talent?" It is "can we afford the churn of buying it every summer?" Build-over-buy is slower and harder and far more durable.

The clubs and the companies that last are rarely the ones that spent the most. They are the ones that built the machine that made spending optional. United had that machine for a decade, and most of their rivals are still trying to buy one.`,
  },
  {
    kicker: 'Systems',
    title: "Sacchi's 25 metres.",
    meta: 'AC Milan · 1988–1990',
    date: '2026-06-09',
    body: `Between 1988 and 1990, Arrigo Sacchi's AC Milan pressed in a block no deeper than 25 metres from back line to front. It looked like a tactical detail. It was really an operating model.

Sacchi's insight was simple and brutal. A well-designed system could make ordinary positions world-class. His four reference points, the ball, the space, the opponent and the team-mate, were drilled until they were automatic. Individual brilliance was welcome, but the system set the floor. Milan won back-to-back European Cups this way, and three decades of high-pressing football followed.

The boardroom version is uncomfortable. Hire stars into a system nobody designed and you get expensive chaos. Design the system first, and ordinary inputs start producing extraordinary output. Sacchi never had the biggest budget. He had the best design.

Three questions worth stealing from him. What are our four reference points? Which of our processes are written down rather than carried around in someone's head? And if our best people left tomorrow, what would actually remain?`,
  },
  {
    kicker: 'Tactics',
    title: 'The death of the traditional winger.',
    meta: 'Tactical evolution · 2016–2026',
    date: '2026-06-08',
    body: `The classic touchline winger, the one who gets the ball, isolates a full-back and takes him on, is quietly going extinct. The data tells the story before your eyes do.

Across Europe's top five leagues, dribbles in the final third have dropped sharply over the last few seasons. Managers stopped seeing a one-on-one as a thrill and started seeing it as a risk. The reason is the rest-defence. Modern teams build their attack with a fixed shape behind the ball, usually a three-two or two-three. Lose possession out wide and that shape is exposed to a fast counter straight through the middle. One beaten dribble can become one goal against.

So the role changed. Instead of hugging the touchline, the modern wide player drifts into the half-space to make an overload, and the touchline is left to an overlapping or inverted full-back. Width without the gamble. Guardiola, Arteta and Alonso have all codified versions of this. Flair dribblers get benched for players who keep the ball and keep the shape.

Here is the honest tension. It is more efficient, and it is a little less fun. Control wins matches. But nobody ever bought a shirt because of a beautifully safe sideways pass. Whether that trade is worth it is the real argument, and it is not settled.`,
  },
  {
    kicker: 'The Ledger',
    title: 'Multi-club ownership and the invisible loophole.',
    meta: 'Financial engineering · 2026',
    date: '2026-06-07',
    body: `A growing share of Europe's top clubs no longer stand alone. They sit inside ownership groups, City Football Group, BlueCo, INEOS and others, that run several clubs at once. The sell is synergy. The reality is closer to accounting.

The loop works like this. A network buys a young talent through a smaller affiliate, often in a cheaper or less scrutinised league, and develops him there, off the flagship club's books. When he is ready, he moves up to the big club at an "internal value" that conveniently skips the open market. The headline fee stays low. The financial fair-play maths stays clean.

UEFA has noticed. There are now fair-value checks on transfers between sister clubs. But valuing a footballer is subjective at the best of times, and the softer tricks, inflated loan fees, cross-club sponsorship deals, are very hard to police. The structure keeps moving faster than the rulebook.

The deeper shift is what it does to scouting. The game used to reward the club with the best eye for a player. It is starting to reward the club with the best corporate infrastructure. A standalone side with a brilliant academy now competes against a holding company with five feeder clubs and a tax-efficient route to market. That should worry anyone who likes a fair fight.`,
  },
  {
    kicker: 'The Archive',
    title: 'The World Cup that sold football.',
    meta: 'USA · 1994',
    date: '2026-06-06',
    body: `The hyper-commercial game we watch today did not arrive by accident. It was built, deliberately, at the 1994 World Cup, in a country that did not even have a major professional league.

FIFA's choice was a calculated one. The target was not the football. It was the largest media and consumer market on the planet. The gamble paid off in a way that still stands out: the tournament averaged 68,991 fans a match, a record no edition has beaten since, and it managed that with only 24 teams.

The real change happened on television. American networks and sponsors wanted American production values. Structured ad breaks, on-screen branding, the whole package. For the first time the global game was built around its commercial inventory rather than the other way around.

The money from 1994 did not stay in 1994. It funded the marketing push behind the modern Champions League and convinced FIFA that market expansion beat tradition every time. Everything since, the branding, the expansions, the breakaway threats, traces back to that summer. You can read it as the moment football was saved, or the moment it was sold. Probably both.`,
  },
  {
    kicker: 'The Ledger',
    title: 'The price of missing the Champions League.',
    meta: 'The Swiss Model · 2026',
    date: '2026-06-05',
    body: `Missing out on the Champions League used to be a sporting disappointment. Under the new Swiss Model, it is a hole in the accounts that can run past 70 million euros. The format quietly turned failure into a financial event.

It starts before a ball is kicked. Reaching the league phase pays around 18.6 million euros just for being there. The Europa League equivalent is about 4.3 million. So a club that drops down opens the summer roughly 14 million behind, on the participation fee alone (UEFA's published figures).

Then come the gates. The Swiss Model means eight league games, four of them at home. Miss the competition and you delete two big home dates, which for an elite stadium is something like 8 to 14 million euros in tickets, hospitality and matchday spend. The table pays too: roughly 275,000 euros per place, with bonuses and a Round of 16 cheque stacked on top for the top eight. The biggest clubs clear north of 96 million from the league phase before the knockouts even start.

Add the value-based pool, which rewards the historical giants, and sponsor clauses that cut kit and shirt money when a club drops out of the elite tier, and the gap becomes a chasm. The honest read is that this is less a competition than a moat. The format is built, intentionally or not, to keep the rich clubs rich, and to make one bad season financially dangerous for everyone else.`,
  },
  {
    kicker: 'The Ledger',
    title: "FIFA's billion-dollar Club World Cup.",
    meta: 'Prize distribution · 2026',
    date: '2026-06-04',
    body: `Most of the noise around FIFA's expanded 32-club Club World Cup was about the schedule. The more revealing story is the billion-dollar prize pot, and who it was built to reward.

FIFA splits the purse in two. Around 525 million dollars is participation money, paid for taking part. The other 475 million is performance money, earned through wins and knockout rounds. Fair enough on paper. The catch is the base is nowhere near even.

Twelve European clubs take roughly 306 million dollars of that participation pool. A top-ranked European side can bank up to about 38 million before kicking a ball. Clubs from North America, Asia and Africa receive a flat 9.55 million each. Status is priced straight into the model.

Then it compounds. A group-stage win is worth 2 million, a draw 1 million, reaching the last 16 adds 7.5 million, and the champion takes a 40 million bonus. An unbeaten European winner can clear 85 million in a fortnight. FIFA has bolted on a 250 million dollar solidarity fund for clubs that did not take part, which softens the optics. It does not close the gap. The question the numbers raise is blunt: does a payout like this grow the global game, or just wall off the money for the clubs that already had it?`,
  },
  {
    kicker: 'The Ledger',
    title: 'Chelsea and the long-contract trap.',
    meta: 'Amortization · 2023–2026',
    date: '2026-06-03',
    body: `For a couple of years, Chelsea looked like they had found a cheat code. Sign players to eight and nine-year contracts, spread the transfer fee across all those seasons, and the annual cost on the books stays low enough to keep financial fair play happy. Then the rule-makers shut the door.

Amortization is now capped at five years for accounting, no matter how long the contract runs. The early Clearlake-era signings, Enzo Fernández and Mykhailo Mudryk among them, are grandfathered in at their old low annual rates. Everything new follows the strict cap. The hangover has arrived.

The hidden problem is book value. Spreading a fee over time leaves a remaining value on the balance sheet, and selling a player below that figure books an instant loss. Marc Cucurella's sits somewhere around 18 million. Move him on for less and the accounts take a direct hit. That is how a "cheap" deal quietly becomes an expensive one.

All of this lands just as the Premier League switches to its Squad Cost Ratio, capping total squad spend, wages, fees and amortization, at 85% of revenue. Xabi Alonso inherits the bill. He takes over with roughly 100 million in net room and a clear instruction: sell well before you buy, or the window stalls. The clever accounting did not disappear. It just turned into a constraint.`,
  },
];
