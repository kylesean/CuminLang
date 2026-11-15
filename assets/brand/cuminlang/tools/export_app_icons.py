#!/usr/bin/env python3
"""Export the CuminLang identity into the application's asset slots.

Derives `assets/icons/*` (PNGs, icon.ico, icon.icns, install.gif) and `assets/brand/cuminlang/png/*`
from `assets/brand/cuminlang/app-icon.svg` and `favicon.svg` so there is one source of truth.

Requires: `rsvg-convert` and `Pillow`.
"""
import os
import re
import shutil
import struct
import subprocess
import tempfile

from PIL import Image, ImageDraw

BRAND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(BRAND, "..", "..", ".."))
ICONS = os.path.join(ROOT, "assets", "icons")
BRAND_PNGS = os.path.join(BRAND, "png")

INK = "#181614"

HICOLOR = (16, 24, 32, 48, 64, 128, 256)
APP_PNG_SIZES = (1024, 512, 256, 128, 64, 32, 16)
ICNS_TYPES = (
    ("icp4", 16), ("icp5", 32), ("icp6", 64),
    ("ic07", 128), ("ic08", 256), ("ic09", 512), ("ic10", 1024),
    ("ic11", 32), ("ic12", 64), ("ic13", 256), ("ic14", 512),
)


def render(svg_path, size, out_path):
    """Rasterise an SVG to an exact square PNG, preserving transparency."""
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), "-o", out_path, svg_path],
        check=True,
    )


def dib(rgba):
    """Build a 32-bit BMP/DIB payload for one ICO entry (XOR bitmap + AND mask)."""
    w, h = rgba.size
    pixels = rgba.load()
    xor = bytearray()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            xor += bytes((b, g, r, a))
    row_bytes = ((w + 31) // 32) * 4
    and_mask = bytes(row_bytes * h)
    image = bytes(xor) + and_mask
    header = struct.pack("<IiiHHIIiiII", 40, w, 2 * h, 1, 32, 0, len(image), 0, 0, 0, 0)
    return header + image


def write_ico(path, png_paths, sizes):
    """Write a classic ICO with uncompressed DIB entries (compatible with rcedit)."""
    entries = [(size, dib(Image.open(png_paths[size]).convert("RGBA"))) for size in sizes]
    count = len(entries)
    directory = bytearray(struct.pack("<HHH", 0, 1, count))
    offset = 6 + 16 * count
    for size, payload in entries:
        directory += struct.pack(
            "<BBBBHHII",
            size if size < 256 else 0,
            size if size < 256 else 0,
            0, 0, 1, 32, len(payload), offset,
        )
        offset += len(payload)
    with open(path, "wb") as f:
        f.write(directory)
        for _, payload in entries:
            f.write(payload)


def write_icns(path, png_paths):
    """Write an ICNS container with raw PNG payloads (macOS 10.7+)."""
    body = bytearray()
    for otype, size in ICNS_TYPES:
        with open(png_paths[size], "rb") as f:
            data = f.read()
        body += otype.encode("ascii") + struct.pack(">I", len(data) + 8) + data
    with open(path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(body) + 8) + body)


def full_bleed_svg(icon_svg):
    """Re-frame the master on its plate box: square canvas, no rounded corners."""
    with open(icon_svg, encoding="utf-8") as f:
        text = f.read()
    plate = re.search(r'<rect id="plate"([^>]*)>', text).group(1)

    def attr(name, default):
        m = re.search(rf'{name}="([^"]*)"', plate)
        return m.group(1) if m else default

    box = [attr(k, "0") for k in ("x", "y", "width", "height")]
    body = text[text.index('<g id="glyph"'):text.rindex("</svg>")]
    body = body.replace(' id="glyph"', "")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        f'viewBox="{" ".join(box)}">\n'
        f'  <rect x="{box[0]}" y="{box[1]}" width="{box[2]}" height="{box[3]}" '
        f'fill="{attr("fill", INK)}"/>\n'
        f'  {body}\n</svg>\n'
    )


def write_install_gif(path, icon_svg):
    """One-frame installer card for Squirrel: rounded warm-ink plate, paper C, amber kernel."""
    w, h, radius, margin = 325, 339, 30, 12
    side = min(w, h) - 2 * margin
    with tempfile.TemporaryDirectory() as tmp:
        svg = os.path.join(tmp, "full-bleed.svg")
        with open(svg, "w", encoding="utf-8") as f:
            f.write(full_bleed_svg(icon_svg))
        plate_png = os.path.join(tmp, "plate.png")
        render(svg, 512, plate_png)
        plate = Image.open(plate_png).convert("RGBA").resize((side, side), Image.LANCZOS)
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, side - 1, side - 1), radius=radius, fill=255)
    plate.putalpha(mask)

    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    card.alpha_composite(plate, ((w - side) // 2, (h - side) // 2))
    alpha = card.getchannel("A")
    flat = Image.new("RGB", card.size, (24, 22, 20))
    flat.paste(card.convert("RGB"), (0, 0), alpha)
    palette = flat.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    indices = bytearray(palette.tobytes())
    for i, value in enumerate(alpha.tobytes()):
        if value < 128:
            indices[i] = 255
    image = Image.frombytes("P", card.size, bytes(indices))
    image.putpalette(palette.getpalette())
    image.save(path, save_all=True, append_images=[], duration=250, loop=0,
               transparency=255, disposal=2)


def main():
    os.makedirs(BRAND_PNGS, exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)

    master_svg = os.path.join(ICONS, "icon.svg")
    shutil.copyfile(os.path.join(BRAND, "app-icon.svg"), master_svg)

    sizes = set(HICOLOR) | set(APP_PNG_SIZES) | {size for _, size in ICNS_TYPES}
    png_paths = {}
    with tempfile.TemporaryDirectory() as tmp:
        for size in sorted(sizes):
            path = os.path.join(tmp, f"{size}.png")
            render(master_svg, size, path)
            png_paths[size] = path

        for size in APP_PNG_SIZES:
            shutil.copyfile(png_paths[size], os.path.join(BRAND_PNGS, f"app-icon-{size}.png"))
        for size in HICOLOR:
            shutil.copyfile(png_paths[size], os.path.join(ICONS, f"{size}x{size}.png"))
        shutil.copyfile(png_paths[512], os.path.join(ICONS, "icon.png"))
        shutil.copyfile(png_paths[1024], os.path.join(ICONS, "icon@2x.png"))
        write_ico(os.path.join(ICONS, "icon.ico"), png_paths, HICOLOR)
        write_icns(os.path.join(ICONS, "icon.icns"), png_paths)

        # Also export brand favicon.ico (16/32/48) from small-size cut favicon.svg
        fav_svg = os.path.join(BRAND, "favicon.svg")
        fav_pngs = {}
        for size in (16, 32, 48):
            p = os.path.join(tmp, f"fav-{size}.png")
            render(fav_svg, size, p)
            fav_pngs[size] = p
        write_ico(os.path.join(BRAND, "favicon.ico"), fav_pngs, (16, 32, 48))

    write_install_gif(os.path.join(ICONS, "install.gif"), master_svg)
    print("Exported assets/brand/cuminlang/png/*, favicon.ico, assets/icons/*, and install.gif")


if __name__ == "__main__":
    main()
