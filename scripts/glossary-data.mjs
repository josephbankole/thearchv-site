/* scripts/glossary-data.mjs — the sixty evergreen glossary entries, read by
   scripts/build-glossary-pages.mjs. Each entry:
     slug     URL segment under /glossary/
     title    the term as it reads as an <h1> (e.g. "xG (expected goals)")
     question the visible question, matching the homepage FAQ question verbatim so the two
              surfaces describe the same entity (index.html's FAQPage acceptedAnswer carries a
              `url` back to this page, and its acceptedAnswer text is copied verbatim from the
              `answer` field below for the six strongest entries — see index.html's FAQ section).
     answer   the extraction target for answer engines: 40-60 words, definition first sentence,
              mechanism second. This exact string is BOTH the visible answer paragraph AND the
              FAQPage/DefinedTerm answer text in the page's JSON-LD, so keep it free of &, <, >
              and " to stay byte-identical across the escaped HTML and the JSON. Its first
              sentence is reused as the page's meta description.
     depth    2-3 short paragraphs of history / why it matters / a concrete pre-2025 example.
     related  3 curated slugs from this same list, the entry's "Related terms" neighbours on its
              page (scripts/build-glossary-pages.mjs's relatedList() looks these up by slug, so a
              typo here is a build-time error, not a silent broken link). Hand-picked for topical
              fit (added SEO EXPANSION, 2026-07-14): the four original entries were re-paired
              where one of the six new terms is a better neighbour than the original "every other
              entry" default — e.g. xG now points at xA (same stat family) instead of offside.
   Facts are checked against pre-2025 football history only.

   SEO EXPANSION 2, 2026-07-28 (audit SEO-AEO-AUDIT-2026-07-28.md, item M1). Fifty entries appended
   in two clusters, taking the set from 10 to 60:
     entries 11-40  transfer mechanics — the cluster that produced the +1,360% impressions spike on
                    /glossary/loan-with-obligation/. Window vocabulary, written for someone
                    searching mid-window who wants the definition now.
     entries 41-60  multi-sport evergreen (NFL, Formula 1, tennis, golf) — those four sports had no
                    evergreen surface on the site at all, only dated Answer Desk pages.
   Same discipline as the original ten, plus two rules the new clusters need:
     - Rules that move season to season (Formula 1 formats and allocations, golf tour structures,
       Ryder Cup qualification splits, Premier League spending rules) are stated as MECHANISM in the
       `answer`. Where a current figure appears in `depth` it is pinned to its season in the prose
       and was web-checked on 2026-07-28, not written from memory. Anything that could not be
       verified is described without a number rather than guessed.
     - No transfer fees, no dated player claims. Examples are generic or settled history.
   loan-with-obligation's `related` was also re-pointed (2026-07-28) from three tactics terms to
   three transfer-mechanics neighbours, which is what that page's traffic is actually looking for. */

