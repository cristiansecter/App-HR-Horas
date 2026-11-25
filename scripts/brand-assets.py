"""
Genera todas las variantes de la marca SG Black a partir de los dos originales de brand/source/:
  - sgblack-isotipo.webp          (isotipo dentro de su cuadrado redondeado)
  - sgblack-logo-horizontal.jpg   (isotipo + "SG Black" sobre panel oscuro)
Salida: public/brand/*.png y public/favicon.{png,ico}.
Uso:  python3 scripts/brand-assets.py      (necesita Pillow y NumPy)
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "source"
OUT = ROOT / "public" / "brand"
OUT.mkdir(parents=True, exist_ok=True)

INK = (9, 7, 21)          # #090715, el negro de la marca
WORD_DARK = (16, 12, 38)  # texto del logo sobre fondo claro


def components(mask: np.ndarray):
    """Componentes conectados (8 vecinos) de una máscara booleana. Devuelve una lista de arreglos de índices planos."""
    h, w = mask.shape
    flat = mask.ravel()
    seen = np.zeros(flat.size, dtype=bool)
    out = []
    for start in np.flatnonzero(flat):
        if seen[start]:
            continue
        stack = [start]
        seen[start] = True
        comp = []
        while stack:
            i = stack.pop()
            comp.append(i)
            y, x = divmod(i, w)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        j = ny * w + nx
                        if flat[j] and not seen[j]:
                            seen[j] = True
                            stack.append(j)
        out.append(np.array(comp))
    return out


def soften(alpha: np.ndarray, blur: float = 0.8) -> np.ndarray:
    im = Image.fromarray(alpha.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(blur))
    return np.array(im)


def save(im: Image.Image, name: str, size=None):
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(OUT / name, optimize=True)
    print("  ", name, im.size)


# ---------------------------------------------------------------- isotipo (app icon)
iso = Image.open(SRC / "sgblack-isotipo.webp").convert("RGBA")
a = np.array(iso)
ys, xs = np.where(a[..., 3] > 10)
iso = iso.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
side = max(iso.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(iso, ((side - iso.width) // 2, (side - iso.height) // 2), iso)
print("isotipo")
save(sq, "sgblack-isotipo.png", (1024, 1024))
save(sq, "sgblack-isotipo-512.png", (512, 512))
save(sq, "sgblack-isotipo-192.png", (192, 192))

# Versión opaca (sin esquinas transparentes) para el ícono de iOS y el ícono "maskable": el sistema aplica su propia forma.
full = Image.new("RGBA", sq.size, INK + (255,))
full.paste(sq, (0, 0), sq)
save(full, "sgblack-apple-touch-icon.png", (180, 180))
pad = int(side * 0.18)
mk = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), INK + (255,))
mk.paste(sq, (pad, pad), sq)
save(mk, "sgblack-isotipo-maskable-512.png", (512, 512))

# Favicons: a tamaños chicos el isotipo entero se lee mejor que el cuadrado con degradés
for s in (16, 32, 48):
    save(sq, f"favicon-{s}.png", (s, s))
sq.resize((32, 32), Image.LANCZOS).save(ROOT / "public" / "favicon.png")
sq.save(ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("   favicon.png / favicon.ico")

# ---------------------------------------------------------------- glifo solo (sin el cuadrado)
rgb = np.array(sq)[..., :3].astype(int)
S = sq.width
fg = (rgb.max(axis=2) > 55) & (np.array(sq)[..., 3] > 200)
# Se queda con las piezas del glifo (centro del cuadrado) y descarta las franjas de luz de las esquinas.
glyph_mask = np.zeros(fg.shape, dtype=bool)
box = (int(S * 0.20), int(S * 0.20), int(S * 0.80), int(S * 0.82))
for comp in components(fg):
    ys_, xs_ = np.divmod(comp, S)
    if len(comp) > 3000 and box[0] <= xs_.mean() <= box[2] and box[1] <= ys_.mean() <= box[3]:
        glyph_mask[ys_, xs_] = True
gy, gx = np.where(glyph_mask)
gbox = (gx.min(), gy.min(), gx.max() + 1, gy.max() + 1)
alpha = soften(glyph_mask.astype(np.uint8) * 255, 1.2)
g = np.dstack([rgb.astype(np.uint8), alpha])
glyph = Image.fromarray(g, "RGBA").crop(gbox)
m = int(max(glyph.size) * 0.06)
canvas = Image.new("RGBA", (glyph.width + 2 * m, glyph.height + 2 * m), (0, 0, 0, 0))
canvas.paste(glyph, (m, m), glyph)
print("glifo")
# El glifo conserva sus colores sobre cualquier fondo: los huecos son transparentes y se ve el fondo.
save(canvas, "sgblack-glyph.png", (canvas.width * 600 // canvas.height, 600))

# ---------------------------------------------------------------- logo horizontal
hz = Image.open(SRC / "sgblack-logo-horizontal.jpg").convert("RGB")
W, H = hz.size
# 1) panel con esquinas redondeadas transparentes (en el JPG las esquinas son blancas)
tmp = hz.copy()
for corner in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)):
    ImageDraw.floodfill(tmp, corner, (255, 0, 255), thresh=40)
t = np.array(tmp).astype(int)
outside = (t[..., 0] == 255) & (t[..., 1] == 0) & (t[..., 2] == 255)
panel_a = np.where(outside, 0, 255).astype(np.uint8)
panel_a = np.array(Image.fromarray(panel_a, "L").filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1)))
panel = Image.fromarray(np.dstack([np.array(hz), panel_a]), "RGBA")
print("logo horizontal")
save(panel, "sgblack-logo-horizontal.png", (1600, int(1600 * H / W)))

# 2) logo sin panel: se queda con isotipo, divisor y letras (componentes del centro), sin las franjas de luz de las esquinas
h = np.array(hz).astype(int)
fgm = h.max(axis=2) > 70
keep = np.zeros(fgm.shape, dtype=bool)
for comp in components(fgm):
    ys_, xs_ = np.divmod(comp, W)
    # El isotipo empieza en x≈190: todo lo que quede a la izquierda es un resto de las franjas de luz del panel.
    if 200 < len(comp) < 60000 and xs_.min() > 150 and xs_.max() < W - 60 and ys_.min() > 40 and ys_.max() < H - 40:
        keep[ys_, xs_] = True
# Alfa suave a partir de la intensidad, solo dentro de lo que se conserva (y 3 px de margen para el antialias).
grow = np.array(Image.fromarray(keep.astype(np.uint8) * 255, "L").filter(ImageFilter.MaxFilter(7))) > 0
soft = np.clip((h.max(axis=2) - 14) / 46.0, 0, 1)
alpha_h = (np.where(grow, soft, 0) * 255).astype(np.uint8)
ky, kx = np.where(alpha_h > 8)
cb = (max(kx.min() - 12, 0), max(ky.min() - 12, 0), min(kx.max() + 12, W), min(ky.max() + 12, H))

on_dark = Image.fromarray(np.dstack([np.array(hz), alpha_h]), "RGBA").crop(cb)
save(on_dark, "sgblack-logo-on-dark.png", (1600, int(1600 * on_dark.height / on_dark.width)))

# 3) versión para fondo claro: el texto pasa a casi negro; el isotipo y el divisor conservan sus colores
word_from = int(W * 0.37)  # el isotipo y el divisor quedan a la izquierda de esta línea
light = np.array(hz).copy()
lum = h.max(axis=2) / 255.0
is_text = (np.arange(W)[None, :] >= word_from) & grow
# En el texto, la luminosidad manda la opacidad y el color es el tinta de la marca
text_alpha = (np.clip((h.max(axis=2) - 14) / 200.0, 0, 1) * 255).astype(np.uint8)
light[is_text] = WORD_DARK
alpha_l = np.where(is_text, text_alpha, alpha_h).astype(np.uint8)
on_light = Image.fromarray(np.dstack([light.astype(np.uint8), alpha_l]), "RGBA").crop(cb)
save(on_light, "sgblack-logo-on-light.png", (1600, int(1600 * on_light.height / on_light.width)))
print("listo")
