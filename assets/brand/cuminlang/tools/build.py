#!/usr/bin/env python3
"""Build all CuminLang brand SVG masters (zero <text>, exact geometry + Fraunces outlines).

Exports:
- mark.svg / mark-reverse.svg / mark-black.svg / mark-white.svg / mark-square.svg
- favicon.svg / favicon-dark.svg
- wordmark.svg / wordmark-reverse.svg / wordmark-only.svg
- app-icon.svg / app-icon-light.svg / app-icon-mono.svg
"""
import math
import os
import re

import uharfbuzz as hb
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
BRAND_DIR = os.path.dirname(TOOLS_DIR)
ROOT = os.path.abspath(os.path.join(BRAND_DIR, "..", "..", ".."))
FONT_WOFF = os.path.join(ROOT, "src/frontend/styles/fonts/fraunces/latin-01.woff2")
CACHE_DIR = os.path.join(TOOLS_DIR, "cache")

# Approved CuminLang Palette (all > 3.1:1 on #FAF7F2 and > 5.4:1 on #181614)
INK = "#181614"          # Deep Warm Ink
PAPER = "#FAF7F2"        # Warm Archival Paper
AMBER = "#CE7818"        # Primary Cumin Amber (3.32:1 on white, 3.11:1 on paper, 5.43:1 on ink)
AMBER_DARK = "#E09428"   # Luminous Saffron tint for dark app-icon plate (7.25:1 on ink)


def round_svg_path(d: str, decimals: int = 2) -> str:
    """Round floats in SVG path data to 0-2 decimals cleanly."""
    def repl(match):
        val = round(float(match.group(0)), decimals)
        if abs(val - round(val)) < 1e-6:
            return str(int(round(val)))
        return f"{val:.{decimals}f}".rstrip("0").rstrip(".")

    return re.sub(r"-?\d+\.\d+", repl, d)


