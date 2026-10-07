/* http.mjs: the Wire's one fetch path. Descriptive UA (ESPN answers a browser UA with 202 and
   an empty body; Wikipedia expects contact details), a 15 s timeout, two retries on 202, empty or
   5xx, and one Retry-After wait on 429. With `offline` set it reads fixture files instead, which
   is how the tests and a blocked network run. Never prints a header or a key. */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url, { userAgent, headers = {}, offline = null, offlineName = null, gunzip = false, backoff = [5000, 15000], timeoutMs = 15000 } = {}) {
  if (offline) {
    const file = join(offline, offlineName || encodeURIComponent(url));
    if (!existsSync(file)) return { ok: false, status: "offline-missing", body: null };
    const body = readFileSync(file, "utf8");
    if (!body.trim()) return { ok: false, status: "202-empty", body: null };
    return { ok: true, status: 200, body };
  }
  let waited429 = false;
  for (let attempt = 0; ; attempt++) {
    let res, body;
    try {
      const ctl = AbortSignal.timeout(timeoutMs);
      res = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "*/*", ...headers }, signal: ctl, redirect: "follow" });
      // gunzip: the asset itself is a .gz file (no Content-Encoding), so fetch cannot inflate it.
      body = gunzip && res.ok ? gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8") : await res.text();
    } catch (err) {
      if (attempt < backoff.length) { await sleep(backoff[attempt]); continue; }
      return { ok: false, status: "network", body: null, detail: String(err?.cause?.code || err?.name || "error") };
    }
    if (res.status === 429 && !waited429) {
      waited429 = true;
      const ra = Math.min(60, Number(res.headers.get("retry-after")) || 30);
      await sleep(ra * 1000);
      continue;
    }
    const retryable = res.status === 202 || res.status >= 500 || (res.ok && !body.trim());
    if (retryable && attempt < backoff.length) { await sleep(backoff[attempt]); continue; }
    if (res.ok && body.trim()) return { ok: true, status: res.status, body };
    return { ok: false, status: res.ok ? `${res.status}-empty` : res.status, body: null };
  }
}

export async function fetchJson(url, opts) {
  const r = await fetchText(url, opts);
  if (!r.ok) return r;
  try { return { ok: true, status: r.status, json: JSON.parse(r.body) }; }
  catch { return { ok: false, status: "bad-json", json: null }; }
}
