#!/usr/bin/env python3
"""normalize-heads.py: builds the app-grade illustrated portraits in public/heads/hd/.

Why this exists. The feed hands the iOS app one `image` per story, and the app draws it in a
circle: 60pt on a row, 132pt on the Today lead, 300px on the share poster. The old head bank
was 240px and 3 to 11 KB, so on a 3x phone the lead portrait was upscaled 1.65 times, and a
third of the files carried a baked circle or white frame that showed as a second ring inside
the app's own crop. Face size also ran from 20 to 64 per cent of the frame, so no two
portraits sat the same way. This script rebuilds every portrait from its full-resolution
master to one framing, one size and one format.

What it guarantees for every file it writes:
  * 600 x 600, square, WebP quality 88, no metadata. 600 covers the 132pt lead at 3x (396px)
    and the 300px poster medallion with room to spare.
  * Never upscaled. A master that cannot supply 600px at the target framing is refused.
  * Baked light borders and navy-disc-on-white-square frames are removed before fitting.
  * The face is found, confirmed by an eye check inside the face box, and placed at the same
    scale and height in every file, centred on the head rather than on the detector's box.
  * The crop never runs off the artwork, so there are no padded seams.

Identity. The script never decides who a face is. It builds exactly the entries listed in
scripts/data/heads-hd.json, and each entry records how its master was matched to the portrait
already published under that name (image correlation against the live file, or the named
bank row). A wrong face is worse than no face.

Usage (needs OpenCV with Haar cascades, Pillow and numpy; the mflux tool env has all three):
    python3 scripts/heads/normalize-heads.py [--only slug,slug] [--masters DIR] [--sheet out.png]
Exit 1 if any listed entry could not be built; the report names each failure.
"""
import argparse, hashlib, json, os, sys, urllib.request

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MANIFEST = os.path.join(ROOT, "scripts", "data", "heads-hd.json")
OUT_DIR = os.path.join(ROOT, "public", "heads", "hd")
CACHE = os.path.join(ROOT, ".heads-cache")

SIZE = 600          # output side, px
FACE_FRAC = 0.46    # detector face-box width as a share of the crop side
FACE_CY = 0.46      # face-box centre, as a share of the crop height from the top
QUALITY = 88

CASC = [cv2.CascadeClassifier(cv2.data.haarcascades + n)
        for n in ("haarcascade_frontalface_default.xml", "haarcascade_frontalface_alt2.xml")]
EYES = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")


def fetch(src, masters):
    if src.startswith("bank-local:"):
        path = os.path.join(masters, src.split(":", 1)[1])
        if not os.path.exists(path):
            raise FileNotFoundError(f"local master missing: {path} (pass --masters)")
        return path
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, hashlib.md5(src.encode()).hexdigest()[:16] + os.path.splitext(src)[1])
    if not os.path.exists(fn):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        with open(fn, "wb") as f:
            f.write(data)
    return fn


