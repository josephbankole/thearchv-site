/* scripts/glossary-data.mjs — the four evergreen glossary entries, read by
   scripts/build-glossary-pages.mjs. Each entry:
     slug     URL segment under /glossary/
     title    the term as it reads as an <h1> (e.g. "xG (expected goals)")
     question the visible question, matching the homepage FAQ question verbatim so the two
              surfaces describe the same entity (index.html's FAQPage acceptedAnswer carries a
              `url` back to this page).
     answer   the extraction target for answer engines: 40-60 words, definition first sentence,
              mechanism second. This exact string is BOTH the visible answer paragraph AND the
              FAQPage/DefinedTerm answer text in the page's JSON-LD, so keep it free of &, <, >
              and " to stay byte-identical across the escaped HTML and the JSON. Its first
              sentence is reused as the page's meta description.
     depth    2-3 short paragraphs of history / why it matters / a concrete pre-2025 example.
   `related` is not stored here; the generator links every OTHER entry so the cross-links can't
   drift out of sync with this list. Facts are checked against pre-2025 football history only. */

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
  },
];
