/* scripts/glossary-data.mjs — the ten evergreen glossary entries, read by
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
   Facts are checked against pre-2025 football history only. */

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
    related: ["false-9", "inverted-full-back", "xg"],
  },
];
