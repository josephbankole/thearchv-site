# REEL-ARC: the binding format for every new reel build

Founder ruling, 2026-08-05, carried in canon section 0 as **D-2026-08-05g**. His words:

> there needs to be a payoff at the end. in the beginning we ask a question or im walking towards a
> stadium for a game, we start with motion and or intrigue, then we slowly give more information,
> reveal more of the stadium or the game or tell the story, till we finally get to the payoff, the
> answer to the question or the shot of the stadium/goal.

That is an OPEN LOOP: intrigue at the top, escalating reveals through the middle, an answer at the
end. This file is the format spec. `CANONICAL-CONTEXT.md` wins on any conflict.

**Extended the same evening by two further founder directions, both carried in canon as
D-2026-08-05h.** Faces: a reel that names a player or a coach carries that person's banked portrait,
which is the FACES section below. Footage: real archive material is permitted when it is genuinely
free, which is source mode (c) and the register at `fifa.archv/archive-footage-register.md`.

## Scope, stated first because it decides whether you read the rest

**Binding on every NEW reel build, from 2026-08-05.** Any composition authored after that date, in
either source mode below, is built to this arc.

**The 39-file rebuilt library is grandfathered and is NOT rebuilt.** Those files were re-rendered on
4 August against D-2026-08-04c, QC'd frame by frame, and the 16 eligible rows in
`tiktok-reuse-winners.md` are the daily reel slot's supply. They stay valid for reruns exactly as
they are. Rebuilding a working library to a new format would cost four days of renders and buy the
audience nothing, and the daily slot would go dark while it happened. New builds carry the change;
reruns carry on.

**The first native example already exists.** `remotion-ep1/src/BiggestVsBestShort.tsx`, built
5 August for the weekly founder-voice reel, is arc-shaped without having been asked to be: it opens
on an oversized claim, cuts dead on "that is not what matters", releases one receipt card at a time,
and lands on the end card. Read it before authoring a new one. It predates the scaffold and stages
itself through `ShortStage`, which is why it is an example and not a template.

## The beat grammar

### OPEN, roughly 0 to 2.5 seconds

Motion from the first frame, plus **one** piece of intrigue. Three shapes qualify and nothing else
does:

1. **A question.** "How do you win a European final with a third of the ball?"
2. **A partial reveal.** A number with no subject, a scoreline with no year, a bar filling towards a
   figure the frame withholds.
3. **Founder footage approaching something.** Walking towards the ground, the concourse, the tunnel
   end of a stand.

**The frame-1 thumbnail rule is unchanged and this is compatible with it.** D-2026-08-04c requires
frame 1 to be opaque and legible, because on Reels and TikTok frame 1 is the thumbnail and the
scroll-stop. Nothing here relaxes that. What changes is what the legible thing SAYS: the question is
the hook, so frame 1 states the question at full opacity and withholds the answer, rather than
stating the claim. A hook that leads with a claim is still correct for a carousel (D-2026-07-27d);
a reel asks.

**A blank open is a defect, and an open that fades up slowly is the same defect.** The scaffold
rejects both: an open beat over 2.5 seconds fails the build, and a first frame carrying no opaque
copy inside the open beat fails the render.

### BUILD, the middle

Information released in beats of **2 to 4 seconds**, each adding **exactly one** piece, each
escalating visually towards the payoff: closer, bigger, warmer, more of the thing revealed.

**The answer never leaks.** Test every beat with one question: could the video end here and still
feel finished? If yes, that beat is carrying the payoff and the build is broken. Move the material
down or cut it.

