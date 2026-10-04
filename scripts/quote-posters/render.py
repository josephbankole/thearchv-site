"""ARCHV typographic quote posters (4 Oct 2026).

Not part of `npm run build`. Run by hand or by the founder's Mac routine:

    python3 scripts/quote-posters/render.py --out <dir>             # print files, previews, mockups
    python3 scripts/quote-posters/render.py --out <dir> --only seagulls
    python3 scripts/quote-posters/render.py --shop public/shop      # app storefront thumbnails only

Needs Pillow and nothing else. One spec per poster in lineup.json; for each it writes the print
file at the true shape of every size sold (2:3 for 12x18 and 24x36, 3:4 for 12x16 and 18x24,
5:7 for 5x7; never a crop of one master), a 1000x1500 flat preview and a 3000x2250 framed
mockup (Etsy's 4:3 listing shape).

House type and colour, brand-canon/DESIGN-PLAYBOOK.md and D-2026-08-14a: Archivo Black for the
words, Marcellus at weight 700 for every numeral and context line (Marcellus ships one weight, so
700 is synthesised with a stroke, as a browser does), every zero drawn narrower so "0" never reads
as "O" (27 Sep ruling), the pair 9 and pair 10 grounds with their third colours, and THE ARCHV.
wordmark from brand-canon/brand/archv-wordmark-pair1.svg at the foot (stored here as two alpha
masks, wordmark-text.png and wordmark-dot.png, so no cairo is needed). The third colour marks the
numerals in the top line, the context line and the rules; it never carries the quote itself. The
quote posters carry no quotation marks (founder, 4 Oct 2026).

What never goes on the art: crest, badge, kit, face, and attribution. The speaker and the sources
for every quote live in LINEUP.md, not on the poster (founder, 26 Sep: "just the quote").

The full-size print files are NOT committed: this repo is public, and a print file is the product.
"""
import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = HERE.parent / "fonts"
ARCHIVO = str(FONTS / "ArchivoBlack-Regular.ttf")
MARCELLUS = str(FONTS / "Marcellus-Regular.ttf")

THEMES = {
    # pair 9, Old Trafford Red / Cream, third Matchday Yellow
    "red": {"bg": "#8B1A1F", "ink": "#F2EAD3", "accent": "#FFD85F", "rule": "#B5444A"},
    # pair 10, Archive Navy / Cream, third Signal Orange Bright
    "navy": {"bg": "#1E223D", "ink": "#F2EAD3", "accent": "#FA6A3C", "rule": "#3A3F63"},
    # cream ground for bedrooms: navy words, red accent (7.72:1 on cream)
    "cream": {"bg": "#F2EAD3", "ink": "#1E223D", "accent": "#8B1A1F", "rule": "#D9CDAE"},
    # cream ground, Old Trafford Red words, navy accent (pair 9 reversed)
    "cream-red": {"bg": "#F2EAD3", "ink": "#8B1A1F", "accent": "#1E223D", "rule": "#D9CDAE"},
}

H = 7200  # every print file is 7200px tall: 300 dpi at 24in, 200 dpi at 36in
RATIOS = {"2x3": (2, 3), "3x4": (3, 4), "5x7": (5, 7)}


def font(path, size):
    return ImageFont.truetype(path, max(8, int(size)))


def runs(text):
    """Split into (is_digit, chunk) runs so numerals can be set in Marcellus."""
    return [(m.group(0)[0].isdigit(), m.group(0)) for m in re.finditer(r"\d+|\D+", text)]


def bold_stroke(f):
    """Marcellus at 700: a stroke of about 1/36 em in the glyph's own colour."""
    return max(1, round(f.size / 36)) if "Marcellus" in getattr(f, "path", "") else 0


