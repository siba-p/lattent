"""App icons for the installable web app (manifest.webmanifest), drawn from the geometry of
   assets/brand/mark.svg with Pillow. Run after changing the mark:
       python3 scripts/build_icons.py assets/img
"""
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
def hexc(h, a=255): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (a,)
def mark(size, maskable=False):
    S = 8 * size; u = S / 64
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    # diagonal gradient #252d6b -> #0c1031
    a, b = hexc('#252d6b'), hexc('#0c1031')
    grad = Image.new('RGBA', (S, S))
    gp = grad.load()
    for y in range(S):
        for x in range(0, S, 8):
            t = (x + y) / (2 * S)
            c = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(4))
            for k in range(8):
                if x + k < S: gp[x + k, y] = c
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=0 if maskable else 15 * u, fill=255)
    im.paste(grad, (0, 0), m)
    d = ImageDraw.Draw(im)
    sc = 0.78 if maskable else 1.0       # keep the dots inside the maskable safe zone
    off = 32 * (1 - sc)
    P = lambda v: (off + v * sc) * u
    def circ(cx, cy, r, fill=None, outline=None, width=0):
        d.ellipse([P(cx) - r * sc * u, P(cy) - r * sc * u, P(cx) + r * sc * u, P(cy) + r * sc * u], fill=fill, outline=outline, width=round(width * sc * u))
    for cx, cy in [(32, 32), (46, 32), (32, 18)]: circ(cx, cy, 2.6, fill=hexc('#3f4789'))
    for cx, cy in [(18, 18), (18, 32), (18, 46), (32, 46), (46, 46)]: circ(cx, cy, 5, fill=hexc('#e3e7ff'))
    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0)); rd = ImageDraw.Draw(ring)
    r = 11 * sc * u
    rd.ellipse([P(46) - r, P(18) - r, P(46) + r, P(18) + r], outline=hexc('#f08c3e', 128), width=round(2 * sc * u))
    im = Image.alpha_composite(im, ring); d = ImageDraw.Draw(im)
    circ(46, 18, 5.6, fill=hexc('#f08c3e'))
    return im.resize((size, size), Image.LANCZOS)
mark(192).save(f'{out}/icon-192.png', optimize=True)
mark(512).save(f'{out}/icon-512.png', optimize=True)
mark(512, maskable=True).save(f'{out}/icon-maskable-512.png', optimize=True)
print('icons written')
