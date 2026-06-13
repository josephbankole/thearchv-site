# Security Assessment — thearchv.ca

**Scope:** static single-page site (Vite build), deployed to GitHub Pages behind `thearchv.ca`.
**Date:** 2026-06-12. **Result: PASS — cleared for launch** with the hardening notes below.

## Posture summary

A static, server-less site has a small attack surface. There is no database, no auth, no
server-side code, and no user data stored. The only outbound integration is the partnerships
form (Web3Forms). All scripts, styles and fonts are first-party and bundled — no third-party
CDN or analytics script is loaded. This is a strong baseline.

## Findings

| # | Area | Result | Notes |
|---|------|--------|-------|
| 1 | Dependency vulnerabilities | ✅ Pass | `npm audit` (prod) = 0 vulnerabilities. |
| 2 | Secrets in client bundle | ✅ Pass | No API keys/tokens/passwords. The Web3Forms access key is public-safe by design (routes only to the verified inbox); currently a clearly-marked placeholder. |
| 3 | Cross-site scripting (XSS) | ✅ Pass | `innerHTML` is used only with hard-coded, first-party content (no user input is ever reflected into the DOM). The form's status message uses `textContent`. |
| 4 | Content-Security-Policy | ✅ Pass (meta) | `default-src 'self'`; scripts restricted to self + one SHA-256 hash for the inline bootstrap; `object-src 'none'`; `base-uri 'self'`; `frame-src 'none'`; `connect-src`/`form-action` limited to `api.web3forms.com`. See limitation below. |
| 5 | Inline event handlers | ✅ Pass | None (`onclick=`, `onload=` etc. = 0). All listeners attached in code. |
| 6 | External link safety | ✅ Pass | Every `target="_blank"` carries `rel="noopener noreferrer"`. |
| 7 | Referrer leakage | ✅ Pass | `referrer` meta = `strict-origin-when-cross-origin`. |
| 8 | Source-map / info leak | ✅ Pass | Production build emits no `.map` files; no stack traces or comments leaking internals. |
| 9 | Form abuse | ✅ Pass | Honeypot field + required-field validation. Web3Forms applies its own spam filtering and rate limits. |
| 10 | Transport security | ✅ Pass (config) | GitHub Pages serves HTTPS; enable **Enforce HTTPS** after DNS. |

## Limitations of a GitHub Pages host (and mitigations)

GitHub Pages cannot send custom HTTP response headers, so a few protections can only be set via
a `<meta>` tag (weaker) or require a CDN in front of the domain:

- **`frame-ancestors` (clickjacking):** not expressible in a meta CSP. The `frame-src 'none'`
  here stops the page embedding others, but to stop the page *being framed*, set
  `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` at a CDN (Cloudflare) when one is added.
- **HSTS:** set `Strict-Transport-Security` at the CDN once HTTPS is enforced.
- **`X-Content-Type-Options: nosniff`** and **`Permissions-Policy`:** add at the CDN.

These are hardening upgrades, not launch blockers, given the static no-data nature of the site.

## Recommendation

**Cleared to go live.** When the domain is later fronted by a CDN, promote the CSP to a real
response header and add `frame-ancestors`, HSTS, `nosniff`, and a `Permissions-Policy`. Re-run
`npm audit` on each dependency bump, and re-run the IP scrub (README go/no-go gate) after any
content change.