**Why the beats are ordered this way, so future writers do not have to guess.** A viewer who has the
answer has no reason to stay, and the platforms measure whether they stayed. The open opens a loop
and every build beat has to keep it open while paying something out, because a loop that pays nothing
reads as stalling and gets scrolled. So each beat hands over one piece the viewer did not have,
which is enough to feel like progress, and holds the piece that would close the loop, which is what
keeps them there. The visual escalation carries the same job in the picture: if the frame is not
getting closer or brighter or fuller, the viewer's eye reads the video as finished before the copy
does. Four to six build beats is the working range. Fewer and the open loop snaps shut early; more
and the beats stop escalating because there is nowhere left to escalate to.

### PAYOFF, the final 2 to 5 seconds

The answer to the question, the goal, the full reveal. **The strongest single visual in the piece**,
and it is held long enough to land: about 2 seconds is the floor and 5 is the ceiling. One payoff
per reel, and the scaffold enforces that number literally.

**THE BEAT IS FIXED. THE FORM OF THE PAYOFF IS NOT (added 2026-08-09, voice audit 2026-08-09,
D-2026-08-09a).** As written until today, the payoff was defined only as the answer returning to the
opening question, which is one closer shape, the callback, mandated on every reel. It shipped a
library where the last beat resolved the same way every time. **The structure is unchanged: open loop,
build, ONE payoff, outro slot, BrandFrame. What rotates is HOW the payoff lands**, pulled from the six
sanctioned closer types in the CLOSERS section of
`~/Claude/personal-brand/archv-house-voice-profile.md`:

1. **Cold fact.** The number or the result, no gloss, held on screen.
2. **Callback.** The return to the opening image or question. Still valid, no longer automatic.
3. **Reversal.** The earned X-versus-Y turn. **Capped at one in five reels, and never two days
   running on one channel.**
4. **Forward line.** What happens next: the fixture, the date, the hearing.
5. **Question fork.** The debate handed to the viewer, shape varied per the desk's question rules.
6. **Hard stop.** The reel ends where the story ends, even mid-beat. Anticlimax as verdict.

**Never the same payoff type two builds running on one channel**, and **the type used is logged in the
run report and the ledger row** like any other closer (`closer:<type>`). A payoff still has to be the
strongest visual in the piece and still has to answer the loop the open opened; what it may not be is
the same shape every week. Reruns from the reuse register are grandfathered and are not re-cut.

### OUTRO SLOT, about 1 second