def glyph_img(ch, f, colour, xscale=1.0):
    s = bold_stroke(f)
    r = f.getbbox(ch, stroke_width=s)[2]
    asc, desc = f.getmetrics()
    img = Image.new("RGBA", (max(1, r) + 4 + 2 * s, asc + desc + 2 * s), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((s, s), ch, font=f, fill=colour, stroke_width=s, stroke_fill=colour)
    if xscale != 1.0:
        img = img.resize((max(1, int(img.width * xscale)), img.height), Image.LANCZOS)
    return img, (f.getlength(ch) + s) * xscale


def zero_scale(ch):
    return 0.8 if ch == "0" else 1.0


def mixed_width(text, size, tracking=0.0, word_font=ARCHIVO, num_scale=1.08):
    fw, fn = font(word_font, size), font(MARCELLUS, size * num_scale)
    w = 0.0
    for is_num, chunk in runs(text):
        f = fn if is_num else fw
        for ch in chunk:
            w += (f.getlength(ch) + bold_stroke(f)) * zero_scale(ch) + tracking * size
    return w - (tracking * size if text else 0)


def draw_mixed(canvas, xy, text, size, colour, tracking=0.0, anchor="l", word_font=ARCHIVO,
               num_colour=None, num_scale=1.08):
    """Words in word_font, numerals in Marcellus, baselines aligned."""
    fw, fn = font(word_font, size), font(MARCELLUS, size * num_scale)
    total = mixed_width(text, size, tracking, word_font, num_scale)
    x, y = xy
    if anchor == "c":
        x -= total / 2
    elif anchor == "r":
        x -= total
    base = y + fw.getmetrics()[0]
    for is_num, chunk in runs(text):
        f = fn if is_num else fw
        col = (num_colour or colour) if is_num else colour
        for ch in chunk:
            img, adv = glyph_img(ch, f, col, zero_scale(ch))
            s = bold_stroke(f)
            canvas.alpha_composite(img, (int(round(x - s)), int(round(base - f.getmetrics()[0] - s))))
            x += adv + tracking * size
    return total


def wrap(text, size, max_w, tracking):
    lines, cur = [], ""
    for w in text.split(" "):
        trial = (cur + " " + w).strip()
        if mixed_width(trial, size, tracking) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def balance(text, size, max_w, tracking, n):
    """Narrowest wrap width that still gives n lines, so no word is left alone at the end."""
    lo, hi, best = max_w * 0.4, max_w, wrap(text, size, max_w, tracking)
    for _ in range(18):
        mid = (lo + hi) / 2
        ls = wrap(text, size, mid, tracking)
        if len(ls) <= n and max(mixed_width(l, size, tracking) for l in ls) <= mid:
            best, hi = ls, mid
        else:
            lo = mid
    return best


def wordmark(width, ink, dot):
    """THE ARCHV. recoloured from the two committed masks of the pair 1 SVG."""
    text = Image.open(HERE / "wordmark-text.png").convert("L")
    dmask = Image.open(HERE / "wordmark-dot.png").convert("L")
    h = round(text.height * width / text.width)
    text, dmask = (m.resize((int(width), h), Image.LANCZOS) for m in (text, dmask))
    out = Image.new("RGBA", text.size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", text.size, ink), (0, 0), text)
    out.paste(Image.new("RGBA", text.size, dot), (0, 0), dmask)
    return out.crop(out.getbbox())


def pitch(im, W, colour):
    """Faint pitch markings for the bedroom posters: touchline frame, halfway line, centre
    circle and spot. Generic football geometry, no club mark."""
    d = ImageDraw.Draw(im)
    lw = max(6, W // 300)
    inset = round(W * 0.045)
    d.rectangle([inset, inset, W - inset, H - inset], outline=colour, width=lw)
    d.line([inset, H / 2, W - inset, H / 2], fill=colour, width=lw)
    r = W * 0.26
    d.ellipse([W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r], outline=colour, width=lw)
    s = lw * 2.2
    d.ellipse([W / 2 - s, H / 2 - s, W / 2 + s, H / 2 + s], fill=colour)


def render(spec, ratio):
    rw, rh = RATIOS[ratio]
    W = round(H * rw / rh)
    th = THEMES[spec["theme"]]
    im = Image.new("RGBA", (W, H), th["bg"])
    d = ImageDraw.Draw(im)
    m = round(W * 0.085)
    inner = W - 2 * m
    bar = max(6, H // 900)
    if spec.get("motif") == "pitch":
        pitch(im, W, th["rule"])

    # Top: place line (numerals in Marcellus, in the accent) and context line.
    y = round(H * 0.075)
    if spec.get("top"):
        ts = W * 0.062
        while mixed_width(spec["top"], ts, 0.04) > inner and ts > 40:
            ts *= 0.96
        draw_mixed(im, (W / 2, y), spec["top"], ts, th["ink"], 0.04, "c", num_colour=th["accent"])
        y += round(ts * 1.25)
    if spec.get("context"):
        cs = W * 0.026
        while mixed_width(spec["context"], cs, 0.32, MARCELLUS) > inner and cs > 30:
            cs *= 0.96
        draw_mixed(im, (W / 2, y), spec["context"], cs, th["accent"], 0.32, "c",
                   word_font=MARCELLUS, num_scale=1.0)
        y += round(cs * 1.8)
    rule_y = y + round(H * 0.012)
    d.rectangle([W / 2 - W * 0.06, rule_y, W / 2 + W * 0.06, rule_y + bar], fill=th["accent"])

    # Foot: date line and the wordmark.
    wm = wordmark(W * 0.36, th["ink"], th["accent"])
    wm_y = H - round(H * 0.06) - wm.height
    im.alpha_composite(wm, (round((W - wm.width) / 2), wm_y))
    foot_top = wm_y
    if spec.get("date"):
        ds = W * 0.03
        dy = wm_y - round(ds * 2.6)
        draw_mixed(im, (W / 2, dy), spec["date"], ds, th["ink"], 0.28, "c", word_font=MARCELLUS,
                   num_colour=th["ink"], num_scale=1.0)
        foot_top = dy
    fr_y = foot_top - round(H * 0.035)
    d.rectangle([W / 2 - W * 0.06, fr_y, W / 2 + W * 0.06, fr_y + bar], fill=th["accent"])

    # The quote, fitted between the rules. A quote is one or more parts with a scale each, so a
    # long line gets hierarchy by size (playbook rule 1) and every word stays in the ink colour.
    # No quotation marks on these posters (founder, 4 Oct 2026: "remove the quote marks from the
    # posters"); that narrows the 26 Sep "inside quotation marks" rule for the quote posters only.
    texts = [p["text"].upper().replace("'", "’") for p in spec["parts"]]
    scales = [p.get("scale", 1.0) for p in spec["parts"]]
    box_top, box_bot = rule_y + round(H * 0.05), fr_y - round(H * 0.05)
    lead, tracking, gap_k = 1.04, -0.01, 0.45

    def layout(base):
        blocks, h = [], 0.0
        for t, sc in zip(texts, scales):
            sz = base * sc
            ls = wrap(t, sz, inner, tracking)
            if max(mixed_width(l, sz, tracking) for l in ls) > inner:
                return None
            ls = balance(t, sz, inner, tracking, len(ls))
            blocks.append((sz, ls))
            h += len(ls) * sz * lead
        return blocks, h + gap_k * base * (len(texts) - 1)

    lo, hi, best = 40, int(W * 0.2), None
    while lo <= hi:
        mid = (lo + hi) // 2
        r = layout(mid)
        if r and r[1] <= box_bot - box_top:
            best, lo = (mid, r), mid + 1
        else:
            hi = mid - 1
    if best is None:
        raise ValueError(f"{spec['slug']}: quote does not fit at {ratio}")
    base, (blocks, block_h) = best
    qy = box_top + (box_bot - box_top - block_h) / 2
    for sz, ls in blocks:
        for line in ls:
            draw_mixed(im, (W / 2, qy), line, sz, th["ink"], tracking, "c",
                       num_colour=th["accent"])
            qy += sz * lead
        qy += gap_k * base
    return im.convert("RGB")


def mockup(poster, wall="#E8E4DE"):
    """Framed print on a plain wall, 3000x2250."""
    MW, MH = 3000, 2250
    bg = Image.new("RGB", (MW, MH), wall)
    ph = int(MH * 0.74)
    pw = int(ph * poster.width / poster.height)
    p = poster.resize((pw, ph), Image.LANCZOS)
    mat, frame = int(pw * 0.07), int(pw * 0.035)
    fw, fh = pw + 2 * (mat + frame), ph + 2 * (mat + frame)
    fx, fy = (MW - fw) // 2, int(MH * 0.08)
    shadow = Image.new("RGBA", (MW, MH), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([fx + 18, fy + 30, fx + fw + 18, fy + fh + 30],
                                     fill=(0, 0, 0, 90))
    bg = Image.alpha_composite(bg.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(28)))
    d = ImageDraw.Draw(bg)
    d.rectangle([fx, fy, fx + fw, fy + fh], fill="#1B1B1B")
    d.rectangle([fx + frame, fy + frame, fx + fw - frame, fy + fh - frame], fill="#FAFAF7")
    bg.paste(p, (fx + frame + mat, fy + frame + mat))
    d.rectangle([0, int(MH * 0.93), MW, MH], fill="#CFC8BE")
    return bg.convert("RGB")


def size_guide(path):
    """One shared listing photo: the five sizes sold, drawn to scale."""
    MW, MH = 3000, 2250
    im = Image.new("RGBA", (MW, MH), "#F2EAD3")
    d = ImageDraw.Draw(im)
    sizes = [(5, 7), (12, 16), (12, 18), (18, 24), (24, 36)]
    margin, gap = 160, 80
    scale = (MW - 2 * margin - gap * (len(sizes) - 1)) / sum(w for w, _ in sizes)  # px per inch
    x, base_y = margin, 1900
    for w, h in sizes:
        pw, ph = w * scale, h * scale
        d.rectangle([x, base_y - ph, x + pw, base_y], outline="#1E223D", width=8)
        label = f"{w}x{h}"
        draw_mixed(im, (x + pw / 2, base_y + 40), label, 64, "#1E223D", 0.04, "c",
                   word_font=MARCELLUS, num_scale=1.0)
        x += pw + gap
    draw_mixed(im, (MW / 2, 150), "FIVE SIZES, INCHES", 110, "#1E223D", 0.02, "c",
               num_colour="#8B1A1F")
    im.convert("RGB").save(path, quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="directory for print files, previews and mockups")
    ap.add_argument("--shop", help="directory for 600x900 webp storefront thumbnails")
    ap.add_argument("--only", help="render one slug")
    a = ap.parse_args()
    specs = json.loads((HERE / "lineup.json").read_text())["posters"]
    if a.only:
        specs = [s for s in specs if s["slug"] == a.only]
    for spec in specs:
        master = render(spec, "2x3")
        if a.shop:
            Path(a.shop).mkdir(parents=True, exist_ok=True)
            master.resize((600, 900), Image.LANCZOS).save(
                Path(a.shop) / f"quote-{spec['slug']}.webp", quality=84)
        if a.out:
            sd = Path(a.out) / spec["slug"]
            (sd / "print").mkdir(parents=True, exist_ok=True)
            for ratio in RATIOS:
                im = master if ratio == "2x3" else render(spec, ratio)
                im.save(sd / "print" / f"{spec['slug']}_{ratio}.png", dpi=(300, 300))
            master.resize((1000, 1500), Image.LANCZOS).save(sd / f"{spec['slug']}_flat.jpg", quality=90)
            mockup(master).save(sd / f"{spec['slug']}_mockup.jpg", quality=88)
        print("rendered", spec["slug"])
    if a.out:
        size_guide(Path(a.out) / "size-guide.jpg")


if __name__ == "__main__":
    main()
