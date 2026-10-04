# Archive marketing desk update: the quote posters and the free channels

Prepared 4 October 2026 in a cloud session for the founder. Applied on the Mac by the one-time
routine in `MAC-ROUTINE.md`, which edits `routines-v2/archv-archive-marketing-desk.md`, the desk's
`SKILL.md` and `CANONICAL-CONTEXT.md` (decision text in `CANON-ENTRY.md`). Nothing here changes the
desk's cadence or credit rules: it still runs Tuesday and Thursday at about 07:39 ET under
D-2026-09-30a (no Workflow runs, no fan-out, one subagent at a time, Sonnet for build work, Opus only
for judgement).

## 1. What the desk now sells

The typographic quote posters in `LINEUP.md` join the 21 match posters and the four digital bundles.
They replace the ARCHV logo tee, the tote, the mug, the sticker sheet and the finals tees, whose Etsy
listings are converted in place to the new posters (founder, 4 Oct: "replace my archv merch and the
final t shirts with the new posters"). The desk stops promoting merch from the day the conversion is
logged. Per-listing keys go into `routine/links.json` as `quote_<slug>` with `live_from` set to the
conversion date, so the desk's existing link checks hold any unit whose listing isn't live.

Every quote poster has a named audience. Product units speak to that person in the second person, as
D-2026-09-24d already requires:

| Poster | Audience | Who the unit speaks to |
| --- | --- | --- |
| They always score (Barcelona 99) | Man cave | The fan who still talks about that night: a dad, a partner, a mate with a birthday coming |
| Seagulls | Man cave | The fan who knows the line by heart |
| Never second | Man cave | The fan who measures every season against it; a dad or a grandad |
| Good enough, old enough | Kids' room | The parent decorating a young fan's room; the grandparent buying a first Manchester United present |
| Glory glory Man United | Kids' room | The young fan who already knows the words, and their parents |
| The Theatre of Dreams | Kids' room | Only once the trade mark check clears; until then the desk never names or shows it |

## 2. Pinterest: a new lane (Buffer channel `6ac232426a5c39ccb60ea1c8`)

The founder connected Pinterest to Buffer on 4 Oct 2026 and asked for it to be used. This lifts the
"never Pinterest via this engine" line (brand-voice-CHEATSHEET.md, hard channel rules) for THIS DESK
ONLY. No other desk posts to Pinterest.

**Why Pinterest first.** It's the one free channel built for this product. People go there to plan
a room ("boys football bedroom", "man cave ideas", "gift for dad who has everything") and click out to
buy. A pin keeps sending traffic for months, where an Instagram post is spent in a day.

**The account today is off-brand.** Its three boards are "ADHD Tools & Printables", "Contractor
Business Tools" and "Small Business Templates". The one-time Mac routine repositions it (Chrome, since
Buffer can't create boards or edit a profile):

- Make the three old boards SECRET. Never delete them; the founder decides their fate.
- Profile name: `The ARCHV | Manchester United Posters`. Bio: `Football history, set in type.
  Manchester United quote posters and match prints for the man cave and the kids' room. Unofficial fan
  art, printed to order.` Website: thearchv.ca.
- Claim the Etsy shop in Pinterest settings (free; Etsy pins then carry the shop's attribution).
  Claiming thearchv.ca needs a `p:domain_verify` meta tag in `index.html`; that's a site change for
  the preview branch and deploy script, done only if the founder wants it.
- Create five boards, each with a plain keyword description and no hashtags:
  1. Manchester United Posters
  2. Man Cave Wall Art for Football Fans
  3. Football Kids Room Ideas
  4. Manchester United Gift Ideas
  5. Football History Prints
- Re-read the channel in Buffer (`get_channel`) so the new boards appear, and record the five board
  ids in the desk spec.

**Pins, every run.** Five pins per run (ten a week), scheduled with `create_post` to the channel's
Buffer slots or an explicit `dueAt`, `schedulingType: automatic`. Pinterest takes pins without a
human in between, so read each one back with `get_post`. Rules:

- One fresh image per pin. Rotate the flat 1000x1500 poster, the framed mockup, and later a styled room
  shot. Never the same image twice on one board.
- Title up to 100 characters, written as a search: "Manchester United Quote Poster for a Kids Room".
- Description up to 500 characters, two sentences of plain English with the buyer's words in them
  (gift for dad, boys bedroom, man cave, football fan). No hashtags (D-2026-08-14 rule, no exception).
- Alt text on every pin.
- Link: the listing's Etsy Share & Save link (section 4), otherwise the listing URL from
  `links.json`. Never a pin without a live link.
- Board: the poster's audience board first (man cave or kids' room), then repins to the gift and
  posters boards on later runs.
- Same art rules as every product surface: no crest, badge, kit or face, never "official",
  "licensed" or "limited edition", disclaimer in the description.
- Backfill the 21 match posters and four bundles into Football History Prints and Manchester United
  Posters at the same five-a-run pace once the quote posters are all pinned.

## 3. Substack Notes through Buffer (channel `6ac2325e6a5c39ccb60ea3bb`)

The founder connected The ARCHV Dispatch to Buffer on 4 Oct. The desk was already allowed to publish
Substack Notes (D-2026-09-12k); it now schedules them through Buffer instead of Chrome. Use the channel's
own Buffer slots. On the quote posters: one Note a week telling the story behind one quote, the poster
image attached, the Etsy link last. The Dispatch subscribe ask stays primary on @thearchvfc and isn't
moved by this.

## 4. Etsy: free levers the desk now pulls

- **Search pass once a month (first Thursday).** Titles lead with what a buyer types; all 13 tags used
  (20 characters each); the room, subject, occasion and holiday attributes filled in; alt text on every
  photo; the shop sections `Quote Posters`, `For the Kids' Room`, `Match Posters` and `Bundles`.
  Searchable-names rule as D-2026-09-25b: team, competition and ground names allowed; no player names in
  listing text; disclaimer on every listing; never mention AI; never touch the AI or creativity
  declaration fields.
- **Share & Save.** Etsy credits back part of its fees on sales from links the seller shares through
  Share & Save. The one-time routine collects a Share & Save link for every listing into
  `links.json` (`share_<key>`), and every desk link to Etsy uses it from then on.
- **Etsy Stats on Thursdays.** Visits, favourites and orders per listing and traffic by source
  (Etsy search, Pinterest, Instagram, direct). One log row a week. This is the first time poster
  performance is measured at all: there's no Etsy figure anywhere in canon today.
- **Coupons and Etsy Ads stay the founder's call.** Thank-you and abandoned-cart coupons cost margin,
  and Etsy Ads cost money. The desk proposes, never switches either on.

## 5. The selling calendar (free, planned ahead)

The desk plans units against these dates and checks each one on the run:

| Date | What |
| --- | --- |
| 27 Nov 2026 | Black Friday (Cyber Monday 30 Nov). Units from 20 Nov. |
| Early to mid Dec 2026 | Christmas order cut-offs. Read Printful's published holiday shipping dates for CA, US and UK on the run; never guess them. The last "arrives before Christmas" unit goes out two days before the earliest cut-off. |
| 26 May 2027 | Barcelona 99 anniversary, and the date the desk should check as Sir Matt Busby's birthday (verify on two sources before any unit says so). |
| 20 Jun 2027 | Father's Day in Canada, the US and the UK. Units from 1 June. |
| Late Aug 2027 | Back to school: kids' room posters. |

## 6. Outreach drafts (free, founder sends)

Two pitches a week saved as Gmail DRAFTS, never sent (no auto-send of email, canon §0):

- Manchester United fan sites, blogs and podcasts that run gift round-ups before Christmas and Father's Day.
- Parenting, kids'-room and nursery bloggers who publish football bedroom ideas.
- Each pitch: two sentences on who we are, the one poster that fits their readers, a link, and an
  offer of images. The desk checks that the contact page exists and that the site isn't a betting
  affiliate (no gambling, canon).

## 7. Reddit and Facebook groups stay drafts

Reddit stays drafts only. Before drafting, the desk reads the subreddit's rules on self-promotion and
merchandise and skips any community that bans it. Facebook fan groups are the founder's to post in by
hand; the desk drafts at most one post a fortnight, aimed at groups whose rules allow sellers.

## 8. Instagram and Threads

No new lanes and no change to caps or spacing. In the desk's existing product carousel slot, rotate in
the quote posters, one carousel per audience: the man cave set and the kids' room set, each ending on a
question the reader can pick a side on ("Which one goes on your wall?"). Threads gets the story behind a
quote, once a week at most, inside the existing one-thread-a-day lane.

## 9. What isn't changing

Cadence (Tue and Thu), credit rules, the gate chain, spacing (3 hours per channel), caps, the Dispatch
ask as the primary call on @thearchvfc, no hashtags, no AI mention in stores, Munich and Stockholm
sensitivities, and "never spends money".
