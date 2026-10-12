// The Manchester United posters on Etsy: the twenty-one printed posters with the redrawn art
// (4 Oct 2026; p4-03 on 12 Oct without a quote), the men's eleven and Manchester United Women's ten,
// each group in match-date order.
// This file feeds the app only: scripts/build-feed.mjs turns `posters` into /feed/posters.json
// (restoring the `host` key older app builds still require) and writes /posters/<slug>.webp from
// each `image`. The homepage tiles in index.html are static markup and do not read this file.
// The four Etsy bundles are never listed here or tiled on the homepage: they still deliver the old
// art and were deactivated on 12 Oct 2026.
// A slug is the stem of the poster's image files and a stable id in the app, so it never changes
// and never reuses one of the retired archive-plate slugs (the app caches art by slug). `title`
// paraphrases the poster's own top two lines (place and year, then what the match meant) and is
// not always the printed wording: p3-09 says Goal of the Season, not the award its art prints, on
// purpose, as its Etsy copy does. `stamp` is the match date, and `moment` is one sentence drawn
// from the listing description. No player is named anywhere below. etsyUrl is the listing's
// Share & Save link (https://thearchvca.etsy.com/listing/<id>, D-2026-10-04b).
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

// The ARCHV shop on Etsy.
export const storeUrl = 'https://thearchvca.etsy.com';

export const posterPacks: PosterPack[] = [
  { slug: "united-men", name: "Manchester United: the men", summary: "From the 1968 European Cup final at Wembley to the 5-4 win over Lyon at Old Trafford in April 2025." },
  { slug: "united-women", name: "Manchester United Women", summary: "From the restarted team's first competitive match, at Birkenhead in August 2018, to the 2-1 win over Paris Saint-Germain at Old Trafford in November 2025." },
];

