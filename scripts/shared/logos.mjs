/* logos.mjs: the one switch for third-party logos on the site, and the only place that writes
   their markup (founder ruling, 21 Nov 2026: "downloaded, we are ok to use them", for the Premier
   League logo set from https://logo.premierleague.com).

   THE SWITCH. THIRD_PARTY_LOGOS turns every third-party logo on the site off. Set it to false and
   rebuild: no page carries an <img> pointing under /logos/, and scripts/check-logos.mjs then fails
   the build if any page still does. The Premier League's terms ask for removal within 12 hours of a
   request, and this constant plus one deploy is how that is met. The homepage bundle (src/) shows no
   logo, so there is nothing to mirror there; if a logo is ever added to the homepage, mirror this
   constant into src/ and add it to check-logos.mjs.

   THE RULES (the licence terms, recorded in scripts/data/logos.json):
   - Purple version on light grounds, white version on dark. The site is light only (style.css and
     pageStyles() pin color-scheme: light), so only the purple file ships.
   - Resize only. Never recolour, redraw, crop, animate or add an effect. The file in
     public/logos/premier-league/ is the original, byte for byte; CSS only sets its height.
   - Small (24px high), beside the words "Premier League" where the page already names the
     competition. Never in navigation, mastheads, section identity, the Wire, posters, storefront
     tiles, og or share cards, app feeds, or near the poster strip.
   - The line "© Copyright The Football Association Premier League Limited, 2016." goes with every
     use: it is in the footer legal line of every page-shell page and in index.html.

   Club crests and other leagues are a later pass (Wikimedia Commons files only, per the same
   ruling). Formula 1, NBA and WNBA logos stay off: their own pages require a written licence. */

export const THIRD_PARTY_LOGOS = true;

export const LOGO_DIR = "/logos/";

export const PL_LOGO = {
  src: "/logos/premier-league/PL_LOGO_COMPACT_DARK_RGB.png",
  alt: "Premier League logo",
  // Rendered size: 24px high, width from the file's own 941 x 1117 ratio (CSS sets width: auto, so
  // the attributes reserve the space and the browser never stretches it).
  width: 20,
  height: 24,
};

export const PL_NOTICE = "© Copyright The Football Association Premier League Limited, 2016.";

/* The Premier League logo <img> (constant values, nothing to escape; no import, so page-shell.mjs
   can import this module without a cycle), or '' when the switch is off. `lazy` for anything below the fold. */
export function plLogo({ lazy = true, enabled = THIRD_PARTY_LOGOS } = {}) {
  if (!enabled) return "";
  const l = PL_LOGO;
  return `<img class="comp-logo" src="${l.src}" alt="${l.alt}" width="${l.width}" height="${l.height}"${lazy ? ' loading="lazy"' : ""} decoding="async" />`;
}

/* The CSS for .comp-logo, shared by pageStyles() and the /scores/ page. */
export const COMP_LOGO_CSS = `.comp-logo { display: inline-block; height: 24px; width: auto; vertical-align: -5px; margin-right: .45em; }`;
