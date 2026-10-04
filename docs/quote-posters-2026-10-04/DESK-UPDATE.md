# Archive marketing desk update: the quote posters and the free channels

Prepared 4 October 2026 in a cloud session for the founder. The Mac session the same day applied it
with corrections, after the founder ruled out registered trade marks on the art, and this is the
corrected text. It records what changed for `archv-archive-marketing-desk`. The operative text lives
in the desk spec (`routines-v2/archv-archive-marketing-desk.md`) and in canon under D-2026-10-04a
(decision text in `CANONICAL-CONTEXT.md`, public copy in `CANON-ENTRY.md`); if this file disagrees
with them, they win.
Nothing here changes the desk's cadence or credit rules: it still runs Tuesday and Thursday at about
07:39 ET under D-2026-09-30a (no Workflow runs, no fan-out, one subagent at a time, Sonnet for build
work, Opus only for judgement).

## 1. What the desk sells now

One quote poster is listed: **Good enough, old enough**, a kids' room poster, on Etsy listing
4517424545 (the tote listing, converted in place). Printful prints it (product 436847894)
on the same price ladder as the 21 match posters: 5x7 C$24, 12x16 and 12x18 C$43, 18x24 C$49,
24x36 C$67.50. It joins the 21 match posters and the four digital bundles. The desk reads its link
from `routine/links.json` like any other product and holds a unit on a missing key, an empty url, a
`live_from` after today or a failed check (D-2026-09-15b). The founder owns that file and the desk
never writes it. Format claims come from `_system/product-bible.json`, and the JSON wins over this
file (D-2026-09-24d).

**Five posters are held:** They always score (Barcelona 99), Seagulls, Never second, Glory glory
Man United and The Theatre of Dreams. Each would print a registered trade mark on the art
(`LINEUP.md` has the owners, numbers and classes). The desk never names, shows or links a held
poster on any surface.

**The rule and its reach.** Founder, in session, 4 Oct 2026: "anything that is a registered
trademark, do not use", scoped "Strict on art, name in copy". Nothing registered as a trade mark
goes on quote-poster art. "Manchester United" stays, in full, in listing titles, tags, descriptions,
alt text, pin copy, Pinterest board names and the Pinterest profile name (never a bare "United",
D-2026-07-26b). The rule covers the quote posters. It hasn't been extended to the 21 match posters;
that's an open founder question, and the desk keeps promoting the match posters as before on the
channels it already uses, but doesn't pin them until the founder rules.

**The merch is gone.** The tote's listing now carries the poster. The logo tee, mug, sticker sheet
and the nine finals tees are deactivated, never deleted (logo tee 4517419194, mug 4521104801, sticker sheet 4527674843, and the nine finals tees 4517363626 (Mexico City 1970), 4517368665 (Mexico City 1986), 4517370949 (Rome 1990), 4517372909 (Paris 1998), 4517373649 (Yokohama 2002), 4517374383 (Berlin 2006), 4517376295 (Johannesburg 2010), 4517374819 (Rio de Janeiro 2014), 4517316502 (Lusail 2022); Etsy then read 26 active and 29 inactive). This reverses
D-2026-09-26b's "tees, mug, sticker sheet and tote stay as they are". The desk stops promoting merch
from 4 Oct. No `links.json` key ever pointed at the merch, so there's nothing to empty.

Product units speak to the buyer in the second person, as D-2026-09-24d requires:

| Poster | Audience | Who the unit speaks to |
| --- | --- | --- |
| Good enough, old enough | Kids' room | The parent doing up a young fan's room; the grandparent buying a first Manchester United present |
| The five held posters | None | None; a held poster gets no units |

Copy about the Good Enough line never presents it as anyone's direct quote: its link to Manchester
United's youth policy rests on secondary sources only. A unit carrying a product link names no player
or manager (D-2026-09-15b).

## 2. Pinterest: a new lane, this desk only

**Channel:** Buffer `6ac232426a5c39ccb60ea1c8` (thearchvca, business, America/Toronto). Never
`6a214146c687a22dd45c4747`, the old joey-designs channel, which stays off-limits to every desk.

The founder connected Pinterest to Buffer on 4 Oct 2026 and asked for the free channels nobody was
using to be put to work. D-2026-10-04a makes this desk the sole Pinterest owner. It lifts "never
Pinterest via this engine" (brand-voice-CHEATSHEET.md, hard channel rules, and canon §3's shared
constants) for THIS DESK ONLY.

**Why Pinterest.** It's the one free channel built for this product. People go there to plan a room
("boys football bedroom", "man cave ideas", "gift for dad who has everything") and click out to buy.
A pin keeps sending traffic for months, where an Instagram post is spent in a day.

**The account after 4 Oct.**

- The three old boards (ADHD Tools & Printables, Contractor Business Tools, Small Business
  Templates) are private, not deleted. Their fate is the founder's call.
- Five football boards:

