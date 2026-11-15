/* shared/content-inline.mjs — inline markdown for the content/ explainers (build-content.mjs).

   Links, **bold** and *italic* only, the subset the explainers use. Two rules the old one-line
   regex chain in build-content.mjs did not keep (audit site-build-4, 2026-11-15):
   - A link is written as an anchor only when its target passes the same SAFE_HREF test as
     src/lib/longreadMd.ts: http(s) or a site-root path. javascript:, data:, mailto: and
     protocol-relative //host targets render as their text, with no anchor.
   - Emphasis never reaches a link's href, so a URL with an asterisk in it stays a URL.
   Text and href are escaped from the raw markdown once each, never twice. */
import { esc, escAttr } from "./page-shell.mjs";

// Kept identical to SAFE_HREF in src/lib/longreadMd.ts.
export const SAFE_HREF = /^(?:https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']*)$/i;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

const emph = (html) => html
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>");

export function inlineMd(raw) {
  // Each link becomes a placeholder while emphasis runs, so *a sentence with [a link](/x) in it*
  // still italicises across the link, while the href itself is never touched.
  const links = [];
  const text = String(raw ?? "").replace(/\u0000/g, "").replace(LINK, (_, label, href) => {
    const inner = emph(esc(label));
    links.push(SAFE_HREF.test(href) ? `<a href="${escAttr(href)}">${inner}</a>` : inner);
    return `\u0000${links.length - 1}\u0000`;
  });
  return emph(esc(text)).replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}
