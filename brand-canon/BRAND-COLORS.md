# ARCHV brand colors — the pairs (canon D-2026-08-09b, roles reset D-2026-08-14a)

> **ROTATION RESET, 2026-08-14 (D-2026-08-14a, founder).** The `role` field in
> `brand-colors.json` is now the single authority render scripts read. **Pairs 9 (Old
> Trafford Red / Cream `#8B1A1F`/`#F2EAD3`, 7.7:1) and 10 (Archive Navy / Cream
> `#1E223D`/`#F2EAD3`, 12.9:1) are MAIN and lead every rotation. Pairs 4 to 7 rotate
> behind them. Pairs 2, 3 and 8 are RETIRED and never render again.** Pair 1 stays the
> identity anchor. The same decision locked the type system: Archivo Black for claims
> and headlines, Marcellus bold for all numbers and context lines, which supersedes the
> font note in "What does NOT change" below. Craft rules: `DESIGN-PLAYBOOK.md`.

Founder-issued 2026-08-09. Applies to ALL content on ALL accounts and platforms — @thearchvfc,
@thearchv.ai, @thearchv.ca, YouTube, Threads, TikTok, the Dispatch, AND the founder's personal
surfaces (personal LinkedIn, personal carousels). Machine-readable copy for render scripts:
`brand-colors.json` beside this file. The old navy/gold/cream/green palette (#0C2A3E, #C9A14A,
#F2EAD3, #2E6B3A) is legacy for new renders; the circular badge art stays until redesigned.

## The pairs

| # | Name | Dark | Light | Contrast | Text use |
|---|------|------|-------|----------|----------|
| 1 | **Archive Navy / Signal Orange** | `#1E223D` | `#F54F1B` | 4.45:1 | **ANCHOR PAIR.** Display type only (headlines, wordmark). Small text on #1E223D uses ink `#F5F2F3` or `#EFE9E9`; orange is accent, rules, numbers, the CTA block. |
| 2 | Pine / Parchment | `#035352` | `#F3E8BC` | 7.2:1 | Body text passes AAA. |
| 3 | Pitch Black-Green / Matchday Yellow | `#202B22` | `#FFD85F` | 10.7:1 | Body passes AAA. |
| 4 | Atlantic / Ice | `#0F4B70` | `#C4F8FF` | 8.1:1 | Body passes AAA. |
| 5 | Claret / Chalk | `#5A2132` | `#EFE9E9` | 10.3:1 | Body passes AAA. |
| 6 | Midnight / Lilac | `#151130` | `#C8BEFA` | 10.6:1 | Body passes AAA. |
| 7 | Royal / Paper | `#021F94` | `#F5F2F3` | 11.6:1 | Body passes AAA. |
| 8 | Espresso / Lime | `#1F0E06` | `#C6E385` | 13.1:1 | Highest contrast in the set. |
| 9 | **Old Trafford Red / Cream** | `#8B1A1F` | `#F2EAD3` | 7.7:1 | **MAIN** (leads rotation, D-2026-08-14a). Body passes AAA. Trio third: Matchday Yellow `#FFD85F`. |
| 10 | **Archive Navy / Cream** | `#1E223D` | `#F2EAD3` | 12.9:1 | **MAIN** (leads rotation, D-2026-08-14a). Body passes AAA. Trio third: Signal Orange Bright `#FA6A3C`. |

Either color of a pair may be the background; the partner is the type/accent color. Dark-background
is the house default.

**Roles** — the `role` field in `brand-colors.json` is the single authority (D-2026-08-14a): pair **1 = anchor** (identity, does not rotate) · pairs **9 & 10 = main** (lead every rotation) · pairs **4–7 = rotation** (revolve behind the mains) · pairs **2, 3 & 8 = retired** (never render again). The table above lists all ten canonical pairs; roles change only in the JSON.

## Rotation rules (anchor + revolve — founder box answer 2026-08-09)

1. **Pair 1 is the identity and does not rotate.** Wordmark, watermark plate, CTA end-cards/slides,
   channel art, and personal-brand accent color. It CAN also take a normal content-unit turn.
2. **The MAIN and rotation pairs revolve across content units** — read each pair's `role` in
   `brand-colors.json` (the single authority): MAIN pairs 9 & 10 lead, pairs 4–7 rotate behind them,
   and pairs 2, 3 & 8 are RETIRED and never render. A unit (carousel, reel, card set) lives in ONE
   pair; slides within a unit may swap which of the two is the background, plus the neutral inks below.
3. **No pair repeats within a day on one account.** The desks already pull the last 14 days of
   posts for the duplicate guard; log the pair used per unit in the run report or MANIFEST and
   check yesterday's before choosing.
4. **Match the pair to the story where it helps** (claret for a United-heavy nostalgia piece, pine
   for pitch-era archive, midnight/lilac for the AI desk's late-night register) — but never bend a
   kit clash into confusion: if a pair reads as a club's colors on a post about their rival, pick
   another.
5. **Every unit is a TRIO (D-2026-08-14d).** A unit uses its pair's dark as the ground, the pair's
   light as the type, and the pair's OWN registered `third` (see `brand-colors.json`) for ALL numbers,
   reference/source lines, and quoted names/attributions. Every third clears 4.5:1 on its own dark; the
   third never carries claims or body text. **Neutral inks** are still allowed in any pair for small
   text and dimmed lines: `#F5F2F3` (light ink), `#EFE9E9` (soft ink), plus black-alpha overlays for
   grain/scrims. *(This supersedes the earlier "no third hue enters a unit" rule from D-2026-08-09b.)*
6. **Personal surfaces:** the founder's personal LinkedIn carousels and personal-site accents run
   the same system; the existing personal theme (deep navy `#0B111E` + orange `#FF8A3D`) migrates
   to pair 1 values on its next regeneration.
   *Correction, 2026-08-09 audit:* josephbankole.ca itself currently runs the legacy ARCHV
   navy four, not `#0B111E`/`#FF8A3D` (that theme lives in the personal LinkedIn carousel
   lane). The migration target is unchanged: pair 1, and the site rebuild now planned is the
   "next regeneration" this rule names.

## What does NOT change

- Fonts and layout systems are untouched: Anton/Inter (+ scoped Pacifico) on @thearchvfc, the
  Fraunces/Inter Tight match-carousel faces, corner brackets, badge placement, safe-area rules.
- Illustrated-only, faces policy, no-hashtags, CTA canon: all unchanged.
- The Etsy poster line and any already-approved artwork ship as approved; the pairs apply to NEW
  renders from 2026-08-09.

## Wiring points (where the pairs are consumed)

- Standing scripts: `multisport/desk/render_card.py`, `skills/archv-match-of-the-day/render_template.py`
  — read `brand-colors.json`, accept a `--pair N` override, default to rotation rule 3.
- Per-story build scripts the desks generate fresh (build_slides.py pattern): the desk SKILL files
  instruct agents to pull a pair from `brand-colors.json` and log it.
- LinkedIn carousel generator (`~/linkedin-carousel-automation/styles.css`): pair themes
  `data-theme="archv-p1"` … `archv-p8` for both the fifa and personal lanes.
- Live spec docs carry pointer banners to this file: brand-voice-guidelines §10, REEL-ARC,
  STATIC-IMAGE-REEL-SPEC, hero-reel-template-a, match-covers/carousel/BUILD-SPEC.
