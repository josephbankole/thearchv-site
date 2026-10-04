# Canon entry (D-2026-10-04a)

The Mac session of 4 October 2026 applied this to `CANONICAL-CONTEXT.md` with corrections; this is the corrected text.

The dated block sits in §0 under its own `### RATIFIED 2026-10-04` heading, newest first, above the
2 October block. The same edit updates the matching §0 lines and stamps older lines in place, never
deleting them (the §0 digest rule):

- the Buffer channel table gains Pinterest `6ac232426a5c39ccb60ea1c8` and Substack
  `6ac2325e6a5c39ccb60ea3bb`, owner `archv-archive-marketing-desk` only;
- the channel-count prose stops calling seven channels a limit: with TikTok, Pinterest and Substack
  the org has ten, and Essentials bills per channel;
- the handles line gains the Pinterest handle, @thearchvca;
- D-2026-09-26b's "tees, mug, sticker sheet and tote stay as they are" is stamped REVERSED 2026-10-04
  by D-2026-10-04a;
- the 26 Sep "set inside quotation marks" line is stamped as narrowed for the quote posters by
  D-2026-10-04a;
- §3's "NEVER personal LinkedIn / Pinterest / YouTube via the engine" and the cheatsheet's matching
  hard channel rule both name the archive marketing desk as the one Pinterest exception.

The block lists the files changed with their `.bak-2026-10-04a` backups.

---

### RATIFIED 2026-10-04 (founder, in a cloud session; applied and narrowed on the Mac)

**D-2026-10-04a (founder, 4 Oct 2026, in a cloud session, then in session on the Mac): ONE QUOTE
POSTER REPLACES THE MERCH, NOTHING REGISTERED AS A TRADE MARK GOES ON QUOTE-POSTER ART, AND THE
ARCHIVE MARKETING DESK TAKES PINTEREST AND SUBSTACK NOTES THROUGH BUFFER.** Founder wording in the
cloud session: "decide based on research which posters are worth making, identify the target
audience for each ... create the posters, update my daily marketing desk so its aware of the new
posters. replace my archv merch and the final t shirts with the new posters"; "skip the bloody hell
one"; "keep archivo black and marcellus and THE ARCHV wordmark at the foot"; "remove the quote marks
from the posters"; "use contractions, it's not it is"; "i would like to use those unused channels,
especially if they are free, the marketing desk should be updated to fill those gaps"; "pinterest and
substack are both now added to buffer". Then on the Mac, in session: "anything that is a registered
trademark, do not use"; asked how far that reaches, "Strict on art, name in copy"; on Seagulls he
chose "LONDON" for the top line and then "Hold Seagulls"; and "approved for share and save".

- **Products.** Six typographic Manchester United quote posters, rendered by
  `thearchv-site/scripts/quote-posters/render.py` from `lineup.json` (research and outcome:
  `docs/quote-posters-2026-10-04/LINEUP.md` on main). ONE is listed: Good enough, old enough (kids'
  room), Etsy listing 4517424545 (the tote listing, converted in place), Printful product
  436847894, on the match-poster price ladder (5x7 C$24, 12x16 and 12x18 C$43, 18x24
  C$49, 24x36 C$67.50). Its art reads MANCHESTER at the top with no context line. FIVE are HELD,
  because each would print a registered mark: They always score and Never second (MANCHESTER UNITED
  inside the quote; Manchester United Football Club Limited, UK00900761312, class 16), Seagulls
  (SEAGULLS; The Brighton and Hove Albion Football Club Limited, UK00002584437, class 16), Glory glory
  Man United (Manchester United Football Club Limited, UK00002011324, class 16) and The Theatre of
  Dreams (Manchester United Football Club Limited, UK00902201879, classes 16, 21, 24 and 28). A full
  render skips any poster with a `hold` in `lineup.json`; `--only` still draws one, for the record.
  No surface names, shows or links a held poster.
- **The trade mark rule.** Nothing registered as a trade mark is printed on quote-poster art.
  "Manchester United" stays, in full, in listing titles, tags, descriptions, alt text, pin copy,
  Pinterest board names and the Pinterest profile name. Scope: the quote posters. It is NOT extended
  to the 21 live match posters; whether it should be is an OPEN founder question, and no desk acts on
  it either way.
- **The merch goes.** The founder approved converting the tote listing 4517424545 in place to the
  Good Enough poster (route: the tote listing, converted in place). The logo tee, mug, sticker sheet and the nine
  finals tees are deactivated, never deleted: logo tee 4517419194, mug 4521104801, sticker sheet 4527674843, and the nine finals tees 4517363626 (Mexico City 1970), 4517368665 (Mexico City 1986), 4517370949 (Rome 1990), 4517372909 (Paris 1998), 4517373649 (Yokohama 2002), 4517374383 (Berlin 2006), 4517376295 (Johannesburg 2010), 4517374819 (Rio de Janeiro 2014), 4517316502 (Lusail 2022); Etsy then read 26 active and 29 inactive. This REVERSES D-2026-09-26b's "tees,
  mug, sticker sheet and tote stay as they are". The app storefront feed
  (`scripts/storefront-items.json`) lists the one poster.