| Board | Buffer board id | Pinterest boardServiceId | First use |
| --- | --- | --- | --- |
| Manchester United Posters | `6ac24c75eb8dfac42a0a1f78` | `1096063696753054975` | every listed poster (match posters once the founder rules) |
| Man Cave Wall Art for Football Fans | `6ac24c75eb8dfac42a0a1f76` | `1096063696753054978` | man-cave posters |
| Football Kids Room Ideas | `6ac24c75eb8dfac42a0a1f75` | `1096063696753054982` | kids'-room posters (Good enough, old enough) |
| Manchester United Gift Ideas | `6ac24c75eb8dfac42a0a1f77` | `1096063696753054988` | gift repins, later runs |
| Football History Prints | `6ac24c75eb8dfac42a0a1f74` | `1096063696753054995` | match posters and bundles, once the founder rules |

- The founder approved the new profile and the Etsy shop claim on 4 Oct. The profile was set; the
  claim couldn't be made, because Pinterest's Link to Pinterest settings no longer list Etsy. The avatar is still the
  retired navy football crest; changing it is the founder's call, and the desk doesn't edit the
  profile.
- Claiming thearchv.ca needs a `p:domain_verify` meta tag in `index.html`. That's a site change for
  the preview branch and the deploy script, done only if the founder asks.
- The first pin is Good Enough: Buffer post 6ac24e35a486988a6e17b985, due Sunday 4 October 2026 at 20:00 ET (2026-10-05T00:00:00Z). The desk's
  spacing and duplicate checks count it like any other post on the channel.

**Pins, every run.**

- **Up to five a run.** A run with nothing that clears the bar logs
  `SKIPPED (bar, D-2026-09-22c)` and doesn't pin to make up a number. Like every lane, Pinterest
  needs a threshold and a judge date under D-2026-09-22c; those come from canon, not from this file.
- **Route.** GraphQL `createPost` through `execute_mutation`, `schedulingType: automatic`,
  `mode: customScheduled` and an explicit ISO `dueAt` carrying the America/Toronto offset.
  D-2026-10-04a sets automatic for this lane by name. Never the named `create_post` tool (it can't
  carry a datetime, DESK-LESSONS 5a), never `addToQueue`, never `shareNow`, never the channel's
  Buffer slots.
- **Spacing (D-2026-09-12c).** At least three hours between any two posts on this channel, `dueAt`
  to `dueAt`; exactly three hours clears. Boards aren't separate channels, so five pins span at least
  twelve hours. Before every queue call, list the channel's scheduled posts and slotted drafts within
  three hours either side of the slot. If anything falls inside, move to three hours after the latest
  blocking post (never earlier), check again, and name the move and the blocking id in the report.
  Overnight is allowed. Re-time only the desk's own pins.
- **Duplicate guard.** Before queueing, check the channel's sent, scheduled and draft posts 14 days
  back, with apostrophes, whitespace and case normalised.
- **Read-back.** `get_post` on every pin after creation: `assets[]` non-empty and `dueAt` inside the
  intended window. A returned id doesn't prove the pin is right. Images go as jpg or png, never webp.
- **Images.** One fresh image per pin: the flat 1000x1500 poster, the framed mockup, and later a
  styled room shot. Never the same image twice on one board. Before it queues, each image is
  read back as an image and passes the metadata strip (`clean_file.py`, then `inspect_file.py`).
- **Title** up to 100 characters, written as a search: "Football Quote Poster for a Kids Room".
- **Description** up to 500 characters: two sentences of plain English with the buyer's words in
  them (gift for dad, boys bedroom, man cave, football fan), "Manchester United" in full where the
  club is named, and the disclaimer "Unofficial fan art. Not affiliated with any club, league or
  federation." No hashtags (D-2026-07-28f, no exception). No player or manager name in the title,
  description or alt text. Never "official", "licensed", "endorsed" or "limited edition". Never a
  mention of AI.
- **Alt text** on every pin.
- **Link.** The listing's Etsy link in its Share & Save form (section 4). Never a pin without a live
  link: open it in Chrome and confirm it lands on the listing, since Etsy answers curl with a 403.
- **Board.** The poster's audience board first (the kids' room board for Good Enough), then the gift
  and posters boards on later runs.
- **Art.** No crest, badge, logo, kit mark or face. Nothing registered as a trade mark on
  quote-poster art. A held poster is never pinned.
- **Backfill.** The 21 match posters and the four bundles go into the history and posters boards
  only after the founder rules on whether the art rule reaches them. Until then the desk pins the
  Good Enough poster alone, inside the same five-a-run ceiling.
- **Gates.** Every title, description, alt text and board description runs humanizer-archv with the
  house voice profile, then ai-writer-detection (phases 2 and 3), then
  `ARCHIVE-PACKS/_system/ip_lint.py --mode storefront --allow 'club_marks=Manchester United'` with the
  allowed name named in the report, then remove-ai-marks Layer A last. Anything edited after the
  strip is stripped again.
- **Liveness.** Pinterest joins archv-metrics-desk's closed Platform list, and the lane enters
  `lanes.tsv` (due Tuesday and Thursday) only once the channel answers a live preflight
  (D-2026-08-04p, D-2026-09-26c).

## 3. Substack Notes through Buffer (channel `6ac2325e6a5c39ccb60ea3bb`)