def outline_fraunces(text: str, wght: int = 650, opsz: int = 36, tracking: float = -0.02, target_cap: float = 112.0):
    """Instantiate self-hosted Fraunces OFL and return outlined SVG path + bounds."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    raw_ttf = os.path.join(CACHE_DIR, "Fraunces-var.ttf")
    if not os.path.exists(raw_ttf):
        f = TTFont(FONT_WOFF)
        f.flavor = None
        f.save(raw_ttf)

    inst_ttf = os.path.join(CACHE_DIR, f"Fraunces-{wght}-{opsz}.ttf")
    if not os.path.exists(inst_ttf):
        f = TTFont(raw_ttf)
        instantiateVariableFont(f, {"wght": wght, "opsz": opsz}, inplace=True)
        f.save(inst_ttf)

    tt = TTFont(inst_ttf)
    upem = tt["head"].unitsPerEm
    cap = tt["OS/2"].sCapHeight or int(upem * 0.7)
    scale = target_cap / cap

    with open(inst_ttf, "rb") as fp:
        face = hb.Face(fp.read())
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb.Font(face), buf, {"kern": True, "liga": True})

    order, gs = tt.getGlyphOrder(), tt.getGlyphSet()
    x, cmds = 0.0, []
    bounds = BoundsPen(gs)
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        gname = order[info.codepoint]
        t = Transform(scale, 0, 0, -scale, (x + pos.x_offset) * scale, 0)
        pen = SVGPathPen(gs)
        gs[gname].draw(TransformPen(pen, t))
        if pen.getCommands():
            cmds.append(round_svg_path(pen.getCommands(), 1))
        gs[gname].draw(TransformPen(bounds, t))
        x += pos.x_advance + tracking * upem
    return " ".join(cmds), bounds.bounds


def cumin_aperture_paths(cx=120.0, cy=128.0, r_out=96.0, r_in=50.0, mouth_deg=45.0,
                         seed_cx=205.0, seed_cy=127.0, seed_half_len=39.0, seed_r=47.0, seed_tilt_deg=30.0):
    """Exact geometry for Cumin Aperture mark: concentric C with ±45° cut + 30° cumin-seed vesica."""
    ang = math.radians(mouth_deg)
    ca, sa = math.cos(ang), math.sin(ang)
    x_to, y_to = cx + r_out * ca, cy - r_out * sa
    x_ti, y_ti = cx + r_in * ca, cy - r_in * sa
    x_bi, y_bi = cx + r_in * ca, cy + r_in * sa
    x_bo, y_bo = cx + r_out * ca, cy + r_out * sa

    c_d = round_svg_path(
        f"M {x_to:.2f} {y_to:.2f} "
        f"A {r_out:.2f} {r_out:.2f} 0 1 0 {x_bo:.2f} {y_bo:.2f} "
        f"L {x_bi:.2f} {y_bi:.2f} "
        f"A {r_in:.2f} {r_in:.2f} 0 1 1 {x_ti:.2f} {y_ti:.2f} Z"
    )

    tilt = math.radians(seed_tilt_deg)
    dx = seed_half_len * math.sin(tilt)
    dy = -seed_half_len * math.cos(tilt)
    p1x, p1y = seed_cx + dx, seed_cy + dy
    p2x, p2y = seed_cx - dx, seed_cy - dy

    seed_d = round_svg_path(
        f"M {p1x:.2f} {p1y:.2f} "
        f"A {seed_r:.2f} {seed_r:.2f} 0 0 1 {p2x:.2f} {p2y:.2f} "
        f"A {seed_r:.2f} {seed_r:.2f} 0 0 1 {p1x:.2f} {p1y:.2f} Z"
    )
    return c_d, seed_d


def write_svg(rel_path: str, width: int, height: int, title: str, body: str, viewbox: str = None):
    vb = viewbox or f"0 0 {width} {height}"
    path = os.path.join(BRAND_DIR, rel_path)
    content = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{width}" height="{height}" '
        f'role="img" aria-labelledby="title">\n'
        f'  <title id="title">{title}</title>\n'
        f'{body}\n'
        f'</svg>\n'
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


def main():
    c_std, seed_std = cumin_aperture_paths()
    # Thinned reversed version (~2.5% stroke reduction to compensate light-on-dark irradiation)
    c_rev, seed_rev = cumin_aperture_paths(
        r_out=95.0, r_in=51.5,
        seed_half_len=38.0, seed_r=47.5,
    )
    # Small-size favicon cut: slightly bolder ring + wider throat & boosted seed (+10%) for 16px pixel clarity
    c_fav, seed_fav = cumin_aperture_paths(
        cx=116.0, cy=128.0, r_out=100.0, r_in=48.0, mouth_deg=48.0,
        seed_cx=206.0, seed_cy=127.0, seed_half_len=43.0, seed_r=51.0,
    )

    # 1. Standalone Symbol Variants
    write_svg(
        "mark.svg", 256, 256, "CuminLang",
        f'  <g id="symbol">\n    <path fill="{INK}" d="{c_std}"/>\n    <path fill="{AMBER}" d="{seed_std}"/>\n  </g>',
    )
    write_svg(
        "mark-reverse.svg", 256, 256, "CuminLang",
        f'  <g id="symbol">\n    <path fill="{PAPER}" d="{c_rev}"/>\n    <path fill="{AMBER_DARK}" d="{seed_rev}"/>\n  </g>',
    )
    write_svg(
        "mark-black.svg", 256, 256, "CuminLang",
        f'  <g id="symbol">\n    <path fill="{INK}" d="{c_std}"/>\n    <path fill="{INK}" d="{seed_std}"/>\n  </g>',
    )
    write_svg(
        "mark-white.svg", 256, 256, "CuminLang",
        f'  <g id="symbol">\n    <path fill="{PAPER}" d="{c_rev}"/>\n    <path fill="{PAPER}" d="{seed_rev}"/>\n  </g>',
    )
    write_svg(
        "mark-square.svg", 128, 128, "CuminLang",
        f'  <g id="symbol" transform="translate(8,8) scale(0.4375)">\n    <path fill="{INK}" d="{c_std}"/>\n    <path fill="{AMBER}" d="{seed_std}"/>\n  </g>',
    )

    # 2. Favicons (small-size cut with wider aperture)
    write_svg(
        "favicon.svg", 64, 64, "CuminLang",
        f'  <g id="symbol" transform="scale(0.25)">\n    <path fill="{INK}" d="{c_fav}"/>\n    <path fill="{AMBER}" d="{seed_fav}"/>\n  </g>',
    )
    write_svg(
        "favicon-dark.svg", 64, 64, "CuminLang",
        f'  <g id="symbol" transform="scale(0.25)">\n    <path fill="{PAPER}" d="{c_fav}"/>\n    <path fill="{AMBER_DARK}" d="{seed_fav}"/>\n  </g>',
    )

    # 3. Horizontal Combination Lockup (wordmark.svg & wordmark-reverse.svg) & Wordmark-Only
    wm_d, (wx0, wy0, wx1, wy1) = outline_fraunces("CuminLang", wght=650, opsz=36, tracking=-0.02, target_cap=116.0)
    wm_only_w = int(math.ceil(wx1 - wx0 + 32.0))
    wm_only_x = 16.0 - wx0
    wm_only_y = 128.0 - (wy0 + wy1) / 2.0
    write_svg(
        "wordmark-only.svg", wm_only_w, 256, "CuminLang",
        f'  <g id="wordmark" transform="translate({wm_only_x:.1f},{wm_only_y:.1f})">\n    <path fill="{INK}" d="{wm_d}"/>\n  </g>',
    )

    # Horizontal Lockup: symbol scaled to ~1.5x cap height (optically balanced)
    sym_scale = 0.70
    sym_tx, sym_ty = 20.0, 38.4
    wm_x = 20.0 + 256.0 * sym_scale + 22.0 - wx0
    wm_y = 128.0 - (wy0 + wy1) / 2.0
    lockup_w = int(math.ceil(wm_x + wx1 + 24.0))

    write_svg(
        "wordmark.svg", lockup_w, 256, "CuminLang",
        f'  <g id="symbol" transform="translate({sym_tx:.1f},{sym_ty:.1f}) scale({sym_scale:.4f})">\n'
        f'    <path fill="{INK}" d="{c_std}"/>\n'
        f'    <path fill="{AMBER}" d="{seed_std}"/>\n'
        f'  </g>\n'
        f'  <g id="wordmark" transform="translate({wm_x:.1f},{wm_y:.1f})">\n'
        f'    <path fill="{INK}" d="{wm_d}"/>\n'
        f'  </g>',
    )
    write_svg(
        "wordmark-reverse.svg", lockup_w, 256, "CuminLang",
        f'  <g id="symbol" transform="translate({sym_tx:.1f},{sym_ty:.1f}) scale({sym_scale:.4f})">\n'
        f'    <path fill="{PAPER}" d="{c_rev}"/>\n'
        f'    <path fill="{AMBER_DARK}" d="{seed_rev}"/>\n'
        f'  </g>\n'
        f'  <g id="wordmark" transform="translate({wm_x:.1f},{wm_y:.1f})">\n'
        f'    <path fill="{PAPER}" d="{wm_d}"/>\n'
        f'  </g>',
    )

    # 4. Application Icons (1024 canvas, plate + glyph contract for export_app_icons.py & build-mobile-icons.mjs)
    # Plate: 832x832 centered at (96, 96), rx=185 (~22.2% corner radius); symbol ~64% of plate
    plate_xy, plate_sz, plate_rx = 96, 832, 185
    icon_scale = 2.52  # 256 * 2.52 = 645px glyph (~77.5% of 832 plate, optically centered ~62% visual span)
    icon_tx = 512.0 - 128.0 * icon_scale
    icon_ty = 512.0 - 128.0 * icon_scale

    def write_app_icon(fname: str, plate_fill: str, c_fill: str, seed_fill: str, c_d: str, seed_d: str):
        body = (
            f'  <rect id="plate" x="{plate_xy}" y="{plate_xy}" width="{plate_sz}" height="{plate_sz}" '
            f'rx="{plate_rx}" fill="{plate_fill}"/>\n'
            f'  <g id="glyph" transform="translate({icon_tx:.1f},{icon_ty:.1f}) scale({icon_scale:.4f})">\n'
            f'    <path fill="{c_fill}" d="{c_d}"/>\n'
            f'    <path fill="{seed_fill}" d="{seed_d}"/>\n'
            f'  </g>'
        )
        write_svg(fname, 1024, 1024, "CuminLang", body)

    write_app_icon("app-icon.svg", INK, PAPER, AMBER_DARK, c_rev, seed_rev)
    write_app_icon("app-icon-light.svg", PAPER, INK, AMBER, c_std, seed_std)
    write_app_icon("app-icon-mono.svg", INK, PAPER, PAPER, c_rev, seed_rev)

    print("Generated all CuminLang brand SVGs in", BRAND_DIR)


if __name__ == "__main__":
    main()