- **Art rules for the quote posters.** Archivo Black, Marcellus at 700 for numerals and context
  lines, the narrow zero, THE ARCHV. wordmark at the foot (D-2026-08-14a, the 27 Sep zero ruling). NO
  quotation marks, which narrows the 26 Sep "set inside quotation marks" rule for the quote posters
  only; the 21 match posters keep it. No attribution on the art. Contractions on the art and in all
  copy, and copy never claims a poster is a transcript; the two-source check runs on the original
  wording. "Football. Bloody hell." is out, which answers for that line the profanity question
  D-2026-09-25b left with the founder. No crest, badge, logo, kit mark or face.
- **Facts.** Two sources for every fact on the art and in listing copy (§0 Verification). The Good
  Enough line's link to Manchester United's youth policy rests on secondary sources only, so copy
  never presents it as anyone's direct quote.
- **Pinterest (Buffer `6ac232426a5c39ccb60ea1c8`, @thearchvca, business, America/Toronto, connected
  4 Oct).** `archv-archive-marketing-desk` is its SOLE owner. No other desk posts to Pinterest, and
  the old joey-designs channel `6a214146c687a22dd45c4747` stays off-limits to every desk. This lifts
  §3's "NEVER ... Pinterest ... via the engine" and the cheatsheet's matching line for this desk
  alone. Pins are `schedulingType: automatic`, set here by name, on GraphQL `createPost` via
  `execute_mutation` with `mode: customScheduled` and an explicit ISO `dueAt`: never the named
  `create_post`, never `addToQueue` or `shareNow`, never the channel's Buffer slots. Up to five a run,
  at least three hours apart `dueAt` to `dueAt` (D-2026-09-12c; boards are not separate channels),
  the 14-day duplicate guard, and a read-back with `assets[]` non-empty and `dueAt` in the window.
  The three old boards are private, not deleted; five football boards were created (ids in the desk
  spec); the first pin is 6ac24e35a486988a6e17b985, due Sunday 4 October 2026 at 20:00 ET (2026-10-05T00:00:00Z). The avatar is still the
  retired navy football crest, and changing it is the founder's call.
- **Substack Notes through Buffer (`6ac2325e6a5c39ccb60ea3bb`, connected 4 Oct).** D-2026-09-12k's
  Notes permission now runs through Buffer, on the same route and spacing as the pins,
  `schedulingType: automatic`. Dispatch issues stay Substack drafts for the founder (D-2026-09-11f).
- **Etsy Share & Save.** The shop joined on 4 Oct 2026; its unique link is thearchvca.etsy.com. On
  eligible orders Etsy takes 6.5% of the order total off the shop's Etsy bill until 18 October 2026,
  then 4%. An order counts when it comes within 30 days of an off-Etsy click on the link; the last
  click decides, and Offsite Ads clicks aren't eligible. Desk links to Etsy listings use the Share &
  Save form, `https://thearchvca.etsy.com/listing/<listing id>` (Etsy redirects it to the listing with `etsrc=sdt`, the shop-domain tracking marker; checked live on 4 Oct), each confirmed in Chrome to land on the listing.
- **Etsy, free levers.** A monthly search pass (first Thursday), Etsy Stats logged every Thursday
  (the first poster performance measure in canon), and a selling calendar (Black Friday 27 Nov 2026,
  Printful's Christmas cut-offs read on the run, Father's Day 20 Jun 2027). Coupons and Etsy Ads stay
  the founder's call.
- **Outreach.** Two gift-guide or fan-site pitches a week as Gmail drafts; the founder sends.
- **Gates.** Every pin, Note, listing text, alt text and board description runs humanizer-archv with
  the house voice, then ai-writer-detection, then `ip_lint.py --mode storefront` with
  `--allow 'club_marks=Manchester United'` named in the report, then remove-ai-marks last. Every
  image gets the metadata strip and is read back as an image before it queues. A unit with a product
  link names no player or manager (D-2026-09-15b).
- **Lanes.** Pinterest and Substack Notes join archv-metrics-desk's closed Platform list and enter
  `lanes.tsv` (Tuesday and Thursday) only after a live preflight. D-2026-09-22c's bar applies: a run
  with nothing that clears it logs `SKIPPED (bar, D-2026-09-22c)` rather than filling a slot.
- **Unchanged.** Cadence (Tue and Thu, D-2026-09-30a), the credit rules, gates, spacing, caps, the
  Dispatch ask as the primary call on @thearchvfc, no hashtags, no AI mention in stores, Reddit drafts
  only, never spends money.

---

§0 digest line:

- **Quote posters and free channels (D-2026-10-04a).** One typographic quote poster, Good enough,
  old enough, replaces the merch and finals tees on Etsy; five are held because each would print a
  registered trade mark. Nothing registered as a trade mark goes on quote-poster art ("Strict on art,
  name in copy"); whether that reaches the 21 match posters is an open founder question. Contractions
  throughout, and no quotation marks or attribution on the art. The archive marketing desk alone pins
  to Pinterest (Buffer 6ac232426a5c39ccb60ea1c8, automatic, `createPost` with `customScheduled` and an
  explicit `dueAt`, three hours apart), schedules Substack Notes through Buffer
  (6ac2325e6a5c39ccb60ea3bb), links to Etsy through Share & Save, logs Etsy Stats on Thursdays and
  drafts outreach for the founder to send.
