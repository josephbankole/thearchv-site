// The video block's player (founder, 2026-11-21: the channel's videos playable on the site).
//
// WHAT IS ALREADY THERE. Every card is server-rendered by renderHomeVideos() in
// scripts/videos/lib.mjs: a plain link to the video on YouTube holding our own copy of the
// thumbnail, the title and the date. With no JS that link is the whole behaviour, and nothing on
// the page has spoken to Google.
//
// WHAT THIS ADDS. A plain click on a card swaps its thumbnail for YouTube's own embedded player,
// in privacy-enhanced mode. That click is the first moment anything loads from YouTube, which is
// what the privacy policy says (scripts/build-about-page.mjs) and what Quebec's Law 25 asks of a
// tracking technology: off until the visitor switches it on. A click with a modifier key, or with
// any button but the primary one, is left alone, so "open in a new tab" still opens YouTube.
//
// YOUTUBE'S RULES FOR AN EMBED, which this file exists to keep:
// - The player is YouTube's plain iframe. No IFrame JS API, so script-src does not change.
// - Never smaller than 200 by 200 (min-width and min-height on .video-card__player in style.css),
//   and nothing is ever drawn over it. The close control sits beneath it.
// - One player at a time. Starting a second puts the first card's thumbnail back, so no video
//   keeps playing out of sight.
// - autoplay=1 only ever follows the visitor's own click, with the player on screen.
// - The page's referrer policy (strict-origin-when-cross-origin) is left alone: YouTube asks
//   embedders to identify themselves through the Referer header, so the iframe must not carry
//   referrerpolicy="no-referrer".
//
// THE IFRAME IS NEVER INSIDE THE LINK. It goes into a sibling element at the top of the card, and
// the link below it keeps the title, still pointing at YouTube.
//
// TRAP 3. The Shorts list scrolls sideways on narrow screens and carries overflow-y: hidden. This
// file changes classes and inserts elements; it never sets a transform on anything.
//
// The origin below is the one the homepage CSP's frame-src names. scripts/videos/lib.mjs carries
// the same string as EMBED_ORIGIN and a test holds the two together.
const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

interface Playing {
  card: HTMLElement;
  player: HTMLElement;
  close: HTMLButtonElement;
  link: HTMLAnchorElement;
}

let playing: Playing | null = null;

function stop(restoreFocus: boolean): void {
  if (!playing) return;
  const { card, player, close, link } = playing;
  playing = null;
  // Removing the iframe is what ends playback.
  player.remove();
  close.remove();
  card.classList.remove('is-playing');
  if (restoreFocus) link.focus();
}

function play(card: HTMLElement, link: HTMLAnchorElement): void {
  const id = card.dataset.videoId ?? '';
  if (!ID_RE.test(id)) return;
  stop(false);

  const title = link.querySelector('.video-card__title')?.textContent?.trim() || 'Video';

  const frame = document.createElement('iframe');
  frame.src = `${EMBED_ORIGIN}/embed/${id}?autoplay=1&playsinline=1&rel=0`;
  frame.title = title;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;

  const player = document.createElement('div');
  player.className = 'video-card__player';
  player.appendChild(frame);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'video-card__close';
  close.textContent = 'Close player';
  close.addEventListener('click', () => stop(true));

  card.classList.add('is-playing');
  card.insertBefore(player, card.firstChild);
  card.appendChild(close);
  playing = { card, player, close, link };

  // The playing card takes more room (style.css), so bring the player into view where it landed,
  // then hand it the keyboard.
  player.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  frame.focus({ preventScroll: true });
}

export function initVideos(): void {
  const section = document.getElementById('videos');
  if (!section) return;
  section.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const target = ev.target instanceof Element ? ev.target : null;
    const link = target?.closest<HTMLAnchorElement>('a[data-video-play]');
    if (!link) return;
    const card = link.closest<HTMLElement>('.video-card');
    if (!card || !ID_RE.test(card.dataset.videoId ?? '')) return;
    // A card that is already playing keeps its title as an ordinary link to YouTube.
    if (card.classList.contains('is-playing')) return;
    ev.preventDefault();
    play(card, link);
  });
}