def clean_frame(im):
    """Strip a baked light border, and paint out the corners of a navy disc on a light square."""
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    notes = []
    k = max(4, a.shape[1] // 64)
    def light_corners(arr, thr):
        cs = [arr[:k, :k], arr[:k, -k:], arr[-k:, :k], arr[-k:, -k:]]
        return sum(c.reshape(-1, 3).mean() > thr for c in cs)
    if light_corners(a, 215) >= 3:
        ys, xs = np.where(a.mean(axis=2) < 200)
        a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        notes.append("trimmed-light-border")
        if light_corners(a, 200) >= 3:
            h, w, _ = a.shape
            yy, xx = np.mgrid[0:h, 0:w]
            r = min(h, w) / 2.0
            d2 = (yy - h / 2.0) ** 2 + (xx - w / 2.0) ** 2
            ring = (d2 <= (r * 0.93) ** 2) & (d2 > (r * 0.86) ** 2) & (yy < h * 0.45)
            a[d2 > (r * 0.965) ** 2] = np.median(a[ring], axis=0)
            notes.append("filled-disc-corners")
    return Image.fromarray(a.astype(np.uint8)), notes


def detect(im):
    """Largest frontal face whose upper half holds at least one eye, in a plausible position."""
    rgb = np.asarray(im.convert("RGB"))
    g = cv2.equalizeHist(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY))
    h, w = g.shape
    cands = []
    for c in CASC:
        for neighbours in (6, 4, 3):
            for (x, y, fw, fh) in c.detectMultiScale(g, 1.05, neighbours, minSize=(w // 7, w // 7)):
                cy = (y + fh / 2) / h
                if not (0.12 <= cy <= 0.72 and 0.18 <= fw / w <= 0.75):
                    continue
                upper = g[y:y + fh // 2, x:x + fw]
                eyes = EYES.detectMultiScale(upper, 1.05, 3, minSize=(fw // 10, fw // 10))
                cands.append((len(eyes) > 0, fw * fh, (int(x), int(y), int(fw), int(fh))))
    if not cands:
        return None, False
    with_eyes = [c for c in cands if c[0]]
    pool = with_eyes or cands
    return max(pool, key=lambda c: c[1])[2], bool(with_eyes)


def head_centre_x(im, box):
    """Horizontal centre of the head: the subject's mass across the face rows, blended with the
    detector's box. Turned faces put the box off the head; the mass pulls it back."""
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    x, y, fw, fh = box
    band = a[y:y + fh]
    bg = np.median(np.concatenate([band[:, :max(2, band.shape[1] // 12)], band[:, -max(2, band.shape[1] // 12):]], axis=1).reshape(-1, 3), axis=0)
    fg = np.abs(band - bg).sum(axis=2) > 90
    cols = fg.sum(axis=0)
    if cols.sum() == 0:
        return x + fw / 2
    mass = float((np.arange(len(cols)) * cols).sum() / cols.sum())
    return 0.5 * (x + fw / 2) + 0.5 * mass


def fit(entry, masters):
    path = fetch(entry["source"], masters)
    im, notes = clean_frame(Image.open(path))
    W, H = im.size
    if entry.get("maxBottom"):  # a cover master: keep the crop above its title banner
        H = int(H * entry["maxBottom"])
        im = im.crop((0, 0, W, H))
        notes.append(f"banner-guard-{entry['maxBottom']}")
    if entry.get("face"):
        box, eyed = tuple(entry["face"]), True
        notes.append("face-override")
    else:
        box, eyed = detect(im)
    if box is None:
        return None, notes + ["FAIL: no face found"]
    if not eyed:
        notes.append("WARN: face not eye-confirmed")
    x, y, fw, fh = box
    side = min(fw / FACE_FRAC, W, H)
    cx = head_centre_x(im, box)
    cy = y + fh / 2
    left = min(max(0, cx - side / 2), W - side)
    top = min(max(0, cy - FACE_CY * side), H - side)
    if side < SIZE:
        return None, notes + [f"FAIL: master gives {int(side)}px at the target framing, needs {SIZE}"]
    crop = im.crop((round(left), round(top), round(left + side), round(top + side)))
    crop = crop.resize((SIZE, SIZE), Image.LANCZOS)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, entry["out"] + ".webp")
    crop.save(out, "WEBP", quality=QUALITY, method=6)  # Pillow writes no EXIF/ICC unless asked
    return {"out": os.path.relpath(out, ROOT), "master": [Image.open(path).size[0], Image.open(path).size[1]],
            "cropSide": int(side), "faceShare": round(fw / side, 3)}, notes


def sheet(results, dest):
    ok = [r for r in results if r["result"]]
    cols, S = 8, 150
    rows = (len(ok) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * S, rows * (S + 16)), "white")
    d = ImageDraw.Draw(canvas)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, S - 1, S - 1], fill=255)
    for i, r in enumerate(ok):
        im = Image.open(os.path.join(ROOT, r["result"]["out"])).convert("RGB").resize((S, S), Image.LANCZOS)
        x, y = (i % cols) * S, (i // cols) * (S + 16)
        canvas.paste(im, (x, y), mask)
        d.text((x + 3, y + S + 2), r["out"][:24], fill="black")
    canvas.save(dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--masters", default=os.path.join(ROOT, "..", "assets", "headshots"))
    ap.add_argument("--sheet", default="")
    args = ap.parse_args()
    manifest = json.load(open(MANIFEST))
    only = {s for s in args.only.split(",") if s}
    results, failed = [], 0
    for e in manifest["entries"]:
        if only and e["out"] not in only:
            continue
        try:
            res, notes = fit(e, args.masters)
        except Exception as exc:  # a dead URL or a missing master fails that entry, not the run
            res, notes = None, [f"FAIL: {exc}"]
        failed += res is None
        results.append({"out": e["out"], "result": res, "notes": notes})
        print(f"{'OK  ' if res else 'FAIL'} {e['out']:28s} {json.dumps(res) if res else ''} {' '.join(notes)}", flush=True)
    if args.sheet:
        sheet(results, args.sheet)
    print(f"{len(results) - failed} built, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
