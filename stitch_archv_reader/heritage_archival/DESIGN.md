---
name: Heritage Archival
colors:
  surface: '#161306'
  surface-dim: '#161306'
  surface-bright: '#3d3929'
  surface-container-lowest: '#110e03'
  surface-container-low: '#1f1c0e'
  surface-container: '#232011'
  surface-container-high: '#2d2a1b'
  surface-container-highest: '#393525'
  on-surface: '#eae2cb'
  on-surface-variant: '#c3c7cd'
  inverse-surface: '#eae2cb'
  inverse-on-surface: '#343021'
  outline: '#8d9197'
  outline-variant: '#43474c'
  surface-tint: '#aecae3'
  primary: '#aecae3'
  on-primary: '#173347'
  primary-container: '#0c2a3e'
  on-primary-container: '#7792aa'
  inverse-primary: '#476177'
  secondary: '#b5c9dd'
  on-secondary: '#1f3242'
  secondary-container: '#384b5c'
  on-secondary-container: '#a7bbcf'
  tertiary: '#ecc166'
  on-tertiary: '#402d00'
  tertiary-container: '#352500'
  on-tertiary-container: '#af8935'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#cbe6ff'
  primary-fixed-dim: '#aecae3'
  on-primary-fixed: '#001e30'
  on-primary-fixed-variant: '#2f495f'
  secondary-fixed: '#d1e5fa'
  secondary-fixed-dim: '#b5c9dd'
  on-secondary-fixed: '#081d2c'
  on-secondary-fixed-variant: '#364959'
  tertiary-fixed: '#ffdea0'
  tertiary-fixed-dim: '#ecc166'
  on-tertiary-fixed: '#261a00'
  on-tertiary-fixed-variant: '#5c4300'
  background: '#161306'
  on-background: '#eae2cb'
  surface-variant: '#393525'
  pitch-green: '#2E6B3A'
  gold-accent: '#C9A14A'
  parchment-text: '#F2EAD3'
typography:
  headline-lg:
    fontFamily: Fraunces
    fontSize: 40px
    fontWeight: '300'
    lineHeight: '1.1'
    letterSpacing: -0.03em
  headline-lg-mobile:
    fontFamily: Fraunces
    fontSize: 32px
    fontWeight: '300'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Fraunces
    fontSize: 24px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter Tight
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0em
  body-md:
    fontFamily: Inter Tight
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: 0em
  eyebrow:
    fontFamily: Inter Tight
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.15em
  label-sm:
    fontFamily: Inter Tight
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 40px
  container-max: 800px
---

## Brand & Style
This design system is built for an archival football history publication, blending the gravitas of a physical library with the speed of a modern iOS application. The aesthetic is **Minimalist-Editorial** with a **Cinematic** edge. It avoids the clutter of traditional news apps, opting for high-contrast typography and intentional negative space to evoke a sense of quiet authority.

The visual narrative is driven by "The Archive" concept—each screen should feel like a curated document or a retrieved file. We employ thin gold hairline rules, subtle film-grain textures to break digital flatness, and corner brackets to frame photography, ensuring the experience feels both premium and historically grounded.

## Colors
The palette is rooted in deep, atmospheric navies to provide a distraction-free reading environment. The primary background (#0C2A3E) provides depth, while the secondary navy (#071C2B) is used for layering surfaces like cards and navigation bars.

The "Warm Cream" (#F2EAD3) is used for all primary body text and UI labels, reducing the eye strain associated with pure white on dark backgrounds. "Accent Gold" (#C9A14A) is reserved for high-value editorial elements, borders, and branding marks. "Pitch Green" (#2E6B3A) serves a functional role, specifically for "DONE" status indicators and successful historical transfer events, grounding the football theme in a literal color reference to the turf.

## Typography
The typography system relies on the contrast between a high-waisted, elegant serif and a technical, condensed sans-serif.

- **Headlines:** Set in Fraunces with light weights. Headlines should always be terminated with a full stop (e.g., "The Invincibles.") to create a definitive, archival tone. Tracking is tight to enhance the "display" quality.
- **Body:** Inter Tight provides a legible, neutral counterpoint to the headlines. It is used for all long-form reading to maintain a modern iOS feel.
- **Eyebrows:** These act as descriptors above headlines. They must be small, uppercase, and wide-tracked to evoke the feeling of stamped archival metadata.

## Layout & Spacing
The layout follows a strict 8pt grid system, but with a fluid container model for long-form content. On mobile, we utilize a 20px side margin to give content "room to breathe," reflecting the luxury of an oversized broadsheet.

Editorial content is centered with a max-width of 800px on larger screens to ensure optimal line lengths for reading. We use "thin gold hairline rules" (0.5pt to 1pt) to separate sections, replacing traditional heavy background blocks. This maintains a light, technical, and organized structure.

## Elevation & Depth
In this system, depth is conveyed through **Tonal Layers** rather than shadows. 
- **Base Level:** Deep Navy (#0C2A3E) for the main background.
- **Raised Level:** Secondary Navy (#071C2B) for cards and persistent UI elements.
- **Overlays:** Semi-transparent layers with a subtle film-grain texture (2-5% opacity) to create a tactile surface.

Instead of shadows, use "Gold Hairline Rules" and "Corner Brackets" to define the edges of elevated components. This creates a "flat-yet-layered" look that feels like physical documents stacked on a dark desk.

## Shapes
The shape language is primarily **Soft (4px - 8px)**. We avoid overly rounded or "bubbly" elements to maintain a serious, sophisticated atmosphere. 

Corner brackets are used on images and "Day Cards" to reinforce the archival framing. These brackets should be 1pt thickness and rendered in Gold (#C9A14A). Date chips and status pills use a slightly higher roundedness (up to 12px) to distinguish them as interactive UI "tokens" within the more rigid editorial grid.

## Components

- **Day Cards:** The primary feed unit. Background color is Secondary Navy (#071C2B). It features a date chip in the top left, a status pill (using Pitch Green for "DONE"), and a Serif headline.
- **Date Chips:** Small, rectangular with subtle rounding. Background is transparent with a Gold hairline border. Text is the "Eyebrow" style.
- **Illustrated Headshots:** Player or manager portraits should be circular, ringed in a 1px Gold border, and treated with a slight desaturation to match the archival aesthetic.
- **Status Pills:** Small labels for transfer status or match results. "DONE" status uses Pitch Green (#2E6B3A) background with Warm Cream text.
- **Bottom Tab Bar:** A minimalist, translucent dark navy bar with thin gold icons. No labels; the iconography must be distinct and high-contrast.
- **Corner Brackets:** A decorative but structural component used on the four corners of featured images or primary cards to "anchor" the content.
- **Input Fields:** Underlined only (no full box), using a Gold hairline rule, with "Parchment" placeholder text in Inter Tight.