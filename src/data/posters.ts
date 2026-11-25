// The Manchester United posters still on sale, for the app's poster feed: the four final posters
// redrawn with the skyline art and sold on https://shop.thearchv.ca, and the five Manchester United
// Women posters still listed on Etsy, each group in match-date order. Fourteen Etsy listings were
// deactivated on 25 Nov 2026 (twelve match posters and the two quote posters); their posters left
// this file and the site the same day, so nothing here points at a dead listing.
// This file feeds the app only: scripts/build-feed.mjs turns `posters` into /feed/posters.json
// (restoring the `host` key older app builds still require) and writes /posters/<slug>.webp from
// each `image`. The website's /posters/ page reads scripts/data/poster-tiles.json instead.
// The four Etsy bundles are never listed here: they still deliver the old art and were deactivated
// on 12 Oct 2026.
// A slug is the stem of the poster's image files and a stable id in the app, so it never changes
// and never reuses one of the retired archive-plate slugs (the app caches art by slug). `title`
// paraphrases the poster's own top two lines (place and year, then what the match meant) and is
// not always the printed wording. `stamp` is the match date, and `moment` is one sentence drawn
// from the listing description. No player is named in the data below, but that is a rule for this
// file only, not a description of the posters: the printed art names players on its goal timeline
// and prints rival club names (BAYERN MUNICH, CHELSEA among them) (audit 2026-11-15, gap4-5).
// Whether the match posters fall under the quote posters' art rule is an open founder question
// (CLAUDE.md, the quote posters section). `etsyUrl` keeps its name because the app decodes it (no
// app build reads it today): it holds the poster's purchase link, the product page on
// shop.thearchv.ca for the four final posters and the Etsy Share & Save link
// (https://thearchvca.etsy.com/listing/<id>, D-2026-10-04b) for the women's posters.
export interface PosterPack {
  slug: string;
  name: string;
  summary: string;
}

export interface Poster {
  slug: string;
  pack: string; // PosterPack.slug
  no: number;
  title: string;
  year: string;
  city: string;
  stamp: string; // match date, DD.MM.YYYY
  moment: string;
  image: string; // 1080x1350 webp under public/posters/<pack>/
  etsyUrl: string;
}

// The ARCHV shop on Etsy, where the Manchester United Women posters are still listed.
export const storeUrl = 'https://thearchvca.etsy.com';

export const posterPacks: PosterPack[] = [
  { slug: "united-men", name: "Manchester United: the men", summary: "From the 1968 European Cup final at Wembley to the 2008 Champions League final in Moscow." },
  { slug: "united-women", name: "Manchester United Women", summary: "From the restarted team's first competitive match, at Birkenhead in August 2018, to the club-record crowd at Old Trafford in March 2022." },
];

export const posters: Poster[] = [
  { slug: "united-london-1968", pack: "united-men", no: 1, title: "London 68, First English Champions of Europe", year: "1968", city: "London", stamp: "29.05.1968", moment: "Manchester United beat Benfica 4-1 after extra time at Wembley on 29 May 1968 and became the first English club to win the European Cup.", image: "/posters/united-men/united-london-1968.webp", etsyUrl: "https://shop.thearchv.ca/products/london-1968-european-final-poster" },
  { slug: "united-london-1996", pack: "united-men", no: 2, title: "London 96, The Double Double", year: "1996", city: "London", stamp: "11.05.1996", moment: "A half-volley in the last five minutes beat Liverpool 1-0 in the FA Cup final at Wembley and made Manchester United the first English club to win the double twice.", image: "/posters/united-men/united-london-1996.webp", etsyUrl: "https://shop.thearchv.ca/products/london-1996-cup-final-poster" },
  { slug: "united-barcelona-1999", pack: "united-men", no: 3, title: "Barcelona 99, Treble Winners", year: "1999", city: "Barcelona", stamp: "26.05.1999", moment: "Bayern Munich led 1-0 at the Camp Nou when the 90 minutes ran out, and Manchester United scored twice in added time, both from corners, to complete the treble.", image: "/posters/united-men/united-barcelona-1999.webp", etsyUrl: "https://shop.thearchv.ca/products/barcelona-1999-european-final-poster" },
  { slug: "united-moscow-2008", pack: "united-men", no: 4, title: "Moscow 08, Third-Time Champions of Europe", year: "2008", city: "Moscow", stamp: "21.05.2008", moment: "Manchester United drew 1-1 with Chelsea in pouring rain at the Luzhniki Stadium and won the Champions League final 6-5 on penalties, champions of Europe for the third time.", image: "/posters/united-men/united-moscow-2008.webp", etsyUrl: "https://shop.thearchv.ca/products/moscow-2008-european-final-poster" },
  { slug: "united-women-birkenhead-2018", pack: "united-women", no: 1, title: "Birkenhead 18, Back After 13 Years", year: "2018", city: "Birkenhead", stamp: "19.08.2018", moment: "Manchester United Women's first competitive match, 13 years after the original side was wound up in 2005, ended in a 1-0 win over Liverpool at Prenton Park.", image: "/posters/united-women/united-women-birkenhead-2018.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539752764" },
  { slug: "united-women-sutton-coldfield-2018", pack: "united-women", no: 2, title: "Sutton Coldfield 18, First League Game", year: "2018", city: "Sutton Coldfield", stamp: "09.09.2018", moment: "Manchester United Women led 6-0 at half-time and won 12-0 at Aston Villa in their first league match.", image: "/posters/united-women/united-women-sutton-coldfield-2018.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539751302" },
  { slug: "united-women-leigh-2019", pack: "united-women", no: 3, title: "Leigh 19, Promoted in Year One", year: "2019", city: "Leigh", stamp: "17.04.2019", moment: "Manchester United Women beat Aston Villa 5-0 at Leigh Sports Village on 17 April 2019 and sealed promotion to the Women's Super League in their first season, with three games to spare.", image: "/posters/united-women/united-women-leigh-2019.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539732851" },
  { slug: "united-women-manchester-2019", pack: "united-women", no: 4, title: "Manchester 19, First Top-Flight Derby", year: "2019", city: "Manchester", stamp: "07.09.2019", moment: "A crowd of 31,213, then a league record, watched Manchester United Women's first top-flight match, a 1-0 defeat by Manchester City in the first Women's Super League Manchester derby.", image: "/posters/united-women/united-women-manchester-2019.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539731211" },
  { slug: "united-women-manchester-2022", pack: "united-women", no: 5, title: "Manchester 22, Club Record Crowd", year: "2022", city: "Manchester", stamp: "27.03.2022", moment: "Manchester United Women beat Everton 3-1 in their first match in front of fans at Old Trafford, and the crowd of 20,241 was a club record at the time.", image: "/posters/united-women/united-women-manchester-2022.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539743978" },
];
