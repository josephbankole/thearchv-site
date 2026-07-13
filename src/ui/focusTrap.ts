// Shared focus trap for disclosure/dialog-style UI (masthead hamburger panel, poster
// lightbox): while `container` is open, Tab/Shift+Tab cycles between its first and last
// focusable element instead of leaking focus into the page behind it. Call trapFocus()
// when the container opens; call the function it returns when it closes.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // offsetParent is null for display:none elements (e.g. the App Store link, hidden
    // until flip day) - skip those, but never drop the currently-focused element itself.
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function trapFocus(container: HTMLElement): () => void {
  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusable = focusableIn(container);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !active || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !active || !container.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }
  container.addEventListener('keydown', onKeydown);
  return () => container.removeEventListener('keydown', onKeydown);
}