export const glossaryEntries = [
  {
    slug: "xg",
    title: "xG (expected goals)",
    question: "What does xG (expected goals) mean?",
    answer:
      "xG, or expected goals, is a statistic that rates the quality of a chance as a number between 0 and 1. It works by comparing a shot to thousands of past shots from similar positions and situations, then giving the probability that one like it ends in a goal.",
    depth: [
      "The measure came out of football analytics in the 2000s and reached a mainstream audience when the BBC's Match of the Day started putting it on screen in 2017. A shot from the penalty spot is worth about 0.76 xG, because historically around three of every four penalties are scored.",
      "Its value is in the long run. A side can lose a match while creating the better chances, but over a season a team's xG tends to track its results more closely than any single scoreline does, which is why analysts use it to judge whether a hot or cold run is likely to hold.",
      "It has limits. xG says nothing about who took the shot or how cleanly they struck it, and a model is only as good as the data behind it. Read as a guide to chance quality rather than a verdict on a result, it is one of the clearest numbers in the modern game.",
    ],
    related: ["xa", "false-9", "var"],
  },
  {
    slug: "false-9",
    title: "The false 9",
    question: "What is a false 9 in football?",
    answer:
      "A false 9 is a centre-forward who drops deep into midfield instead of leading the line. The movement pulls central defenders out of position: if they follow, they leave space behind; if they hold, the false 9 is free to receive the ball and turn.",
    depth: [
      "The idea is older than the label. Matthias Sindelar played it for the Austrian Wunderteam in the early 1930s, and Nándor Hidegkuti used it to pull England apart in Hungary's 6-3 win at Wembley in 1953, the first time England had lost at home to a side from continental Europe.",
      "Pep Guardiola's version is the one most fans picture. In a 2009 Clasico at the Bernabeu he moved Lionel Messi from the right wing into the centre as a false 9, and Barcelona won 6-2, with Messi drifting all night into the gap between Real Madrid's midfield and defence.",
      "The role only works with the right player. It needs a forward comfortable receiving with their back to goal and passing quickly, and midfielders willing to run beyond them into the space it opens. Without those runs, a false 9 just leaves a team with nobody in the box.",
    ],
    related: ["half-space", "inverted-full-back", "xg"],
  },
  {
    slug: "offside",
    title: "The offside rule",
    question: "How does the offside rule work?",
    answer:
      "A player is in an offside position if they are nearer the opponent's goal line than both the ball and the second-to-last defender when the ball is played to them. It only becomes an offence if they then get involved, so simply standing in an offside position is not punished.",
    depth: [
      "Offside has been in the game since the first written Laws in 1863, and its wording has been argued over ever since. A player cannot be caught offside in their own half, or directly from a throw-in, a corner, or a goal kick, and being level with the second-to-last defender counts as onside.",
      "One change shaped the modern game. In 1990 the law was rewritten so that an attacker level with the second-to-last defender is onside rather than off, tilting tight calls towards the forward and encouraging teams to push higher up the pitch.",
      "The principle is simple but the margins are not. Video review now measures the closest offsides to within a few centimetres, which is why goals are sometimes ruled out by the width of a shoulder or a boot, and why the rule is still argued about more than any other.",
    ],
    related: ["var", "low-block", "pressing"],
  },
  {
    slug: "var",
    title: "VAR",
    question: "What is VAR in football?",
    answer:
      "VAR, the Video Assistant Referee, is an official who reviews replays and advises the referee on the pitch. It can step in on four kinds of decision only: goals, penalties, straight red cards, and mistaken identity, and only to correct a clear and obvious error the referee has missed.",
    depth: [
      "VAR was written into the Laws of the Game in 2018 after several years of trials, and the 2018 World Cup in Russia was the first to use it across a whole tournament. The referee keeps the final say, and usually makes it after watching the incident again on a pitchside monitor.",
      "The threshold matters. VAR is meant to fix only clear and obvious mistakes, not to re-referee every decision, which is exactly where the arguments start, because what counts as clear and obvious is itself a matter of judgement.",
      "The 2018 World Cup final showed both sides of it. France were awarded a penalty against Croatia after the referee was sent to the monitor to check a handball, Antoine Griezmann scored it, and France went on to win 4-2. The same review that settled that call is the sort supporters have argued over ever since.",
    ],
    related: ["offside", "low-block", "pressing"],
  },
  {
    slug: "pressing",
    title: "Pressing and gegenpressing",
    question: "What is pressing (and gegenpressing)?",
    answer:
      "Pressing is when a team without the ball chases the opponent in possession, closing down passing lanes to force a mistake and win the ball back high up the pitch. Gegenpressing, German for counter-pressing, is the specific version of it: pressing immediately after losing the ball, before the opponent can settle and build an attack.",
    depth: [
      "The idea is old, but the German word reached English-language football through Jürgen Klopp's Borussia Dortmund, who won the Bundesliga in 2010-11 and 2011-12 playing a version of it that flattened opponents inside their own half. Klopp described a good counter-press as the best playmaker a team can have, because winning the ball twenty metres from goal creates a better chance than any pass from midfield.",
      "The tactic depends on structure, not effort alone. Players have to stand close enough together when possession is lost that two or three of them can surround the ball within a few seconds, cutting off the easy pass back and forcing a rushed clearance or a turnover deep in dangerous territory.",
      "Pressing this way is exhausting, and a team that presses badly just opens gaps behind its own defence. It became one of the defining ideas of the 2010s and 2020s all the same, because a well-drilled press turns defending into the first stage of attack rather than the opposite of it.",
    ],
    related: ["low-block", "half-space", "offside"],
  },
  {
    slug: "low-block",
    title: "The low block",
    question: "What is a low block?",
    answer:
      "A low block is a defensive shape in which a team drops almost every outfield player into their own half, often to the edge of their own box, to deny space in behind and force the opponent to break them down in a crowded area. It trades possession for compactness, usually to protect a lead against a stronger side.",
    depth: [
      "Sitting deep is as old as the game, but Greece's run to the Euro 2004 title is the example most often reached for: a squad with modest individual talent that went the whole tournament conceding almost nothing, built around a settled back line that knew exactly where to stand without the ball. Otto Rehhagel's side beat the host nation, Portugal, in both the opening match and the final.",
      "Chelsea's 2012 Champions League final is the sharper example of it working under real pressure. Away at Bayern Munich's own stadium, Roberto Di Matteo's side spent long spells with almost the whole team behind the ball, survived until a late equaliser from Didier Drogba, and won the penalty shootout that followed.",
      "A low block only works with discipline. Every player has to hold their position and their patience, because one gap anywhere in the line lets the whole shape collapse, and a team using it usually creates very little going the other way.",
    ],
    related: ["pressing", "offside", "var"],
  },
  {
    slug: "inverted-full-back",
    title: "The inverted full-back",
    question: "What is an inverted full-back?",
    answer:
      "An inverted full-back is a defender who lines up wide but, once their team has the ball, steps into central midfield rather than overlapping down the touchline. It thickens the middle of the pitch for building play and leaves players better placed to stop a counter-attack the moment possession is lost, instead of being stranded upfield out wide.",
    depth: [
      "Pep Guardiola made the role well known at Bayern Munich from the 2013-14 season, moving Philipp Lahm, one of the best right-backs in the world at the time, into central midfield once his team settled into possession. Lahm ran games from there the way a specialist holding midfielder would.",
      "Guardiola did it again at Manchester City with João Cancelo between 2020 and 2022, tucking him inside to add an extra body in midfield during City's title-winning seasons. Other coaches have since built their own versions of the same idea.",
      "The trade-off is pace out wide. A team built this way gives up some of the width and directness of a traditional overlapping full-back in exchange for control of the centre of the pitch, on the bet that dominating possession there matters more than a straight run down the line.",
    ],
    related: ["half-space", "false-9", "pressing"],
  },
  {
    slug: "half-space",
    title: "Half-spaces",
    question: "What are half-spaces?",
    answer:
      "Half-spaces are the two vertical strips of the pitch between the wide touchline channel and the central lane, roughly level with the edges of the penalty area. A player on the ball there is harder to defend than one on the touchline or in the centre, because a single defender must choose between going central or covering the width.",
    depth: [
      "The term translates the German word Halbraum and spread into English-language football writing through German tactical analysis in the mid-2010s, chief among it the website Spielverlagerung, before English pundits and coaches picked it up too.",
      "Attacks built through the half-space are hard to defend cleanly. A winger cutting inside from there, or a midfielder receiving between the lines, can shoot, pass into the box or drive at goal, and a defender who commits to closing down one option opens up the other two.",
      "It is one reason modern wide players drift inside rather than hug the touchline, and one reason the traditional winger who only wants the ball at the byline has become rarer than it used to be.",
    ],
    related: ["inverted-full-back", "false-9", "pressing"],
  },
  {
    slug: "xa",
    title: "xA (expected assists)",
    question: "What does xA (expected assists) mean?",
    answer:
      "xA, or expected assists, measures the likelihood that a pass becomes a goal assist, based on the quality of the chance it creates for the player who receives it. It is essentially the xG value of the shot that follows, credited to the passer, used to judge chance creation regardless of whether the finish goes in.",
    depth: [
      "xA grew out of the same data-tracking boom that produced xG in the 2010s. Companies such as Opta were already logging where every pass and shot happened on the pitch, so building a model for chance creation, not just chance taking, was a natural next step.",
      "Kevin De Bruyne is the player analysts reach for most often. In the 2019-20 season he recorded 20 Premier League assists, level with Thierry Henry's record from 2002-03, and his underlying chance-creation numbers across his best Manchester City seasons ranked among the highest in the division year after year.",
      "Like xG, xA is a guide rather than a verdict. It says a pass created a good chance, not that the pass itself was inventive or difficult to play, so the two numbers are best read together rather than as a final judgement on a player's creativity.",
    ],
    related: ["xg", "false-9", "var"],
  },
  {
    slug: "loan-with-obligation",
    title: "A loan with an obligation to buy",
    question: "What is a loan with an obligation to buy?",
    answer:
      "A loan with an obligation to buy is a transfer structure in which a player moves to a club temporarily, but that club must sign them permanently once agreed conditions are met, such as appearances played or promotion. It differs from a loan with an option to buy, where the permanent deal is a choice, not a requirement.",
    depth: [
      "The structure is especially common in Italian football, where clubs have long used a paid loan with an obligation to buy, known there as prestito oneroso con obbligo di riscatto, to spread a transfer fee across two accounting periods and ease the pressure of financial fair play rules in a single summer.",
      "It gives both clubs something. The selling club gets a fee it can treat as close to guaranteed, and the buying club gets a season to assess the player, and to spread the cost, before the signing becomes permanent on the books.",
      "The risk sits with the buying club, because the obligation triggers whether or not the loan spell has gone well. A player has to be signed permanently once the agreed conditions are met regardless of form, which is why clubs negotiate those conditions as carefully as the fee itself.",
    ],
    related: ["loan-with-option", "option-vs-obligation", "amortisation"],
  },

  /* ---------- CLUSTER: transfer mechanics (SEO EXPANSION 2, 2026-07-28) ---------- */

  {
    slug: "loan-with-option",
    title: "A loan with an option to buy",
    question: "What is a loan with an option to buy?",
    answer:
      "A loan with an option to buy is a temporary transfer in which the borrowing club has the right, but not the duty, to sign the player permanently at a price fixed in advance. If the club declines, the player simply returns to their parent club when the loan ends.",
    depth: [
      "The appeal for the borrowing club is that it gets a season to find out whether the player fits, at a price it has already locked in. If the player is a success the fee cannot be raised, and if the player struggles the club walks away having paid only the loan fee and a share of the wages.",
      "The selling club takes the weaker side of that bargain, and an option is therefore usually cheaper than an obligation. It has committed to a price without any guarantee of a sale, and it may get the player back a year older with a season of uncertainty behind them.",
      "Options are often written with triggers attached. A club might hold the option only until a set date, or the price might rise if the player passes a certain number of appearances, which stops the borrowing club playing them heavily and then buying cheap.",
    ],
    related: ["loan-with-obligation", "option-vs-obligation", "add-ons"],
  },
  {
    slug: "option-vs-obligation",
    title: "Option to buy versus obligation to buy",
    question: "What is the difference between an option to buy and an obligation to buy?",
    answer:
      "An option to buy gives the borrowing club a choice at the end of a loan; an obligation to buy removes that choice once agreed conditions are met. Both fix the fee in advance. The difference is who carries the risk if the loan spell goes badly.",
    depth: [
      "Under an option, the risk sits with the selling club. It has agreed a price and then has to wait to find out whether anyone will pay it. Under an obligation, the risk moves to the buying club, which is committed to the signing whether the player has been excellent or barely played.",
      "Because of that, the two are priced differently. A club that wants an obligation rather than an option is usually asked for more money, or for the conditions to be set low enough that they are close to certain to trigger. An obligation that only fires on winning a league title is an option wearing a different hat.",
      "There is a third shape between the two, sometimes called a conditional obligation. The deal starts as an option and converts into an obligation automatically once something specific happens, most often a number of appearances or promotion, which is why the appearance threshold is negotiated as hard as the fee.",
    ],
    related: ["loan-with-option", "loan-with-obligation", "structured-payments"],
  },
  {
    slug: "release-clause",
    title: "Release clauses and buy-out clauses",
    question: "What is a release clause in football?",
    answer:
      "A release clause is a figure written into a player's contract at which their club must allow talks with a buyer, or must accept a bid outright. A buy-out clause is the stricter Spanish version: the player buys out the rest of their own contract, and the club cannot refuse.",
    depth: [
      "The two get used interchangeably in reporting, but they behave differently. A release clause is a term between the club and the player, and its exact effect depends on the wording. Some only oblige the club to open negotiations, so a bid at the clause figure does not always end in a transfer.",
      "A buy-out clause comes from Spanish employment law, where every professional contract has to carry one. The buying side deposits the sum with the league on the player's behalf, the contract is terminated unilaterally, and the selling club has no say. That is why Spanish clubs set the figures deliberately high.",
      "Clauses are often conditional in ways that never make the headline. They can apply only to clubs abroad, only in a particular window, only above a certain league position, or lapse entirely after a set date. A player and their agent will push for a low, wide clause; the club will push for a high, narrow one.",
    ],
    related: ["buy-back-clause", "sell-on-clause", "personal-terms"],
  },
  {
    slug: "sell-on-clause",
    title: "The sell-on clause",
    question: "What is a sell-on clause?",
    answer:
      "A sell-on clause entitles a selling club to a percentage of any future fee the buying club receives when it sells the player on. It is usually a slice of the profit rather than the whole fee, and it lets a smaller club keep a stake in a player it can no longer afford to keep.",
    depth: [
      "The distinction between a share of the fee and a share of the profit matters more than the percentage does. Twenty per cent of the whole resale fee is worth far more than twenty per cent of the amount above what the buying club originally paid, and reporting rarely says which one has been agreed.",
      "Selling clubs use the clause when they know they are selling early. A youth-development club that cannot hold on to its best graduate can accept a modest fee now and keep an interest in the player becoming expensive later, which is often worth more than the original sale.",
      "Buying clubs dislike them for the obvious reason: the clause eats into a future profit and complicates the next negotiation, because the third club is effectively being asked to fund a payment to a club it has nothing to do with. Some deals buy the clause out later for a one-off payment.",
    ],
    related: ["add-ons", "buy-back-clause", "undisclosed-fee"],
  },
  {
    slug: "buy-back-clause",
    title: "The buy-back clause",
    question: "What is a buy-back clause?",
    answer:
      "A buy-back clause lets the selling club re-sign a player at a price agreed at the time of the sale, usually within a set window of years. Big clubs use it when selling a young player they may want back, so a rival cannot price them out later.",
    depth: [
      "It is mostly an academy tool. A club with more talented teenagers than places will sell one to a smaller side for regular football, and write in the right to buy them back if they develop into the player it hoped for. The buying club gets a real signing at a real price and accepts the ceiling that comes with it.",
      "The terms usually restrict when it can be used. A buy-back might be exercisable only in a particular summer, or only once, or only before the player turns a certain age, and the price often rises each year it goes unused.",
      "The clause can also work against the buying club in the market. A player known to carry a buy-back is harder to sell to anyone else, because a third club would be buying an asset another club can reclaim, so some deals attach a higher price to buying the clause out.",
    ],
    related: ["sell-on-clause", "release-clause", "loan-with-option"],
  },
  {
    slug: "agent-fees",
    title: "Agent fees",
    question: "How do agent fees work in football transfers?",
    answer:
      "An agent fee is the commission paid for negotiating a transfer or a contract, calculated as a percentage of the fee or the player's wages. It is usually paid by the buying club rather than the player, and English football publishes the totals each club pays every year.",
    depth: [
      "The practical reason clubs pay is tax and cash flow. A player would have to earn the money, be taxed on it and then pay the agent; a club paying the agent directly is cheaper for everyone involved, which is how a service bought by the player came to be funded by the clubs.",
      "FIFA brought in a licensing system for agents in 2023, along with a cap on commission as a share of the deal. The cap has been challenged in national courts and before competition regulators in several countries, so how strictly it applies has varied by jurisdiction rather than settling into one global rule.",
      "The published English figures are worth reading with care. They cover a full season across every deal a club did, including contract renewals, so a single large number says little about any one transfer. They are still the only routine public disclosure of what this part of the market costs.",
    ],
    related: ["dual-representation", "signing-on-fee", "tapping-up"],
  },
  {
    slug: "signing-on-fee",
    title: "The signing-on fee",
    question: "What is a signing-on fee?",
    answer:
      "A signing-on fee is a lump sum paid to the player for agreeing to join a club, separate from the transfer fee paid to their old club and from their wages. It is often split into instalments across the length of the contract rather than handed over on day one.",
    depth: [
      "Splitting it into instalments is deliberate. Paying a fifth of the signing-on fee each year of a five year contract keeps the player financially tied to seeing the deal out, and gives the club something to withhold if the player forces a move.",
      "The fee grows in importance the cheaper the transfer is. On a free transfer there is no fee to the selling club, so the money that would have gone there tends to reappear as a signing-on payment and higher wages, which is why free transfers are rarely as cheap as they look.",
      "It also interacts with loyalty bonuses, which work the other way around: a payment for staying rather than for arriving. A player who hands in a transfer request can forfeit those, which is one of the few real costs attached to asking to leave.",
    ],
    related: ["personal-terms", "wage-structure", "free-transfer"],
  },
  {
    slug: "amortisation",
    title: "Amortisation",
    question: "What is amortisation in football transfers?",
    answer:
      "Amortisation is the accounting method that spreads a transfer fee across the length of a player's contract instead of charging it all in one year. A fee on a five year deal counts as one fifth of the cost in each of those five years. Long contracts therefore ease the pressure of spending rules.",
    depth: [
      "It explains a pattern that otherwise looks strange: clubs handing long contracts to players who are already established. A longer deal means a smaller annual charge against the accounts, and spending rules are measured annually, so the length of the contract is a financial decision as much as a sporting one.",
      "Governing bodies eventually capped it. UEFA limited how many years a fee can be spread over for the purposes of its own rules, which stopped clubs stretching contracts to unusual lengths purely to flatten the accounting charge.",
      "Amortisation also explains why selling academy players is so useful. A graduate cost nothing to buy, so their book value is close to zero and almost the entire sale price is recorded as profit, while selling a recent signing part-way through their contract can register a loss even at a healthy fee.",
    ],
    related: ["ffp-and-psr", "structured-payments", "loan-with-obligation"],
  },
  {
    slug: "ffp-and-psr",
    title: "Financial fair play, PSR and squad cost ratio",
    question: "What is the difference between financial fair play and PSR?",
    answer:
      "Financial fair play is UEFA's framework for stopping clubs spending more than they earn. Profitability and Sustainability Rules, or PSR, is the Premier League's own version of the same idea, measured over a rolling three year period. Both are now moving towards capping squad spending as a share of revenue.",
    depth: [
      "The two are separate systems with separate punishments. UEFA's rules govern entry to its competitions, so a breach threatens a European place or a settlement agreement. The Premier League's rules govern membership of the league, and a breach is handled by an independent commission that can impose a points deduction.",
      "The direction of travel in both is away from a simple losses limit and towards a squad cost ratio, which measures wages, transfer amortisation and agent fees against revenue. UEFA phased in a ratio of that kind across the mid-2020s, capping squad spending at a share of what a club brings in.",
      "The Premier League followed. Clubs voted in late 2025 to replace PSR from the 2026-27 season with a squad cost ratio, set at a threshold of roughly 85 per cent of revenue, plus a separate resilience test, with fines for going over the first line and a points deduction for going well past it. PSR remained the binding rule through the 2025-26 transition.",
    ],
    related: ["amortisation", "wage-structure", "homegrown-quota"],
  },
  {
    slug: "bid-vs-enquiry",
    title: "A bid versus an enquiry",
    question: "What is the difference between a bid and an enquiry in a transfer?",
    answer:
      "An enquiry is an informal question about whether a player is available and roughly what it would take. A bid is a formal written offer with a fee and terms attached, which the selling club must consider and answer. Most reported transfer interest never gets past the enquiry stage.",
    depth: [
      "The gap between the two is where most transfer reporting lives. A club asking a question costs nothing and commits nobody, and it can be briefed out as interest, so a great deal of what reads as an approaching deal is one phone call that went nowhere.",
      "A bid changes the position because it forces a decision. The selling club has to respond, the player usually learns of it, and a rejected bid establishes a number the buying club will have to beat. That is why clubs sometimes hold off bidding formally until they think the answer will be yes.",
      "The ARCHV treats the distinction as an editorial line rather than a technicality. An enquiry is not a bid, a bid is not an agreement, an agreement between clubs is not a completed transfer, and a story that blurs those steps is describing a deal that may never happen.",
    ],
    related: ["personal-terms", "undisclosed-fee", "tapping-up"],
  },
  {
    slug: "personal-terms",
    title: "Personal terms",
    question: "What does agreeing personal terms mean?",
    answer:
      "Personal terms are the parts of a transfer agreed between the club and the player rather than between the two clubs: wages, contract length, bonuses, image rights and any release clause. A deal needs both, so a fee agreed between clubs still collapses if personal terms cannot be settled.",
    depth: [
      "Two negotiations run alongside each other in any transfer. Clubs settle the fee and its structure; the player, usually through an agent, settles what they will earn and under what conditions. Either can fail on its own, and that is how a transfer gets reported as agreed and then quietly dies.",
      "The sticking point is often not the headline wage. Contract length matters for a player near thirty, bonus triggers matter for a forward, and a release clause matters for anyone joining a club they see as a step rather than a destination. A club with a rigid wage structure will trade on those before it breaks its salary bands.",
      "Personal terms can legitimately be discussed before a fee is agreed if the current club has given permission, and cannot be if it has not. Opening those talks without permission is tapping up, which is a disciplinary matter rather than a formality.",
    ],
    related: ["signing-on-fee", "image-rights", "wage-structure"],
  },
  {
    slug: "transfer-medical",
    title: "The transfer medical",
    question: "What happens in a football transfer medical?",
    answer:
      "A transfer medical is the physical examination a signing club runs before completing a deal, covering scans of past injuries, cardiac screening, blood tests and movement assessments. It is a risk check on a long and expensive contract, and a poor result can reduce the fee or end the transfer.",
    depth: [
      "Clubs are underwriting years of guaranteed wages, so the examination goes well beyond a fitness test. Imaging of old problem areas, heart screening and workload history all feed into a judgement about how many matches the player is likely to be available for across the contract.",
      "Failing a medical rarely means being declared unfit. More often the club's medical staff flag a risk, and the deal is restructured around it: a shorter contract, a lower guaranteed fee with more of it moved into appearance-based add-ons, or an insurance arrangement.",
      "The timing explains the deadline day scramble. A medical cannot start until the clubs have agreed enough for the player to travel, so the last hours of a window are spent on a process that ordinarily takes most of a day, which is where deal sheets come in.",
    ],
    related: ["personal-terms", "bid-vs-enquiry", "deadline-day"],
  },
  {
    slug: "work-permit",
    title: "Work permits",
    question: "What is a work permit in football and who needs one?",
    answer:
      "A work permit is the immigration clearance a player from outside the host country needs before they can be registered. In England the Football Association operates a points system, awarding points for international appearances, the standard of the selling league and the size of the fee and wages.",
    depth: [
      "The points approach replaced a simpler rule that asked only how often a player had played for their country. Under the current system a player can qualify without international caps if they are moving from a strong league, playing regularly, and being bought and paid at a level that signals quality.",
      "A player who falls short can still be signed through an exceptions panel, which weighs the case on its merits. That route is how clubs sign talented players from leagues that score badly in the tables, and it is discretionary rather than automatic.",
      "The system reshaped English recruitment after freedom of movement ended, because European players who could once sign without any clearance now have to clear the same bar. It made teenage signings from Europe far harder. Young players rarely have the caps or the league minutes to score.",
    ],
    related: ["homegrown-quota", "domestic-and-international-windows", "pre-contract"],
  },
  {
    slug: "pre-contract",
    title: "The pre-contract agreement",
    question: "What is a pre-contract agreement in football?",
    answer:
      "A pre-contract is a binding agreement a player signs with a new club while still under contract elsewhere, allowed once their existing deal has under six months left. The move itself happens when the old contract expires, and the new club pays no transfer fee.",
    depth: [
      "The six month line comes from FIFA's transfer regulations, which let a player conclude a contract with another club once their current one is within that period of expiring. Until that point an approach needs the current club's permission.",
      "Domestic rules vary on top of it. Some associations allow clubs in the same country to agree pre-contracts on the same basis, others restrict it, which is why the best known pre-contract moves tend to be across borders and why Scottish football in particular is associated with the term.",
      "For the selling club it is the worst outcome in the market: a player they can no longer sell, running down a contract in public, with a destination already settled. That pressure is why clubs push so hard to either renew or sell in the summer before a final year begins.",
    ],
    related: ["bosman-ruling", "free-transfer", "transfer-window"],
  },
  {
    slug: "bosman-ruling",
    title: "The Bosman ruling",
    question: "What is the Bosman ruling?",
    answer:
      "The Bosman ruling is a 1995 European Court of Justice judgment that let players inside the European Union move to another club for no fee once their contract had expired. Before it, a club could hold a player's registration and demand a fee even after the contract ran out.",
    depth: [
      "The case was brought by Jean-Marc Bosman, a Belgian midfielder whose contract at RFC Liege ended and who wanted to join a French club. His own club demanded a fee anyway and, when none was paid, he was left unable to move on the terms he wanted. He took the case to the European Court and won.",
      "The judgment did two things. It ended fees for out-of-contract players within the European Union, and it struck down the quotas that limited how many players from other member states a club could field. Squads across Europe changed shape within a few seasons.",
      "It also handed players and their agents real leverage for the first time. A contract's final two years became the point of maximum pressure on a club, and the modern pattern of renew-or-sell dates from it, as does the free transfer as a serious route to signing an established player.",
    ],
    related: ["free-transfer", "pre-contract", "release-clause"],
  },
  {
    slug: "free-transfer",
    title: "The free transfer",
    question: "What is a free transfer?",
    answer:
      "A free transfer is a move in which no fee is paid to the selling club, because the player's contract has expired or been cancelled. It is not free to the buying club: wages, signing-on fees and agent commission still apply, and are often higher precisely because no fee is due.",
    depth: [
      "The money does not disappear, it moves. With nothing owed to the selling club, the player and their representatives are negotiating for a share of what a fee would have been, which usually appears as a large signing-on payment, a high wage or both.",
      "Free transfers also carry a hidden accounting cost. There is no fee to spread across the contract, so nothing is amortised, but the full wage bill lands in the accounts every year, and there is no book value to sell on later if the signing does not work.",
      "For selling clubs the risk is the reverse. Letting a valuable player reach the end of a contract converts an asset into nothing, so clubs facing a final year will often accept a reduced fee rather than keep a player whose value they cannot replace.",
    ],
    related: ["bosman-ruling", "pre-contract", "signing-on-fee"],
  },
  {
    slug: "undisclosed-fee",
    title: "The undisclosed fee",
    question: "What does an undisclosed transfer fee mean?",
    answer:
      "An undisclosed fee means the two clubs have agreed not to publish the price. Clubs do it to protect their negotiating position on future deals and to avoid setting a public benchmark. Figures reported in the press for undisclosed deals are estimates, not confirmed numbers.",
    depth: [
      "Clubs have practical reasons. A published fee becomes the reference point for the next negotiation, for the player's own contract talks, and for supporters judging whether a signing has worked. Keeping it private removes all three.",
      "The number still tends to emerge, usually from the clubs' published accounts a year or more later, and often at a different figure to the one reported at the time. Those accounts are the only version of a fee that anybody has signed off.",
      "This is why fee reporting is one of the easiest places to get a story wrong. The ARCHV leads on the highest figure a named source has printed and does not round one up, invent one or repeat an aggregator's estimate as though it were a confirmed price.",
    ],
    related: ["add-ons", "structured-payments", "sell-on-clause"],
  },
  {
    slug: "add-ons",
    title: "Add-ons in a transfer fee",
    question: "What are add-ons in a transfer fee?",
    answer:
      "Add-ons are extra payments on top of a base transfer fee, triggered only if agreed conditions happen: a number of appearances, goals, international caps, a trophy or qualification for European competition. They let a buying club pay less up front and a selling club share in the player succeeding.",
    depth: [
      "They exist because the two clubs disagree about the player and neither will move. The buyer thinks the asking price assumes a level the player has not reached; the seller thinks the offer ignores what the player will become. Add-ons settle the argument by making part of the fee conditional on who was right.",
      "How reachable the conditions are varies enormously, and this is where reported fees mislead. A headline that quotes the base fee plus every add-on describes a maximum that may need the player to become a regular international and win a trophy. Only the guaranteed part is certain to be paid.",
      "Some triggers depend on the club rather than the player, such as qualifying for the Champions League, so a selling club can end up receiving money because of a season it had no part in.",
    ],
    related: ["undisclosed-fee", "structured-payments", "sell-on-clause"],
  },
  {
    slug: "structured-payments",
    title: "Structured payments and instalments",
    question: "How are transfer fees paid in instalments?",
    answer:
      "Most transfer fees are paid in instalments over several years rather than in one payment, with the schedule written into the deal. The headline figure is the total, so two clubs quoting the same fee can be paying very different amounts in the first year.",
    depth: [
      "The structure is often the real negotiation. A selling club that needs cash now will accept a lower total in exchange for more of it up front, and a buying club short of immediate room will pay a higher total for the right to spread it. Both sides can then announce a number that suits them.",
      "This is separate from amortisation, and the two are easy to confuse. Instalments are when the money actually leaves the bank; amortisation is how the cost is recorded in the accounts each year. A fee can be paid over two years and accounted for over five.",
      "Selling clubs sometimes take payment risk into account as well, because instalments due over several years depend on the buying club still being able to pay them. Deals occasionally include guarantees or a discount for early settlement for exactly that reason.",
    ],
    related: ["amortisation", "add-ons", "undisclosed-fee"],
  },
  {
    slug: "wage-structure",
    title: "The wage structure",
    question: "What is a club wage structure?",
    answer:
      "A wage structure is the internal ceiling a club sets on what any player can earn, usually banded by role and seniority. Clubs hold it to keep the dressing room calm and the wage bill controllable. Some transfers collapse over salary alone, even after the fee is agreed.",
    depth: [
      "The dressing room argument is the one clubs make publicly, and it is real. Wages leak, and a squad in which one arrival earns several times what a long-serving international earns creates a renewal problem with every player already there, not just a cost problem with the new one.",
      "The financial argument now matters more. Spending rules increasingly measure wages as a share of revenue, so the wage bill is not simply a matter of what an owner can afford; it is a regulated number with sanctions attached to breaching it.",
      "Breaking a structure once tends to reset it. A club that pays well above its bands to land one signing will usually find the next round of contract talks starts from that figure, which is why some clubs would rather lose a transfer than win it on those terms.",
    ],
    related: ["personal-terms", "ffp-and-psr", "signing-on-fee"],
  },
  {
    slug: "homegrown-quota",
    title: "The homegrown player rule",
    question: "What is the homegrown player rule?",
    answer:
      "The homegrown rule requires clubs to fill part of their registered squad with players trained domestically for three years before the age of 21. It is a quota on squad composition, not on nationality, so a foreign player who came through an English academy still counts as homegrown.",
    depth: [
      "The nationality point is the one most often misread. A player born abroad who joined an English club as a teenager and spent three seasons registered there qualifies, while an England international who spent their entire youth career overseas may not.",
      "The Premier League applies it through a squad list capped at 25 players, within which only a set number may be non-homegrown, with under-21s registrable separately and outside the cap. UEFA runs its own version for European competition, which additionally reserves places for players trained by the club itself rather than merely in the same country.",
      "It shapes the market in a way that is easy to see in fees. A competent homegrown squad player is worth more to an English club than an equivalent foreign one, because the quota makes the registration itself scarce, and domestically trained players carry a premium as a result.",
    ],
    related: ["work-permit", "ffp-and-psr", "loan-army"],
  },
  {
    slug: "transfer-window",
    title: "Transfer windows and registration",
    question: "How do football transfer windows work?",
    answer:
      "A transfer window is the period in which a club can register a new player with its league. Most countries run a long window in the summer and a shorter one in mid-season. Outside those dates a signing can be agreed but the player cannot be registered to play.",
    depth: [
      "Registration is the thing that actually matters. The window does not stop clubs negotiating, agreeing terms or even signing contracts; it stops the paperwork that makes a player eligible. Deals are sometimes announced weeks before a window opens and completed on the first day it does.",
      "Windows are set by each national association within limits agreed with FIFA, so the closing dates across Europe are close together but not identical. Leagues outside Europe run on their own calendars entirely, following their own season rather than the European one.",
      "Free agents are the exception. A player without a contract has no registration to transfer, so most competitions allow them to be signed outside a window, which is why clubs hit by injuries in midwinter go looking at players who are already out of work.",
    ],
    related: ["deadline-day", "domestic-and-international-windows", "pre-contract"],
  },
  {
    slug: "deadline-day",
    title: "Deadline day",
    question: "How does transfer deadline day work?",
    answer:
      "Deadline day is the last day of a transfer window, ending at a fixed hour set by each league. Clubs that have a deal substantially agreed can file a deal sheet shortly before the deadline, which buys extra time to submit the remaining paperwork.",
    depth: [
      "The deal sheet is the reason transfers keep being confirmed after the deadline has passed. A club that lodges one before the cut-off is telling the league the essentials are agreed and the documents are coming, and it gets a short extension to file them. It is not a way to keep negotiating.",
      "The rush is structural rather than theatrical. Selling clubs will not release a player until they have a replacement lined up, so a chain of deals can hang on one club at the top of it deciding, and every club in the chain is waiting on someone else's decision.",
      "That is also why late deals skew towards loans. A loan is quicker to agree, needs less due diligence and carries less risk if it goes wrong, so a club that has run out of time to buy will often borrow instead.",
    ],
    related: ["transfer-window", "domestic-and-international-windows", "bid-vs-enquiry"],
  },
  {
    slug: "tapping-up",
    title: "Tapping up",
    question: "What is tapping up in football?",
    answer:
      "Tapping up is approaching a player who is under contract at another club, or their representatives, without that club's permission. It breaches the rules of most competitions, which require a club to notify the current employer before opening talks, and it can bring fines or transfer sanctions.",
    depth: [
      "The rule is easy to state and hard to police. Almost every transfer involves an agent who has spoken to several clubs, and the line between an agent offering a player and a club approaching one is thin enough that most cases never produce evidence.",
      "Charges therefore tend to follow something written down or said in public. A manager naming another club's player admiringly in a press conference is the version supporters see, and it is enough to draw a complaint even when nothing improper has happened behind it.",
      "The rule exists to protect contracts rather than to stop transfers. A club that wants a contracted player is expected to ask the club first, get a yes or a no, and negotiate from there, which is what a formal bid is for.",
    ],
    related: ["bid-vs-enquiry", "agent-fees", "pre-contract"],
  },
  {
    slug: "dual-representation",
    title: "Dual representation",
    question: "What is dual representation in a transfer?",
    answer:
      "Dual representation is when one agent acts for both the player and a club in the same deal, and is paid by both. It is permitted under disclosure rules but creates an obvious conflict of interest, because the same person is negotiating against themselves on fee and wages.",
    depth: [
      "The conflict is structural. An agent representing the player wants the highest wage and the best terms; the same agent representing the buying club is meant to be helping it pay less. Both sides are paying the same person to argue against the other one.",
      "Regulators have generally handled it through consent and disclosure rather than a ban, requiring everyone involved to agree in writing that they know it is happening. FIFA's agent regulations tightened the rules around who may be paid by whom, and how much of that must be declared.",
      "It is one reason the published agent payment figures are worth reading. They do not separate a straightforward commission from a fee earned on both sides of the same transaction, but the totals are the only routine window the public gets into how the money moves.",
    ],
    related: ["agent-fees", "image-rights", "personal-terms"],
  },
  {
    slug: "image-rights",
    title: "Image rights",
    question: "What are image rights in a football contract?",
    answer:
      "Image rights are the commercial value of a player's name, face and likeness, licensed to the club separately from playing wages. The club uses them in shirt sales, sponsorship and advertising. Because they are paid to a company rather than as salary, tax authorities scrutinise how they are structured.",
    depth: [
      "For most squad players the arrangement is small and routine. For a player whose face sells shirts and appears in a sponsor's campaign, it can be a substantial second income stream and a real part of what makes one offer better than another.",
      "The tax question is why it draws attention. Payments for a licence to use a likeness are treated differently from wages in many countries, and revenue authorities in several major footballing nations have pursued cases where they judged the split between the two to be artificial.",
      "It also affects transfers directly. A player who has already sold their image rights to a third party, or who holds them personally on terms a club will not accept, is harder to sign than the wage discussion alone suggests, and negotiations can stall there long after the fee is settled.",
    ],
    related: ["personal-terms", "dual-representation", "signing-on-fee"],
  },
  {
    slug: "loan-army",
    title: "The loan army",
    question: "What is a loan army in football?",
    answer:
      "A loan army is a squad of young or fringe players a club signs and then lends out in bulk, so they develop and get seen somewhere else. FIFA now limits the practice, capping how many players a club may loan out and take in across borders in a season.",
    depth: [
      "The model made sense on its own terms. A wealthy club could sign promising players it had no immediate place for, spread them across smaller clubs at home and abroad, and sell the ones who developed at a profit while keeping the ones who became good enough for its own team.",
      "The objections were that it hoarded talent and distorted competition. Dozens of players controlled by one club and scattered across rival leagues gave that club influence far beyond its own squad, and left players stuck in a cycle of temporary moves.",
      "FIFA responded with a cap on international loans, phased in across several seasons and reaching a single-figure limit on players loaned out and taken in per season, with carve-outs for younger players and those the club trained itself. Domestic loans within the same association are governed separately.",
    ],
    related: ["loan-with-obligation", "loan-with-option", "emergency-loan"],
  },
  {
    slug: "emergency-loan",
    title: "The emergency loan",
    question: "What is an emergency loan in football?",
    answer:
      "An emergency loan is a short-term signing made outside a transfer window to cover an unexpected shortage, most often an injured goalkeeper. FIFA rules restrict registrations outside windows, so where they survive they are narrow exceptions granted by a league rather than a general route into the market.",
    depth: [
      "English football once ran a broad version of this. Clubs in the Football League could borrow players outside the window on short deals, and lower-division squads were built around the availability of them, until FIFA's insistence that registrations happen inside windows forced the system to be withdrawn.",
      "What remains tends to be goalkeeper-specific and tightly conditioned. A club that loses its senior goalkeepers to injury or suspension has a problem no outfield substitution solves, so competitions have generally kept some route to registering cover in that one position.",
      "The wider point is that the window is a registration rule, not a contract rule. A club can agree whatever it likes at any time of year; what it cannot do outside a window is make a new player eligible to play, and exceptions to that are granted narrowly.",
    ],
    related: ["loan-army", "transfer-window", "domestic-and-international-windows"],
  },
  {
    slug: "domestic-and-international-windows",
    title: "Domestic and international transfer windows",
    question: "What is the difference between a domestic and an international transfer window?",
    answer:
      "Every national association sets two registration periods with FIFA: an international window governing transfers in and out of the country, and a domestic window for moves between clubs in the same association. They usually run together, but they can close at different times, so the two deadlines are not always the same hour.",
    depth: [
      "The distinction is administrative and matters enormously in practice. A transfer from abroad needs an International Transfer Certificate passed between the two associations through FIFA's system, and that clearance has to arrive before the international window shuts, whatever the domestic deadline says.",
      "Because associations set their own dates, a club can find itself able to sign from one country after it can no longer sign from another. The gaps are usually small, but on deadline day small gaps decide deals.",
      "Players under 18 face a further layer. FIFA restricts international transfers of minors to a short list of defined exceptions, which is why a promising teenager can be signed within a country far more easily than across a border.",
    ],
    related: ["transfer-window", "deadline-day", "work-permit"],
  },
  {
    slug: "transfer-request",
    title: "The transfer request",
    question: "What is a transfer request?",
    answer:
      "A transfer request is a formal statement from a player asking to leave, usually made in writing to the club. It carries no power to force a move, because the contract still holds, but it can cost the player loyalty bonuses and it signals to buyers that the player wants out.",
    depth: [
      "The contract is the point. A request changes nothing legally: the player is still registered, still owed their wages and still unable to play for anyone else. What it changes is the atmosphere, and clubs know that a public request damages the value of the player they are trying to keep.",
      "It usually costs the player money. Contracts commonly make loyalty payments conditional on not requesting a transfer, so the request is a real financial decision rather than a free way to apply pressure, which is why many players prefer to let an agent apply the pressure quietly.",
      "Clubs have their own version of the same manoeuvre: leaving a player out of the squad, out of the squad photo or out of the pre-season tour. Neither side can force the other to move, so both are trying to make staying uncomfortable enough that the other blinks.",
    ],
    related: ["personal-terms", "bid-vs-enquiry", "release-clause"],
  },

  /* ---------- CLUSTER: multi-sport evergreen (SEO EXPANSION 2, 2026-07-28) ----------
     NFL, Formula 1, tennis and golf had no evergreen surface on the site before this batch.
     Season-variable rules are stated as mechanism in `answer`; figures in `depth` are pinned to
     their season and were web-checked on 2026-07-28. */

  {
    slug: "franchise-tag",
    title: "The NFL franchise tag",
    question: "What is the franchise tag in the NFL?",
    answer:
      "The franchise tag lets an NFL team keep one player who would otherwise become a free agent, on a one year contract at a salary tied to the going rate for that position. The player gets a guaranteed and well paid season, the team gets another year to negotiate a longer deal.",
    depth: [
      "There are three versions. The exclusive tag stops the player negotiating with anyone else at all. The non-exclusive tag lets other teams make an offer, which the tagging team can match, and if it chooses not to it receives two first-round draft picks in return. The transition tag gives a right to match but no compensation.",
      "The salary is set by formula rather than by negotiation, based on the top salaries at that position across the league, or a rise on the player's previous pay, whichever is greater. That makes it a good one-year payday and a poor substitute for the guaranteed money in a long contract.",
      "Both sides usually dislike it. The player is a year older with no long-term security and no signing bonus; the team has committed a large block of salary cap space to one player for one season and has only delayed the same decision. It is a way of not deciding, which is why tagged players so often sign an extension before the season starts.",
    ],
    related: ["dead-cap", "nfl-waivers", "compensatory-picks"],
  },
  {
    slug: "nfl-waivers",
    title: "NFL waivers",
    question: "How do NFL waivers work?",
    answer:
      "Waivers are the process by which a released NFL player is offered to every other team before becoming a free agent. Clubs claim in a priority order based on record, worst first, and the highest priority claim wins. Players with enough accrued seasons skip waivers and become free agents immediately.",
    depth: [
      "A claim is not a bid. The claiming team takes on the player's existing contract as it stands, so a team is deciding whether the player is worth the money already written down rather than making an offer of its own. That is why expensive players often clear waivers and cheap young ones do not.",
      "The accrued seasons rule is what separates the two paths. A player who has been in the league long enough, released outside the part of the season where waivers apply to everyone, becomes a free agent straight away and can choose where to sign, which is a considerable advantage over being claimed.",
      "Waivers also explain the annual roster cutdown. When every team trims to its final roster on the same day, hundreds of players hit waivers at once, and the worst teams from the previous season get first look at all of them.",
    ],
    related: ["practice-squad", "franchise-tag", "dead-cap"],
  },
  {
    slug: "practice-squad",
    title: "The NFL practice squad",
    question: "What is an NFL practice squad?",
    answer:
      "The practice squad is a group of players signed by an NFL team who train with the club but are not on its active game-day roster. They can be promoted for individual games a limited number of times before the team must sign them to the main roster outright.",
    depth: [
      "It is a development tier and an insurance policy at once. Teams use it to keep young players inside the building rather than losing them to a rival, and to hold experienced cover at positions where an injury would otherwise leave them short on a Sunday.",
      "For the 2026 season a practice squad holds sixteen players, with an additional place available for an eligible international player. A limited number of veterans can be carried alongside the young players, and a squad member can be elevated to play in a game a set number of times before the club has to sign them properly.",
      "Practice squad players can be signed away by any other team, provided that team puts them on its active roster. That is the safeguard that stops a strong club stockpiling talent it has no intention of ever playing.",
    ],
    related: ["nfl-waivers", "dead-cap", "franchise-tag"],
  },
  {
    slug: "dead-cap",
    title: "Dead cap",
    question: "What is dead cap in the NFL?",
    answer:
      "Dead cap is salary cap space a team spends on players who are no longer on the roster. It happens because signing bonuses are spread across the length of a contract for cap purposes, so releasing or trading a player accelerates the unpaid remainder onto the books at once.",
    depth: [
      "The mechanism is close to amortisation in football accounting. A signing bonus is paid up front but charged against the cap in equal slices across the contract, so cutting a player early leaves the remaining slices with nowhere to go, and they land immediately.",
      "It is the main reason NFL teams keep players they no longer want. If releasing someone costs more cap space than keeping them, the contract has effectively locked the team in, and the decision is financial rather than sporting.",
      "Teams can spread the damage by designating a release after a certain date in the calendar, which splits the charge across two seasons instead of one. That is a delay rather than a saving, and a club that leans on it repeatedly ends up paying a growing share of its cap to players who have gone.",
    ],
    related: ["franchise-tag", "compensatory-picks", "nfl-waivers"],
  },
  {
    slug: "compensatory-picks",
    title: "NFL compensatory draft picks",
    question: "What are compensatory picks in the NFL draft?",
    answer:
      "Compensatory picks are extra draft selections awarded to teams that lost more qualifying free agents than they signed the previous year. They are calculated by a league formula weighing contract value, playing time and honours, and they slot in at the end of rounds three to seven.",
    depth: [
      "The purpose is to soften free agency for the clubs that develop players. A team that loses a starter it drafted and cannot afford to keep gets something back, and a team that spends heavily in free agency gives something up, which slows the drift of talent towards the richest rosters.",
      "The formula is not published in full, which is part of why the awards are argued over each year. What is known is that it compares departures to arrivals, weights them by the size of the contracts and how much the player then played, and only counts free agents who left for market reasons rather than being released.",
      "Clubs plan around it deliberately. A front office that expects to lose two well-paid free agents will sometimes avoid signing an equivalent player from another team, because doing so would cancel out the pick, and will wait until after the qualifying period to shop instead.",
    ],
    related: ["franchise-tag", "dead-cap", "practice-squad"],
  },
  {
    slug: "power-unit-allocation",
    title: "Formula 1 power unit allocation",
    question: "How many engines can a Formula 1 driver use in a season?",
    answer:
      "Each Formula 1 driver gets a fixed allocation of power unit parts for the season, counted separately for the engine, turbocharger, energy store, electrical components and exhaust. Going past the allowance for any one part brings a grid penalty, ten places for the first extra part and five for each one after.",
    depth: [
      "Counting the parts separately is what makes the system complicated to follow. A driver can be comfortably within their allowance on engines and out of them on control electronics, and the penalty applies to the individual component that has run out, not to the power unit as a whole.",
      "For the 2026 season, the first year of the new power unit rules, drivers were allowed four internal combustion engines, four turbochargers, three energy stores, three sets of control electronics, three MGU-K units and four exhaust systems, with one of each treated as a transitional allowance for the new regulations. The limits tighten again from 2027.",
      "Teams therefore plan reliability as a strategic question. Taking a fresh unit deliberately at a circuit where overtaking is easy costs less than taking one where it is impossible, so penalties cluster at particular races rather than falling where the failures happen.",
    ],
    related: ["parc-ferme", "f1-cost-cap", "f1-sprint"],
  },
  {
    slug: "parc-ferme",
    title: "Parc fermé",
    question: "What does parc fermé mean in Formula 1?",
    answer:
      "Parc fermé is the condition a Formula 1 car enters at the start of qualifying, after which teams may not change its setup before the race. Only a short list of permitted jobs is allowed. Breaking it means starting from the pit lane, so a fast qualifying setup has to survive the whole grand prix.",
    depth: [
      "The name comes from the enclosed area cars are held in after a session, but the meaning that matters is the rule rather than the place. From the moment qualifying begins, the car is effectively frozen: wings, suspension settings and ride height are locked, and mechanics may only carry out routine work such as changing tyres and topping up fluids.",
      "Teams cannot, therefore, set the car up for one lap and rebuild it for the race. A car trimmed for a fast qualifying lap has to survive a full grand prix on the same settings, so Saturday's grid position is bought with Sunday's pace.",
      "Breaking parc fermé is sometimes the right call. A team that has misjudged the weather, or wants to change the car after a poor qualifying, can take the pit lane start deliberately and get a free hand on setup in exchange for losing track position.",
    ],
    related: ["power-unit-allocation", "f1-sprint", "undercut-and-overcut"],
  },
  {
    slug: "drs",
    title: "DRS (drag reduction system)",
    question: "What was DRS in Formula 1 and why was it removed?",
    answer:
      "DRS, the drag reduction system, was a movable rear wing flap a driver could open within a second of the car ahead in marked zones, cutting drag to make overtaking easier. It ran from 2011 and was dropped for the 2026 season, replaced by active aerodynamics and an electrical boost.",
    depth: [
      "The system was introduced to fix a specific problem. Cars following closely lost downforce in the turbulent air of the car in front and could not stay near enough to attack, so the rules gave the chasing driver a temporary advantage instead. Critics said it made passing artificial; supporters said the alternative was a procession.",
      "The 2026 regulations removed it. In its place cars run active aerodynamics, with front and rear wings that move automatically between a low-drag setting on the straights and a high-downforce setting in the corners, available to every car rather than only to a driver within a second of another.",
      "The overtaking aid moved to the power unit. A driver close enough behind can deploy extra electrical energy through what the regulations call an override, and the sport markets as an overtake mode, giving a short burst of additional power for the run to the next corner.",
    ],
    related: ["undercut-and-overcut", "f1-sprint", "parc-ferme"],
  },
  {
    slug: "undercut-and-overcut",
    title: "The undercut and the overcut",
    question: "What is an undercut in Formula 1?",
    answer:
      "An undercut is pitting before the car you are chasing, using fresh tyres to set faster laps while the rival is still on old ones, so you emerge ahead when they stop. The overcut is the opposite: staying out longer to build a gap while the rival warms up cold tyres.",
    depth: [
      "The undercut works because a new set of tyres is at its fastest almost immediately, while a worn set is at its slowest. Two or three quick laps while the car ahead is struggling can be worth more than the time lost in the pit lane, and the pass happens on the timing screens rather than on track.",
      "The overcut works when the opposite is true. On circuits or compounds where new tyres take a lap or two to reach temperature, the car that stays out is quick while the car that stopped is slow, and the gap grows in the other direction.",
      "Which one applies changes with the track, the compound and the air temperature, and teams work it out in practice rather than assuming. It is also why a driver stuck behind a slower car will report the gap to the pit wall constantly: the decision to stop is being made a lap at a time.",
    ],
    related: ["drs", "parc-ferme", "f1-sprint"],
  },
  {
    slug: "f1-sprint",
    title: "The Formula 1 sprint",
    question: "How does the Formula 1 sprint weekend work?",
    answer:
      "A sprint weekend replaces one practice session with a separate qualifying session and a short race, run over about 100 kilometres with no compulsory pit stop. Points go to the leading finishers, and the result does not set the grid for the grand prix, which has its own qualifying.",
    depth: [
      "The format compresses the weekend. Teams get a single hour of practice before their setup is effectively locked, then run sprint qualifying to decide the order for Saturday's short race, and separate grand prix qualifying to decide Sunday's grid. Getting the car right on Friday morning matters more than on a normal weekend.",
      "For the 2026 season the sprint ran at six of the twenty-four rounds. Points went to the top eight finishers on a sliding scale from eight down to one, which is enough to matter across a championship without rivalling a grand prix win.",
      "The sprint is a race rather than a rehearsal, and drivers treat it as one, but the risk calculation is different. Damage on Saturday carries into Sunday under limited setup freedom, so a driver leading a championship has far more to lose in a sprint than a driver chasing one.",
    ],
    related: ["parc-ferme", "drs", "power-unit-allocation"],
  },
  {
    slug: "f1-cost-cap",
    title: "The Formula 1 cost cap",
    question: "What is the Formula 1 cost cap?",
    answer:
      "The cost cap is an annual limit on what a Formula 1 team may spend on things that make the car go faster. Driver salaries, the three highest paid staff, marketing and travel sit outside it, and the figure is adjusted for the number of races in the season.",
    depth: [
      "It was brought in to stop the championship being decided by budget alone. Before it, the gap between the largest and smallest teams ran into hundreds of millions, and the order at the front of the grid tracked spending closely enough to make the competition predictable.",
      "For 2026 the base limit was set at 215 million US dollars for a season of twenty-four races or fewer, with an addition for each race beyond that. Capital spending on factories and equipment is handled separately under its own allowance rather than counting against the racing cap.",
      "Enforcement is an audit rather than a scrutineering check, and the penalties range from a reprimand and a fine to restrictions on wind tunnel time and points deductions. The exclusions are the part teams argue over hardest, because deciding what counts as performance spending is where the real negotiation happens.",
    ],
    related: ["power-unit-allocation", "parc-ferme", "drs"],
  },
  {
    slug: "tennis-seeding",
    title: "Tennis seeding",
    question: "How does seeding work in tennis?",
    answer:
      "Seeding places the highest ranked players in a draw so they cannot meet in the early rounds, spreading them across the bracket by rank. Grand Slam singles draws seed 32 players out of 128, which means the top seed and the second seed can only meet in the final.",
    depth: [
      "The purpose is to protect the tournament rather than the player. Without seeding, a random draw could put the two best players in the world in the first round and leave the second week without a contest worth selling, so the draw is structured to hold the strongest players apart for as long as possible.",
      "Seedings normally follow the rankings exactly, and where they have not, it has caused arguments. Wimbledon long used its own formula that weighted recent grass court results, which could move a player several places either way, before dropping it in favour of the standard rankings.",
      "Being seeded is worth more than the ranking alone suggests. A seed cannot draw another seed until the third round, so the difference between being ranked just inside and just outside the cut-off is the difference between two winnable matches and a possible meeting with a top player on day one.",
    ],
    related: ["tennis-qualifying", "protected-ranking", "walkover"],
  },
  {
    slug: "protected-ranking",
    title: "Protected and special rankings in tennis",
    question: "What is a protected ranking in tennis?",
    answer:
      "A protected ranking lets a player who has been out injured for a long spell enter tournaments using their old ranking rather than the one they dropped to. The ATP calls it a protected ranking and the WTA a special ranking. Both limit how many events it can be used for.",
    depth: [
      "Rankings are calculated from results over a rolling period, so a player who misses most of a year loses almost everything they had earned. Without protection, a former top ten player coming back from surgery would have to start in the smallest tournaments, which is a punishing route back for an injury they did not choose.",
      "The rules set a minimum absence before a player qualifies, freeze the ranking at an average of where they stood around the time they stopped, and then cap how many tournaments they may enter on it and over what period. It gets them into main draws; it does not get them seeded.",
      "That last point matters. A returning player entering on a protected ranking is unseeded, so they can draw one of the best players in the world in the first round. Comebacks therefore often look worse on paper than the player's form deserves.",
    ],
    related: ["tennis-seeding", "tennis-qualifying", "walkover"],
  },
  {
    slug: "walkover",
    title: "The walkover",
    question: "What is a walkover in tennis?",
    answer:
      "A walkover is when a player advances because their opponent withdraws before the match starts, through injury, illness or a penalty. It is recorded as a win but not as a match played, so it does not count in head to head records or match statistics.",
    depth: [
      "The distinction from a retirement is the timing. If a player pulls out before the match begins it is a walkover and no result is recorded against them; if they start and cannot finish, it is a retirement, and the completed part of the match counts.",
      "Prize money and ranking points still move. The player who advances collects the points and money for reaching the next round, so a walkover in the early rounds of a large tournament can be worth a great deal to a player outside the top hundred.",
      "For the player receiving one it is a mixed result. An unexpected day off helps a body deep in a tournament, but it also means going into the next round without a competitive match behind them, and players regularly say the rust costs them.",
    ],
    related: ["tennis-qualifying", "tennis-seeding", "protected-ranking"],
  },
  {
    slug: "tennis-qualifying",
    title: "Qualifying and lucky losers in tennis",
    question: "What is a lucky loser in tennis?",
    answer:
      "A lucky loser is a player who lost in the final round of qualifying but gets into the main draw anyway, because someone withdraws after the draw is made. Places go to the highest ranked losers available, sometimes drawn by lot, and they can be called up at very short notice.",
    depth: [
      "Qualifying is a small tournament that runs before the main event, usually over several rounds, with a set number of places in the main draw at the end of it. Winning through is the route in for players ranked outside the direct entry cut-off and for those without a wild card.",
      "Losing the final qualifying round is therefore the worst result in the week, and the lucky loser rule softens it. Players who fall at that stage stay at the venue, keep practising and wait to see whether anyone in the main draw pulls out.",
      "The waiting is the hard part. A lucky loser can be told an hour before a match that they are playing, having already spent a week competing. Beating a seeded player from that position is one of the more impressive things in the sport.",
    ],
    related: ["tennis-seeding", "walkover", "protected-ranking"],
  },
  {
    slug: "golf-handicap",
    title: "The golf handicap",
    question: "How does a golf handicap work?",
    answer:
      "A handicap is a number representing how many strokes above par a golfer usually plays, letting players of different standards compete fairly. Under the World Handicap System it is calculated from the best eight of a player's last twenty rounds, then adjusted for the difficulty of the course being played.",
    depth: [
      "Using the best eight rather than the average is deliberate. A handicap is meant to describe what a player is capable of on a good day rather than what they average, which stops it drifting upwards after a run of poor rounds and makes it harder to manipulate.",
      "The course adjustment is what makes handicaps portable. Two courses of the same par can be very different to play, so each is rated for difficulty, and a player's handicap index is converted into a course handicap for the specific course and tees they are using that day.",
      "The system was unified in 2020, bringing six regional systems used around the world into one, so a handicap earned in one country now travels to another. Professionals do not use handicaps at all: tournament golf is played off scratch, with everyone measured against par.",
    ],
    related: ["cut-line", "fedex-cup", "liv-and-dp-world-tour"],
  },
  {
    slug: "cut-line",
    title: "The cut line",
    question: "What is the cut line in golf?",
    answer:
      "The cut line is the score after two rounds of a four round tournament that decides who plays the weekend. Everyone at or better than it continues; everyone worse goes home, usually without prize money. Each tour and each major sets its own threshold, expressed as a number of players and ties.",
    depth: [
      "It exists for practical reasons. A field of well over a hundred players cannot be got round in a day at a sensible pace, so the field is halved after thirty-six holes and the weekend rounds run in tighter groups, which is also what makes them watchable on television.",
      "The thresholds differ by event. As of the 2026 season the PGA Tour cuts to the top sixty-five players and ties at most tournaments, the Masters to the top fifty and ties, the United States Open to the top sixty and ties, and both the Open Championship and the PGA Championship to the top seventy and ties.",
      "Missing the cut costs more than a weekend. For most players there is no prize money at all, no ranking points, and travel and caddie costs still to pay. The second round of a tournament is often tenser to watch than the fourth.",
    ],
    related: ["fedex-cup", "golf-handicap", "liv-and-dp-world-tour"],
  },
  {
    slug: "fedex-cup",
    title: "The FedEx Cup",
    question: "How do FedEx Cup points work?",
    answer:
      "The FedEx Cup is the PGA Tour's season long points race. Players earn points at every event, with more on offer at the majors and the biggest tournaments, and the leading players qualify for a short playoff series whose field shrinks at each stage before a final event decides the title.",
    depth: [
      "The structure funnels the season into three weeks. The playoff series opens with a field of seventy, cuts to fifty for the second event and to thirty for the Tour Championship, so a player has to keep performing to stay in rather than banking a good summer and coasting.",
      "The finale changed shape recently and is now simpler to follow. The Tour Championship is played as a straight seventy-two hole stroke play tournament with all thirty qualifiers starting level, having previously handicapped the field by giving the points leader a head start in strokes.",
      "Points weightings shifted alongside it for the 2026 season, with the first two playoff events brought into line with the majors and the Players Championship rather than carrying far more than either. The effect is to reward the whole season and make qualifying for the final thirty the hardest part.",
    ],
    related: ["cut-line", "liv-and-dp-world-tour", "ryder-cup-qualification"],
  },
  {
    slug: "liv-and-dp-world-tour",
    title: "LIV Golf and the DP World Tour",
    question: "What is the difference between LIV Golf and the DP World Tour?",
    answer:
      "The DP World Tour is European golf's main circuit, running a season long ranking called the Race to Dubai that sends its leading players to the PGA Tour. LIV Golf is a separate league backed by Saudi investment, built on a fixed roster of contracted players competing in teams as well as individually.",
    depth: [
      "The DP World Tour is the old European Tour under a sponsor's name, renamed in 2021. It runs a conventional schedule of open-entry tournaments with cuts, and its season long ranking is a route onto the PGA Tour for the players who finish highest, which shapes how its members plan a year.",
      "LIV is structured as a league rather than a tour. Players are contracted to one of thirteen four-player teams, with a small number of places kept for wild cards, and there is no cut, so every player in the field plays every round. Individual and team titles are decided across the season.",
      "Its format has moved towards the mainstream. LIV began with fifty-four hole events, the shorter format the roman numerals in its name refer to, and switched to seventy-two holes for the 2026 season as part of a broader alignment with the established tours.",
    ],
    related: ["fedex-cup", "ryder-cup-qualification", "cut-line"],
  },
  {
    slug: "ryder-cup-qualification",
    title: "Ryder Cup qualification",
    question: "How do players qualify for the Ryder Cup?",
    answer:
      "Each Ryder Cup team has twelve players. Some earn their place automatically through a points list built up over roughly two years of tournament results, and the rest are chosen by the captain. Both sides set the exact split and the points formula fresh for every edition.",
    depth: [
      "The two teams have historically run different systems, because they are picked from different tours. Europe has moved towards a single combined points list supported by captain's picks, while the United States has run its own points formula weighted heavily towards majors and the biggest events.",
      "The balance between automatic places and picks has shifted over the years, generally in the direction of more picks. Captains argued that a points list rewards a long stretch of steady results rather than current form, and that pairing matters in a team event in a way rankings cannot capture.",
      "Because the criteria are published fresh each cycle and often close to the qualifying period beginning, the safest thing to say about any particular edition is what has been confirmed for it rather than what applied last time. A player asking how to make the team is really asking about that cycle's published rules.",
    ],
    related: ["liv-and-dp-world-tour", "fedex-cup", "cut-line"],
  },
];
