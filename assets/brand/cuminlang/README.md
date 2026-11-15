# CuminLang — Brand Identity

A tailored geometric **C** aperture embracing a 30° cumin-seed kernel, paired with a warm editorial **Fraunces** wordmark.

## Concept

- **Cumin Aperture (`C` + seed kernel)**: A 45°-cut geometric **C** opens toward a 30°-tilted cumin seed (`vesica piscis`), representing *CuminLang* ("language with warmth, seasoning, and lived context") without language-app clichés (no owls, globes, chat bubbles, or play buttons).
- **Editorial Contrast**: The minimalist circular-arc mark pairs with self-hosted **Fraunces** (SIL OFL, `wght 650, opsz 36`), balancing timeless literary warmth with desktop studio precision.
- **16 px Survivability**: Built with 8 clean anchors (`r_out = 96`, `r_in = 50`, 46-unit stroke) plus an optical small-size `favicon.svg` cut so counters and seed clearance remain crisp down to `16 × 16`.

## Colour Palette

| Name | HEX | RGB | CMYK (approx) | Role | Contrast |
|---|---|---|---|---|---|
| Deep Warm Ink | `#181614` | `24, 22, 20` | `0, 8, 17, 91` | Primary mark & light-mode text | `16.7 : 1` on Paper |
| Warm Paper | `#FAF7F2` | `250, 247, 242` | `0, 1, 3, 2` | Dark-mode reversed mark & light plate | `16.7 : 1` on Ink |
| Cumin Amber | `#CE7818` | `206, 120, 24` | `0, 42, 88, 19` | Primary seed accent (light surfaces) | `3.32 : 1` on `#FFFFFF`, `3.11 : 1` on Paper, `5.43 : 1` on Ink |
| Luminous Saffron | `#E09428` | `224, 148, 40` | `0, 34, 82, 12` | Dark-plate & dark-mode seed accent | `7.25 : 1` on Ink |

## Files

```text
mark.svg                Primary colour symbol (256 × 256)
mark-reverse.svg        Dark-mode symbol (thinned ~2.5% for irradiation compensation)
mark-black.svg          One-colour ink symbol
mark-white.svg          One-colour reversed paper symbol
mark-square.svg         Square avatar slot (128 × 128)
favicon.svg             Small-size UI/web cut (64 × 64)
favicon-dark.svg        Dark-background favicon cut
favicon.ico             16 / 32 / 48 multi-size ICO
wordmark.svg            Horizontal lockup (symbol + outlined Fraunces wordmark)
wordmark-reverse.svg    Horizontal lockup for dark backgrounds
wordmark-only.svg       Outlined Fraunces wordmark alone
app-icon.svg            1024 × 1024 master desktop icon (#plate + #glyph)
app-icon-light.svg      Light-plate app icon variant
app-icon-mono.svg       Monochrome app icon variant
png/app-icon-*.png      1024 / 512 / 256 / 128 / 64 / 32 / 16 deliverables
board.png               Identity presentation board with product mockups
tools/build.py          Generates all SVG masters from exact math + Fraunces font
tools/export_app_icons.py  Exports assets/icons/*, PNGs, icon.ico, icon.icns, install.gif
```

## Usage & Guardrails

- **Clear space**: Maintain at least `0.25 ×` mark height (`64` units on a `256` canvas) of unobstructed breathing room around standalone marks and lockups.
- **Minimum size**: Standalone symbol ≥ `16 px` (use `favicon.svg` below `24 px`); horizontal lockup ≥ `96 px` wide.
- **Do not**: stretch, rotate, recolour the outer `C` in amber on light backgrounds, replace the outlined wordmark with live `<text>`, or place dropshadows/gradients over flat masters.

## Regenerating Assets

```sh
python3 assets/brand/cuminlang/tools/build.py
python3 assets/brand/cuminlang/tools/export_app_icons.py
node scripts/build-mobile-icons.mjs && pnpm run build:mobile
```

## Notes & Checks Pending

- **Trademark search**: No formal trademark clearance has been run (Nice Classes 9 & 41); perform a search before commercial registration.
- **Native OS icon rendering**: `.icns` and `.ico` are programmatically assembled; verify visually on macOS Finder/Dock and Windows Explorer/Squirrel installer during release testing.