Reserved, and empty on purpose. A recurring ending is Creator Code Session 1's open item and the
founder has chosen to wait until a line feels right (`CREATOR-CODE-SESSION-1.md`, row "Recurring
intro, ending or catchphrase"; the three candidates offered on 5 August were declined for now). The
slot exists now so that choosing a line later is a prop rather than a re-timing: the second is
already inside every arc reel's length, its registration and its QC. Until then the slot holds the
wordmark and no line.

Then the standard **BrandFrame** close, unchanged: gold corner brackets, the destination handle,
`thearchv.ca`. Every arc reel carries it, per D-2026-08-04r.

## The three source modes

### (a) ILLUSTRATED, the existing kit

The 39-file library's mode and the default. Everything drawn in SVG or set in type inside the
composition, banked illustrated likeness where a face is needed, `player-headshot-bank.md` first,
never a face invented from text. Palette navy `#0C2A3E`, gold `#C9A14A`, cream `#F2EAD3`.

> **PALETTE POINTER, 2026-08-09 (D-2026-08-09b).** Those three hexes are now the LEGACY palette. The
> brand runs on eight colour pairs, and **a new reel pulls its pair from
> `/Users/josephbankole/Claude/fifa.archv/brand-colors.json` at render time like every other unit**
> (rules for humans in `fifa.archv/BRAND-COLORS.md`): pairs render by their `role` field per
> D-2026-08-14a (mains 9 and 10 lead, 4 to 7 rotate, 2, 3 and 8 retired), **pair 1, navy `#1E223D`
> with orange `#F54F1B`, is reserved for identity**, which on a reel means the BrandFrame and the
> outro wordmark, no pair repeats within a day on one account, and the pair used is logged per unit
> in the run report. Pair 1 is display-size only at 4.45:1, so small type over `#1E223D` takes
> `#F5F2F3` or `#EFE9E9`. This is a pointer, not a rewrite: the legacy hexes stay printed above
> because the 39-file reuse library and the existing kit are built on them and are NOT re-coloured.
> If the composition hardcodes the legacy palette with no way to pass a pair, render as it stands and
> report that the reel kit needs a code change, naming the file.

See the
FACES section below, which now governs when a portrait is required and how it enters the frame, in
this mode and in the other two.

### (b) FOUNDER FOOTAGE, new on 2026-08-05

**The founder's own phone clips.** Walking to a ground, matchday arrival, the queue, the concourse,
the walk up to the stand. They are licence-clean by definition, which is why this mode needs no
register and no provenance record: the person who shot it is the person publishing it.

**Live play on the pitch stays out of THIS mode.** A stadium exterior and a concourse are fine. A
frame showing the ball in play at a modern fixture is not, filmed by the founder or not, because
broadcast and stadium rules govern that footage whoever pointed the phone. If a clip drifts onto the
pitch while the ball is in play, cut before it does or do not use the clip. Archive material showing
play is a different question and it is answered by mode (c) and its register, not here.

**Face optional**, per the 4 August founder-VO ruling. The faceless standard holds for everything
else.

**The house grade applies to footage exactly as it applies to a card.** Navy and gold type over the
picture, BrandFrame on top, captions burned in. Footage is a backdrop the arc runs over; it is never
a reason to drop the frame furniture or the type discipline.

### Intake for founder footage

Clips are dropped at:

```
fifa.archv/footage-inbox/<slug>/
```

with a `note.md` alongside them saying what it is, where, and the date. Any desk or session building
from a clip **reads the note and verifies it. It never guesses the fixture.** A stadium exterior on
its own tells you nothing about which match it was, and a wrong fixture on screen is a false
statement of fact, which does not ship. If the note is missing or thin, the clip waits.

See `footage-inbox/README.md` for the drop format.

### (c) ARCHIVE, new on 2026-08-05

**Real archive footage, drawn ONLY from `fifa.archv/archive-footage-register.md`.** Sanctioned by
D-2026-08-05h. A clip is usable in a reel when it has a row in that register, and a row exists only
when every column is filled: subject, description, source URL, hosting archive, the exact licence,
how that licence was verified and on what date, the local path, resolution and duration, the Content
ID note and the used-in field. There is no second route. A clip found this morning and loved is not
in ARCHIVE mode until it is in the register, and a clip whose licence could not be positively
verified is treated as unlicensed no matter how old it looks.

**NC, ND AND SHARE-ALIKE ARE ALL OUT, and BY-SA is out by a founder ruling of 2026-08-05, not by
judgement on the day.** We are a commercial brand, every build cuts, grades and overlays, and a
copyleft argument about whether the whole reel became a BY-SA work is not one to start after
publishing. Only public domain and plain CC-BY enter the usable set. The register keeps verified
copyleft clips in a HELD block as a record of work done; that block is not a source. Do not re-raise
the question per clip.

**House-graded, exactly like everything else.** Navy and gold type over the picture, BrandFrame on
top, captions burned in. Archive footage is a backdrop the arc runs over. It is never a reason to
drop the frame furniture or relax the type discipline, and it is never the hero image on its own:
the register's material is standard definition, mostly 4:3 at 25 frames a second, so it is used
letterboxed or punched in behind sharp type, not blown full-bleed into a 1080x1920 frame where it
just looks broken.

**Every ARCHIVE build NAMES ITS ILLUSTRATED FALLBACK in the build.** Author the beat so the archive
shot can be swapped for the illustrated or typographic treatment of the same beat without re-timing
anything, and write the fallback down where the build can find it. Platforms auto-claim public-domain
material wrongly and routinely, and the register row is the dispute evidence rather than a
guarantee against the claim. With a named fallback, a claimed clip costs one render. Without one, it
costs a publishing slot, which is the outcome the whole arrangement exists to avoid.

**Strip the audio on ingest.** The narration and the music bed on a newsreel are separate rights
objects with their own fingerprints, entirely independent of whether the picture is clear. Instagram
takes the silent cut anyway.

**The unlicensed-footage ban is untouched and is now the sharper half of the rule.** Broadcast
footage, agency footage, a rip of somebody's YouTube upload, a full match sitting on a public archive
with no licence field: all still banned, on every surface, in every lane. What changed is that
"footage" stopped being the disqualifier and "unlicensed" became it.

## FACES: a reel that names a person shows that person

**Any reel or video whose story names a player or a coach carries that person's banked illustrated
portrait, where one exists.** This is the second half of the 5 August founder direction, alongside
the arc itself: the reels are more interesting to watch when there is a face in them. A story about
Thierry Henry with no Thierry Henry in it is a caption with a soundtrack.

**Era-correct, per the bank's own era rule.** A 1999 story does not wear a 2026 face. The bank has
carried this since 2026-08-02 and it is the rule that broke twice before it was written down: a
reference photograph does not carry its own date into the output, so a 2009 reference produced a
present-day portrait, and a card about Arsenal-era Henry was nearly built on a photograph of him
coaching. Where the bank holds several portraits of the same person, take the one banked FOR the era
the story is about. Where it holds one and the era is wrong, the story ships faceless and flags it.
Two portraits that look identical are one portrait, and the era device stops working silently.

**The route into the composition is the existing kit, not a new mechanism.** `SubjectDisc` in
`remotion-ep1/src/shortsKit.tsx` is the sanctioned placement: the banked likeness in a gold-ringed
disc, with `appear`, `hold`, `size` and `top` props, fading and scaling on its own local frame count
so it drops into a beat without disturbing the beat's timing. It is already how `MillaShort`,
`MaradonaShort`, `ZidaneShort`, `Pele1958Short`, `BanksSave1970Short`, `MessiDebut47Short`,
`RonaldinhoShort`, `RonaldinhoNeverHappenedShort` and `RejectedXiPogbaShort` carry their subjects.
The asset lives at `remotion-ep1/public/headshots/<slug>.webp` and is referenced through
`staticFile()`. Inside an `ArcStage` build, a portrait is a composition element inside a beat's
`render`, which means it obeys the arc rather than interrupting it: a face may open a beat, escalate
across the build, or land on the payoff, but it never sits over the whole piece as wallpaper.
`BiggestVsBestShort` is the arc example and carries no face by design, because its subject is an
argument rather than a person. That is the correct call for that unit and not a precedent for units
that do name someone.

**A story whose subject has NO banked face ships faceless, and the run report FLAGS the missing
face with the era needed.** Not "add a headshot for Ferenc Puskás". The flag reads: subject, the era
the story needs, and the surface it was wanted for, so the founder can supply one reference
photograph and the next build has it. A missing face is never a reason to hold a unit, and it is
never a reason to invent one.

**D90 is absolute and none of this bends it.**

- **No face from text.** A likeness is generated from a real reference photograph or it is not
  generated. The text-only route is what produced a portrait of the wrong man and left it live in the
  bank for six weeks.
- **Never regenerate a banked face.** Reuse first, always. The bank is the first read.
- **Illustrated only.** Navy ground, gold rim light, cream accent, soft grain, plain unbranded
  collar. No photoreal, no photography, no broadcast frame grab.
- **Kit and sponsor marks stripped.** No crest, no badge, no sponsor, no FIFA mark, no text of any
  kind in the portrait. Club badges are permitted on social cards under D-2026-07-24f; they are not
  permitted inside a portrait.

## Sound

Arc reels are built **VO-first or music-first, per unit**, and which one is a decision made when the
unit is designed rather than a house default. VO-first means the beats are cut to a measured read.
Music-first means the beats are cut to the picture and the bed goes under afterwards.

**The VO is SYNTH, or there is no VO (founder ruling, D-2026-08-07b, 2026-08-07).** The two
sanctioned choices are the house synth process — Higgsfield `text2speech_v2`, minimax, voice
"Alistair", the same speed and pacing as the Mourinho documentary — or a silent cut the founder
scores with music at the last mile. **No unit ever waits on a founder recording**; the founder audio
queue is closed and `AUDIO-QUEUE.md` records why. `BiggestVsBestShort` takes its beats array from
whichever measured read it is built against, synth or none — the scaffold does not care which, only
that the beat timings are real. A script bound for synth VO clears the humanizer and
`ai-writer-detection` first, and any restriction-sensitive wording is settled before generation.

Distribution rules do not move:

- **Instagram takes the SILENT base cut**, always. The founder adds music in the app. Confirm silence
  with `volumedetect` rather than trusting the filename; mean volume near -91 dB.
- **TikTok takes the `_music` cut.**

## The scaffold

`remotion-ep1/src/arcStage.tsx`. Use `ArcStage` in place of a bare `ShortStage` on any new build. It
wraps `ShortStage` rather than repeating it, so the handle context, the 30-frame lead-in and the
autofit sweep stay one implementation shared with the whole library. Registered compositions are
untouched.

A beat is `{ role, frames, id, render }` with `role` one of `open`, `build`, `payoff`, `outro`, and
`frames` in OUTPUT frames. `planArc` throws `ArcStructureError` at build time on any of:

| Check | Why it is in the renderer rather than in a checklist |
|---|---|
| the OPEN is first, and there is exactly one | it owns frame 1, the thumbnail and the scroll-stop |
| the open declares `opensWith` | an open nobody can state in one line is a title card |
| the open's declared fade fits inside the lead-in | a longer fade ships a ghosted thumbnail |
| open at most 75 frames | a slow open is the defect this ruling exists to kill |
| at least one BUILD | an open cut straight to a payoff is a claim, not an arc |
| each build 60 to 120 frames | one piece per beat, at a pace a viewer can take |
| **exactly one PAYOFF** | a reel with none is the format being replaced |
| nothing after the payoff except the outro | anything after the answer is released to a viewer who has gone |
| the OUTRO slot exists, and is APPENDED when the author omits it | so it cannot be forgotten |

Plus one render-time check: on output frame 0 the open beat's own subtree must carry opaque copy, or
the render fails. It is scoped to the open beat deliberately, because the brand chrome carries
permanently opaque text and a document-wide check would pass on a blank file.

`arcDuration(beats)` gives the composition length including the appended outro, so registration
cannot fall out of step with the arc.

## The packaging checklist, which lives here now

Tom's Session 1 note that **every video answers what happened, why should I care, and who is
involved** is an arc requirement, not a caption requirement, so it sits in this file and
`CREATOR-CODE-SESSION-1.md` points at it. Distributed across the arc:

- **What happened** is the payoff. It is the answer, and it arrives last.
- **Why should I care** is the open. The question is the reason to stay, and a question nobody
  would ask is a reel nobody finishes.
- **Who is involved** is the build. Names, clubs and dates are released one beat at a time, full
  entity names throughout, never "United" or "City".

A reel that cannot answer all three is not short of a caption. It is short of an arc.

## What does not change

Everything else. Two-source verification, the provider pin on any Opta figure, the illustrated
likeness rule, full club names on artwork, the humanizer with the house voice followed by the
`ai-writer-detection` pass, no hashtags, no em dashes, British English, the two-unit Instagram cap
and the four-hour stagger, the reel taking one of those two slots, and the four-new-builds-a-week
cadence matched to the YouTube slots. This ruling changes the SHAPE of a new reel. It changes
nothing about what may go in one or where it goes afterwards.
