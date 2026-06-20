---
name: The ARCHV
colors:
  surface: '#001524'
  surface-dim: '#001524'
  surface-bright: '#203c50'
  surface-container-lowest: '#00101c'
  surface-container-low: '#001e30'
  surface-container: '#022235'
  surface-container-high: '#0f2c40'
  surface-container-highest: '#1c374c'
  on-surface: '#cbe6ff'
  on-surface-variant: '#cbc6bb'
  inverse-surface: '#cbe6ff'
  inverse-on-surface: '#173347'
  outline: '#959086'
  outline-variant: '#49473e'
  surface-tint: '#cdc6b0'
  primary: '#ffffff'
  on-primary: '#343021'
  primary-container: '#eae2cb'
  on-primary-container: '#696452'
  inverse-primary: '#635e4c'
  secondary: '#ecc166'
  on-secondary: '#402d00'
  secondary-container: '#765700'
  on-secondary-container: '#fbcf73'
  tertiary: '#ffffff'
  on-tertiary: '#003914'
  tertiary-container: '#b0f2b4'
  on-tertiary-container: '#34713f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eae2cb'
  primary-fixed-dim: '#cdc6b0'
  on-primary-fixed: '#1f1c0e'
  on-primary-fixed-variant: '#4b4736'
  secondary-fixed: '#ffdea0'
  secondary-fixed-dim: '#ecc166'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5c4300'
  tertiary-fixed: '#b0f2b4'
  tertiary-fixed-dim: '#95d69a'
  on-tertiary-fixed: '#002108'
  on-tertiary-fixed-variant: '#115224'
  background: '#001524'
  on-background: '#cbe6ff'
  surface-variant: '#1c374c'
typography:
  headline-lg:
    fontFamily: Fraunces
    fontSize: 42px
    fontWeight: '300'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Fraunces
    fontSize: 32px
    fontWeight: '300'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Fraunces
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter Tight
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter Tight
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  label-caps:
    fontFamily: Inter Tight
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
  label-md:
    fontFamily: Inter Tight
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0em
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 20px
  stack-sm: 8px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style
The design system for this product is an "Archival Premium" aesthetic, blending the prestige of historical football journalism with contemporary digital sophistication. It evokes the feeling of a high-end, limited-edition sports anthology.

The design style is a hybrid of **Minimalism** and **Tactile Luxury**. It prioritizes heavy whitespace (rendered in deep navy), precise typography, and subtle physical metaphors like film grain and hairline rules. The emotional response is one of authority, nostalgia, and exclusivity.

**Key Stylistic Rules:**
- **Film Grain:** A subtle, low-opacity monochromatic grain overlay should be applied to the base background layers to prevent digital "flatness."
- **Corner Brackets:** Use 8px L-shaped gold hairline brackets to frame featured imagery or specific data points.
- **Punctuation:** All headlines must terminate with a period. Use British English spelling (e.g., "Colour," "Defence"). 
- **Prohibitions:** Do not use em-dashes; use colons or line breaks for separation. Avoid vibrant gradients; depth is achieved through tonal layering.

## Colors
The palette is rooted in a "Midnight Stadium" atmosphere. The primary interaction and text color is a warm cream, providing a softer, more historical feel than pure white.

- **Background (Base):** #0C2A3E (Deep Navy) — used for the main canvas.
- **Background (Layered):** #071C2B (Rich Navy) — used for inset cards, headers, or tertiary containers to create depth.
- **Primary Text:** #F2EAD3 (Cream) — the default for all readable content.
- **Accents:** #C9A14A (Gold) — used sparingly for periods at the end of headlines, corner brackets, and active navigation states.
- **Semantic:** #2E6B3A (Pitch Green) — reserved strictly for "DONE" or "CONFIRMED" transfer status labels and success states.

## Typography
The typographic pairing creates a tension between the classic (Fraunces) and the modern (Inter Tight).

- **Headlines:** Use Fraunces with Soft Max settings (high-contrast). Headlines should be set with tight leading and negative letter spacing. Every headline must end in a Gold (#C9A14A) period.
- **Body & UI:** Inter Tight provides a condensed, technical feel that balances the expressive nature of the serif. Use `label-caps` for section headers and metadata.
- **Mobile Adjustments:** On iOS, `headline-lg` should drop to 34px to ensure line breaks remain punchy and avoid orphaned words.

## Layout & Spacing
This design system utilizes a **Fluid Grid** for iOS, specifically tailored for narrow viewports.

- **Base Unit:** A 4px baseline grid governs all vertical rhythm.
- **Margins:** Standard horizontal margins are 20px to allow for "breathability" against the deep navy background.
- **Section Dividers:** Use 0.5pt Gold (#C9A14A) or Cream (#F2EAD3) hairline rules at 20% opacity to separate content blocks.
- **Content Stacking:** Headlines and body text should be tightly grouped (8px), while distinct content modules should be separated by larger gaps (48px) to emphasize the archival, editorial layout.

## Elevation & Depth
Depth in this design system is achieved through **Tonal Layering** and **Subtle Outlines** rather than traditional shadows.

- **Surface Tiers:** The base background is #0C2A3E. Secondary containers (cards, drawers) use #071C2B.
- **Hairline Borders:** Instead of shadows, use 0.5px borders in #F2EAD3 (at 10% opacity) to define the edges of UI elements.
- **Interactive States:** Use a gold hairline border (100% opacity) to indicate focused or active elements. 
- **Z-Index:** Modals and high-level alerts should utilize a 20px backdrop blur (iOS background material) to maintain the filmic quality of the UI.

## Shapes
The design system employs **Sharp (0)** roundedness. All containers, buttons, and image frames must have 0px corner radii to reinforce the architectural and newspaper-inspired aesthetic. 

Small exceptions are made for system-level iOS components (like toggles) where required, but all custom elements must remain strictly rectangular.

## Components

- **Buttons:** Primary buttons are #F2EAD3 with #0C2A3E text, 0px radius, and all-caps Inter Tight labels. Secondary buttons are transparent with a 1px gold hairline border.
- **Transfer Labels:** Small, rectangular badges for "DONE" deals. Background: #2E6B3A, Text: #F2EAD3, Font: `label-caps`.
- **Cards:** Background: #071C2B. Use corner brackets in Gold at the top-left and bottom-right of the card to frame the content.
- **Input Fields:** Bottom-border only (1px Cream at 30% opacity). Active state moves the border to 1px Gold.
- **Lists:** Separated by 0.5px Cream hairline rules. Tapping a list item triggers a brief Gold highlight on the period at the end of the label.
- **Corner Brackets:** 8px x 8px L-shapes used to "anchor" the corners of featured hero images or key statistics.