The founder connected The ARCHV Dispatch to Buffer on 4 Oct. The desk was already allowed to publish
Substack Notes (D-2026-09-12k); it now schedules them through Buffer instead of Chrome, on the same
route as the pins: GraphQL `createPost` via `execute_mutation`, `schedulingType: automatic`,
`mode: customScheduled`, explicit ISO `dueAt`. Never the channel's Buffer slots, never `addToQueue`.
Three hours between any two posts on the channel, the duplicate guard, the read-back, the gates and
the liveness registration all apply as in section 2. This channel carries Notes only: Dispatch
issues stay Substack drafts for the founder to publish (D-2026-09-11f).

On the posters: at most one Note a week telling the story behind a listed poster's line, with the
poster image attached and the Etsy link last. A Note with a product link names no player or manager,
and no Note presents the Good Enough line as anyone's direct quote. The Dispatch subscribe ask stays
the primary call on @thearchvfc.

## 4. Etsy: free levers the desk now pulls

- **Share & Save.** The shop joined on 4 Oct 2026 (founder: "approved for share and save"). Its
  unique link is thearchvca.etsy.com. On eligible orders Etsy takes 6.5% of the order total off the
  shop's Etsy bill until 18 October 2026, then 4%. An order counts when it comes within 30 days of a
  click on the link from off Etsy; the last click decides, and Offsite Ads clicks aren't eligible.
  Every desk link to an Etsy listing uses the Share & Save form, `https://thearchvca.etsy.com/listing/<listing id>` (Etsy redirects it to the listing with `etsrc=sdt`, the shop-domain tracking marker; checked live on 4 Oct), checked in
  Chrome before a unit carries it.
- **Search pass once a month (first Thursday).** Titles lead with what a buyer types; all 13 tags
  used (up to 20 characters each); the room, subject, occasion and holiday attributes filled in; alt text
  on every photo; shop sections matching what's live, with no section for a held poster.
  Names follow D-2026-09-25b's searchable-names rule: team, competition and ground names allowed; no player names
  in listing text; disclaimer on every listing; never mention AI; never touch the AI or creativity
  declaration fields. Listing copy runs the same gates and `ip_lint.py` as the pins.
- **Etsy Stats on Thursdays.** Visits, favourites and orders per listing and traffic by source
  (Etsy search, Pinterest, Instagram, direct). One log row a week. Canon holds no Etsy figure
  before this, so these rows are its first measure of poster performance.
- **Coupons and Etsy Ads stay the founder's call.** Thank-you and abandoned-cart coupons cost margin,
  and Etsy Ads cost money. The desk can propose either; it never switches one on.

## 5. The selling calendar (free, planned ahead)

The desk plans units against these dates and checks each one on the run. Every unit still obeys the
caps and the three-hour spacing.

| Date | What |
| --- | --- |
| 27 Nov 2026 | Black Friday (Cyber Monday 30 Nov). Units from 20 Nov. |
| Early to mid Dec 2026 | Christmas order cut-offs. Read Printful's published holiday shipping dates for CA, US and UK on the run; never guess them. The last "arrives before Christmas" unit goes out two days before the earliest cut-off. |
| 26 May 2027 | Barcelona 99 anniversary, carried by the 1999 match poster (They always score is held). If a unit marks it as Sir Matt Busby's birthday, the desk verifies that on two sources first, and that unit carries no product link. |
| 20 Jun 2027 | Father's Day in Canada, the US and the UK. Units from 1 June. |
| Late Aug 2027 | Back to school: the kids' room poster. |

## 6. Outreach drafts (free, founder sends)

Two pitches a week saved as Gmail DRAFTS, never sent (no auto-send of email, canon §0):

- Manchester United fan sites, blogs and podcasts that run gift round-ups before Christmas and
  Father's Day.
- Parenting, kids'-room and nursery bloggers who publish football bedroom ideas.
- Each pitch: two sentences on who we are, the one listed poster that fits their readers (never a
  held one), a link, and an offer of images. The desk checks that the contact page exists and that
  the site isn't a betting affiliate (no gambling, canon).

## 7. Reddit and Facebook groups stay drafts

Reddit stays drafts only. Before drafting, the desk reads the subreddit's rules on self-promotion and
merchandise and skips any community that bans it. Facebook fan groups are the founder's to post in by
hand; the desk drafts at most one post a fortnight, aimed at groups whose rules allow sellers.

## 8. Instagram and Threads

No new lanes and no change to caps or spacing. In the desk's existing product carousel slot, the Good
Enough poster can lead a kids' room carousel (notification mode, like every @thearchvfc carousel,
D-2026-08-05i), ending on a question the reader can answer. Threads gets the story behind a line,
once a week at most, inside the desk's existing Threads lane. A held poster never appears in either.

## 9. Unchanged

Cadence (Tue and Thu), credit rules, the gate chain, spacing (three hours per channel), caps, the
Dispatch ask as the primary call on @thearchvfc, no hashtags, no AI mention in stores, Reddit drafts
only, the Instagram notification path, Munich and Stockholm sensitivities, and "never spends money".