export const posters: Poster[] = [
  { slug: "united-london-1968", pack: "united-men", no: 1, title: "London 68, First English Champions of Europe", year: "1968", city: "London", stamp: "29.05.1968", moment: "Manchester United beat Benfica 4-1 after extra time at Wembley on 29 May 1968 and became the first English club to win the European Cup.", image: "/posters/united-men/united-london-1968.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521788550" },
  { slug: "united-rotterdam-1991", pack: "united-men", no: 2, title: "Rotterdam 91, First European Trophy Since 68", year: "1991", city: "Rotterdam", stamp: "15.05.1991", moment: "In their first season back in European competition, Manchester United beat Barcelona 2-1 in the Cup Winners' Cup final at De Kuip for the club's first European trophy since 1968.", image: "/posters/united-men/united-rotterdam-1991.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521790986" },
  { slug: "united-manchester-1993", pack: "united-men", no: 3, title: "Manchester 93, Champions After 26 Years", year: "1993", city: "Manchester", stamp: "10.04.1993", moment: "Manchester United were 1-0 down to Sheffield Wednesday at Old Trafford until the 86th minute and won 2-1 with a header six minutes into added time, on the way to their first title since 1967.", image: "/posters/united-men/united-manchester-1993.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521795943" },
  { slug: "united-london-1996", pack: "united-men", no: 4, title: "London 96, The Double Double", year: "1996", city: "London", stamp: "11.05.1996", moment: "A half-volley in the last five minutes beat Liverpool 1-0 in the FA Cup final at Wembley and made Manchester United the first English club to win the double twice.", image: "/posters/united-men/united-london-1996.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521795838" },
  { slug: "united-birmingham-1999", pack: "united-men", no: 5, title: "Birmingham 99, Kept the Treble Alive", year: "1999", city: "Birmingham", stamp: "14.04.1999", moment: "Down to 10 men, Manchester United saved a penalty in the last minute of normal time and beat Arsenal 2-1 after extra time in the FA Cup semi-final replay at Villa Park.", image: "/posters/united-men/united-birmingham-1999.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521798833" },
  { slug: "united-barcelona-1999", pack: "united-men", no: 6, title: "Barcelona 99, Treble Winners", year: "1999", city: "Barcelona", stamp: "26.05.1999", moment: "Bayern Munich led 1-0 at the Camp Nou when the 90 minutes ran out, and Manchester United scored twice in added time, both from corners, to complete the treble.", image: "/posters/united-men/united-barcelona-1999.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521782964" },
  { slug: "united-moscow-2008", pack: "united-men", no: 7, title: "Moscow 08, Third-Time Champions of Europe", year: "2008", city: "Moscow", stamp: "21.05.2008", moment: "Manchester United drew 1-1 with Chelsea in pouring rain at the Luzhniki Stadium and won the Champions League final 6-5 on penalties, champions of Europe for the third time.", image: "/posters/united-men/united-moscow-2008.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521779161" },
  { slug: "united-manchester-2011", pack: "united-men", no: 8, title: "Manchester 11, Goal of the 20 Seasons", year: "2011", city: "Manchester", stamp: "12.02.2011", moment: "Manchester United's 78th-minute overhead kick beat Manchester City 2-1 at Old Trafford and was later voted the best goal of the Premier League's first 20 seasons in a supporters' poll.", image: "/posters/united-men/united-manchester-2011.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4527296455" },
  { slug: "united-stockholm-2017", pack: "united-men", no: 9, title: "Stockholm 17, The Full Set", year: "2017", city: "Stockholm", stamp: "24.05.2017", moment: "Manchester United, in their blue away kit, beat Ajax 2-0 in the Europa League final in Solna and completed their set of the three major European club trophies.", image: "/posters/united-men/united-stockholm-2017.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521787127" },
  // p3-09: the title names Goal of the Season on purpose, not the award printed on the art (see header).
  { slug: "united-merseyside-2023", pack: "united-men", no: 10, title: "Merseyside 23, Goal of the Season", year: "2023", city: "Merseyside", stamp: "26.11.2023", moment: "The opener in Manchester United's 3-0 win at Goodison Park was an overhead kick in the third minute, later the Premier League's Goal of the Season for 2023-24.", image: "/posters/united-men/united-merseyside-2023.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521778670" },
  { slug: "united-manchester-2025-lyon", pack: "united-men", no: 11, title: "Manchester 25, From 4-2 Down", year: "2025", city: "Manchester", stamp: "17.04.2025", moment: "Manchester United were 4-2 down to Lyon in extra time at Old Trafford and won 5-4 with three goals from the 114th minute, the last a header in the 121st.", image: "/posters/united-men/united-manchester-2025-lyon.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4521798166" },
  { slug: "united-women-birkenhead-2018", pack: "united-women", no: 1, title: "Birkenhead 18, Back After 13 Years", year: "2018", city: "Birkenhead", stamp: "19.08.2018", moment: "Manchester United Women's first competitive match, 13 years after the original side was wound up in 2005, ended in a 1-0 win over Liverpool at Prenton Park.", image: "/posters/united-women/united-women-birkenhead-2018.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539752764" },
  { slug: "united-women-sutton-coldfield-2018", pack: "united-women", no: 2, title: "Sutton Coldfield 18, First League Game", year: "2018", city: "Sutton Coldfield", stamp: "09.09.2018", moment: "Manchester United Women led 6-0 at half-time and won 12-0 at Aston Villa in their first league match.", image: "/posters/united-women/united-women-sutton-coldfield-2018.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539751302" },
  { slug: "united-women-leigh-2019", pack: "united-women", no: 3, title: "Leigh 19, Promoted in Year One", year: "2019", city: "Leigh", stamp: "17.04.2019", moment: "Manchester United Women beat Aston Villa 5-0 at Leigh Sports Village on 17 April 2019 and sealed promotion to the Women's Super League in their first season, with three games to spare.", image: "/posters/united-women/united-women-leigh-2019.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539732851" },
  { slug: "united-women-manchester-2019", pack: "united-women", no: 4, title: "Manchester 19, First Top-Flight Derby", year: "2019", city: "Manchester", stamp: "07.09.2019", moment: "A crowd of 31,213, then a league record, watched Manchester United Women's first top-flight match, a 1-0 defeat by Manchester City in the first Women's Super League Manchester derby.", image: "/posters/united-women/united-women-manchester-2019.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539731211" },
  { slug: "united-women-manchester-2022", pack: "united-women", no: 5, title: "Manchester 22, Club Record Crowd", year: "2022", city: "Manchester", stamp: "27.03.2022", moment: "Manchester United Women beat Everton 3-1 in their first match in front of fans at Old Trafford, and the crowd of 20,241 was a club record at the time.", image: "/posters/united-women/united-women-manchester-2022.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4539743978" },
  { slug: "united-women-london-2023", pack: "united-women", no: 6, title: "London 23, First Major Final", year: "2023", city: "London", stamp: "14.05.2023", moment: "Manchester United Women lost 1-0 to Chelsea in their first Women's FA Cup final, in front of 77,390 at Wembley, then a world record for a women's domestic club match.", image: "/posters/united-women/united-women-london-2023.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4517396908" },
  { slug: "united-women-leigh-2024", pack: "united-women", no: 7, title: "Leigh 24, First Win Over Chelsea", year: "2024", city: "Leigh", stamp: "14.04.2024", moment: "Chelsea were the holders and had never lost to Manchester United Women until the 2-1 Women's FA Cup semi-final at Leigh Sports Village.", image: "/posters/united-women/united-women-leigh-2024.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4517398702" },
  { slug: "united-women-london-2024", pack: "united-women", no: 8, title: "London 24, First Major Trophy", year: "2024", city: "London", stamp: "12.05.2024", moment: "A year after losing the final at Wembley, Manchester United Women went back and beat Tottenham Hotspur 4-0 in the Women's FA Cup final for their first major trophy, with 76,082 watching.", image: "/posters/united-women/united-women-london-2024.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4527673755" },
  { slug: "united-women-leigh-2025", pack: "united-women", no: 9, title: "Leigh 25, Main Draw for the First Time", year: "2025", city: "Leigh", stamp: "18.09.2025", moment: "Manchester United Women beat SK Brann 3-0 at Leigh Sports Village, 3-1 on aggregate, and reached the Women's Champions League main draw for the first time.", image: "/posters/united-women/united-women-leigh-2025.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4517399720" },
  { slug: "united-women-manchester-2025", pack: "united-women", no: 10, title: "Manchester 25, Three From Three", year: "2025", city: "Manchester", stamp: "12.11.2025", moment: "Manchester United Women's first European match at Old Trafford was a 2-1 win over Paris Saint-Germain, their third win from three in the Women's Champions League league phase.", image: "/posters/united-women/united-women-manchester-2025.webp", etsyUrl: "https://thearchvca.etsy.com/listing/4527680418" },
];
