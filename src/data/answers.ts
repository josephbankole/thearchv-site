// Living answers and living story pages (search plan G7, 2026-11-09).
// One URL per recurring question or running transfer saga, served at /answers/<slug>/.
// A dated desk page keeps its URL and its text; it gains a forward link at the top to every story
// listed here that names its date. Nothing is redirected, merged or removed (plan 1.3, D-2026-08-05e).
// Written by hand or by `archv-site-commit.mjs answer <sport> <entry.json>`, which upserts by slug,
// appends a dated changelog line and sets `updated`. `index` follows G1: "index" needs `demand`.
export interface AnswerFollow {
  lane: string;       // a section base, e.g. "/desk/transfer/"
  dates: string[];    // dated pages in that lane this page collects, newest first
}
export interface AnswerLogLine {
  date: string;       // YYYY-MM-DD, Toronto
  note: string;
}
export interface AnswerEntry {
  slug: string;
  sport: string;      // SPORTS key
  kind: "story" | "answer";
  title: string;
  dek: string;
  seoTitle?: string;
  question?: string;  // kind "answer": the question, verbatim
  answer?: string;    // kind "answer": the current answer, paragraphs split by a blank line
  follows?: AnswerFollow[];
  published: string;  // ISO with zone
  updated: string;    // ISO with zone, the page's dateModified
  index?: "index" | "noindex";
  demand?: string;    // G1 evidence for index: a query and its source
  changelog: AnswerLogLine[];
}

export const answers: AnswerEntry[] = [
  {
    slug: "lewis-hall-manchester-united",
    sport: "football",
    kind: "story",
    title: "Lewis Hall and Manchester United: the whole story",
    dek: "Every Transfer Desk update that named Lewis Hall in its headline or standfirst, newest first. Fifteen pages, from 22 July to 9 September 2026.",
    seoTitle: "Lewis Hall and Manchester United: every update, 2026",
    follows: [{"lane":"/desk/transfer/","dates":["2026-09-09","2026-08-26","2026-08-24","2026-08-17","2026-08-13","2026-08-12","2026-08-11","2026-08-09","2026-08-07","2026-08-06","2026-08-05","2026-08-03","2026-08-01","2026-07-31","2026-07-22"]}],
    published: "2026-11-09T22:09:32-05:00",
    updated: "2026-11-09T22:09:32-05:00",
    index: "noindex",
    changelog: [{"date":"2026-11-09","note":"Page opened. It collects the 15 dated updates already on the site, none of which moved or changed."}],
  },
  {
    slug: "marcus-rashford-transfer",
    sport: "football",
    kind: "story",
    title: "Marcus Rashford's 2026 transfer story",
    dek: "Every Transfer Desk update that named Marcus Rashford in its headline or standfirst, newest first. Fourteen pages, from 11 June to 7 October 2026.",
    seoTitle: "Marcus Rashford transfer: every update, 2026",
    follows: [{"lane":"/desk/transfer/","dates":["2026-10-07","2026-08-25","2026-08-14","2026-08-04","2026-07-30","2026-07-17","2026-06-23","2026-06-22","2026-06-18","2026-06-17","2026-06-15","2026-06-14","2026-06-12","2026-06-11"]}],
    published: "2026-11-09T22:09:32-05:00",
    updated: "2026-11-09T22:09:32-05:00",
    index: "noindex",
    changelog: [{"date":"2026-11-09","note":"Page opened. It collects the 14 dated updates already on the site, none of which moved or changed."}],
  },
  {
    slug: "ederson-manchester-united",
    sport: "football",
    kind: "story",
    title: "Ederson and Manchester United: the whole story",
    dek: "Every Transfer Desk update that named Ederson in its headline or standfirst, newest first. Ten pages, from 22 June to 2 August 2026.",
    seoTitle: "Ederson and Manchester United: every update, 2026",
    follows: [{"lane":"/desk/transfer/","dates":["2026-08-02","2026-07-12","2026-07-11","2026-07-01","2026-06-30","2026-06-27","2026-06-26","2026-06-24","2026-06-23","2026-06-22"]}],
    published: "2026-11-09T22:09:32-05:00",
    updated: "2026-11-09T22:09:32-05:00",
    index: "noindex",
    changelog: [{"date":"2026-11-09","note":"Page opened. It collects the 10 dated updates already on the site, none of which moved or changed."}],
  },
];
