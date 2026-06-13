// Transfer-desk wire feed. Intentionally generic and evergreen: it demonstrates the
// status-label system (done vs rumour) without publishing any unverified, time-sensitive
// transfer claim on a permanent page. No real names, no fabricated deals.
interface Row { time: string; tag: 'done' | 'rumour'; tagText: string; text: string; }

const rows: Row[] = [
  { time: '08:14', tag: 'rumour', tagText: 'Rumour', text: 'A midfield target enters talks. Two sources pending before we run it.' },
  { time: '11:02', tag: 'done', tagText: 'Done', text: 'A signing is confirmed by the club. Drawn the same morning.' },
  { time: '15:47', tag: 'rumour', tagText: 'Linked', text: 'A name surfaces in the window. Labelled a link until it is more.' },
  { time: '19:30', tag: 'done', tagText: 'Done', text: 'A deadline-day deal lands. Verified, then archived for good.' },
];

export function initTicker(animate: boolean): void {
  const el = document.getElementById('ticker');
  if (!el) return;
  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'ticker__row';
    row.innerHTML = `
      <span class="ticker__time">${r.time}</span>
      <span class="ticker__tag ticker__tag--${r.tag}">${r.tagText}</span>
      <span class="ticker__text">${r.text}</span>
    `;
    el.appendChild(row);
  });

  if (!animate) return;
  // lazy import gsap only when we actually animate
  import('gsap').then(({ gsap }) => {
    import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
      gsap.registerPlugin(ScrollTrigger);
      gsap.from(el.querySelectorAll('.ticker__row'), {
        opacity: 0,
        y: 14,
        duration: 0.6,
        ease: 'power2.out',
        stagger: 0.12,
        scrollTrigger: { trigger: el, start: 'top 80%', once: true },
      });
    });
  });
}
