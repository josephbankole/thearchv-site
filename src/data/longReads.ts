// Long Reads — the ARCHV essays (origin: posts published to the ARCHV LinkedIn).
// Football, read like a business. Full text lives in the DOM for SEO (crawlable).
// Brand voice: British English, period-terminated, no em-dashes. The daily engine
// prepends new essays here (newest first) after stripping any dead newsletter CTA.
export interface LongRead {
  kicker: string;   // small category label, e.g. "The Playbook"
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
    body: `Between 2000 and 2003, Real Madrid signed Figo, Zidane, Ronaldo and Beckham, one global icon per summer. The most marketable squad ever assembled. It then went three years without a major trophy.

The failure was not a lack of talent. It was a failure of structure.

They optimised the wrong metric. Signings were increasingly chosen for shirt sales and commercial reach rather than for what the team actually needed on the pitch. The brand strategy quietly took over the football strategy.

They sold the balance. In 2003 Madrid let Claude Makélélé leave for Chelsea, the unglamorous midfielder who did the defensive work that let the stars shine. Zidane's verdict became the case study: why add another layer of gold paint to the Bentley when you are removing the engine?

They confused revenue with results. Commercial income kept climbing while the team declined. For three years the P&L looked healthy and the product did not work, until the trophies, and eventually the model, ran out.

The lesson travels well beyond football. When the most visible part of an organisation starts making decisions the operating core should own, brand spend cannot substitute for structure. Stars win attention. Systems win seasons.`,
  },
  {
    kicker: 'Systems',
    title: 'Ajax: the academy as the institution.',
    meta: 'Ajax · the production model',
    date: '2026-06-09',
    body: `Ajax does not sell players. It sells finished products from a factory it spent fifty years building.

Most clubs treat their academy as a cost centre, a hopeful pipeline that occasionally produces a first-team player. Ajax inverted the model. The academy is the institution; the first team is its showroom.

A codified playing identity. The house style is not a philosophy that lives in one coach's head. It is documented, taught from the youngest age groups up, and applied identically at every level. The system is the intellectual property, not any individual.

A development pathway with a clear exit. Players are produced to a known standard, then sold at peak value to fund the next cohort. Sell-on economics are the business model, not an accident of a good season.

Institutional knowledge that survives turnover. Coaches leave. Stars leave. Directors leave. The method stays, because it was written down, not improvised.

The lesson travels well beyond football. Organisations that depend on individuals are fragile; organisations that depend on documented systems compound. Your most defensible asset is rarely your best person. It is the institutional knowledge that lets you replace them without losing a step.`,
  },
  {
    kicker: 'Dynasty',
    title: "The Class of '92.",
    meta: 'Manchester United · 1992–1999',
    date: '2026-06-07',
    body: `In 1992, Manchester United promoted a group of academy kids. By 1999 they had completed the treble and become the richest club in world football.

That was not luck. It was an operating model: a build-over-buy talent pipeline, a culture that enforced standards before the manager had to, and a commercial flywheel that turned identity into capital.

The uncomfortable question for most organisations is not whether they can afford to develop talent. It is whether they can afford the churn of constantly buying it.

Build over buy is slower, harder and far more durable. The clubs and the companies that endure are rarely the ones that spent the most. They are the ones that built the machine that made spending optional.`,
  },
  {
    kicker: 'Systems',
    title: "Sacchi's 25 metres.",
    meta: 'AC Milan · 1988–1990',
    date: '2026-06-06',
    body: `Between 1988 and 1990, Arrigo Sacchi's AC Milan pressed in a block no deeper than 25 metres from back line to front. It looked like a tactical detail. It was an operating model.

Sacchi's insight was that a designed system could make ordinary positions world-class. His four reference points, the ball, the space, the opponent and the team-mate, were codified, drilled and made repeatable. Individual brilliance was welcome, but the system set the floor. Milan won back-to-back European Cups playing this way, and three decades of high-pressing football followed.

The boardroom translation is uncomfortable for most organisations: hire stars into an undesigned system and you get expensive chaos. Design the system first, and ordinary inputs begin producing extraordinary outputs. Sacchi never held the budget advantage over his rivals. He held the design advantage.

Three questions worth borrowing from him. What are our four reference points? Which of our processes are codified rather than tribal? And if our best people left tomorrow, what would actually remain?`,
  },
];
