#!/usr/bin/env python3
"""Print the metric-matched fallback @font-face rules styles/core/shared.css carries.

The site's three webfonts load with font-display: swap (pages/_app.tsx). Until each
arrives, text is set in a local font; unless that stand-in takes the same room, the
page relays itself when the webfont lands (filter chips, nav links: a layout shift on
every first visit). A stand-in scaled with size-adjust to the webfont's average advance
width, with its ascent, descent and line gap overridden to the webfont's, takes the
same room to within a pixel.

Widths are the letters and space weighted by English letter frequency, the weighting
the metric-matching tools (and next/font's adjustFontFallback) use. Rajdhani is matched
on its capitals: the chrome that moves on a first paint (nav links, chips, tabs and
headings) is set in caps, and Rajdhani's capitals are far narrower than its lowercase
(78% of Arial's against 93%), so one stand-in cannot fit both. Run it
after a webfont or its fontsource package changes, and paste the output over the
rules in styles/core/shared.css:

    python3 -m venv .venv && .venv/bin/pip install fonttools brotli
    .venv/bin/python scripts/audits/font-fallback-metrics.py

The local fonts it measures against are macOS's Arial and Courier New; Helvetica Neue
and Liberation Sans/Mono, the other src: local() candidates, share Arial's and Courier
New's metrics by design.
"""
from pathlib import Path
import sys

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fontTools is needed: pip install fonttools brotli")

FREQ = {'a': 0.0668, 'b': 0.0122, 'c': 0.0228, 'd': 0.0348, 'e': 0.1039, 'f': 0.0182, 'g': 0.0165, 'h': 0.0499, 'i': 0.057, 'j': 0.0012,
        'k': 0.0063, 'l': 0.0329, 'm': 0.0197, 'n': 0.0552, 'o': 0.0614, 'p': 0.0158, 'q': 0.0008, 'r': 0.0489, 's': 0.0517, 't': 0.0741,
        'u': 0.0225, 'v': 0.008, 'w': 0.0193, 'x': 0.0012, 'y': 0.0162, 'z': 0.0006, ' ': 0.1832}
FONTS = Path('node_modules/@fontsource')
SYSTEM = Path('/System/Library/Fonts/Supplemental')
UPPER = {char.upper(): frequency for char, frequency in FREQ.items()}
# The family, the file whose metrics stand for it (the weight most of its text uses), the
# local font measured against, the src: local() list the rule names, and the letters the
# width is matched on.
SPEC = [
    ('Rajdhani', FONTS / 'rajdhani/files/rajdhani-latin-600-normal.woff', SYSTEM / 'Arial.ttf', "local('Arial'), local('Helvetica Neue'), local('Liberation Sans')", UPPER),
    ('Inter', FONTS / 'inter/files/inter-latin-500-normal.woff', SYSTEM / 'Arial.ttf', "local('Arial'), local('Helvetica Neue'), local('Liberation Sans')", FREQ),
    ('JetBrains Mono', FONTS / 'jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff', SYSTEM / 'Courier New.ttf', "local('Courier New'), local('Liberation Mono')", FREQ),
]


def average_width(font: TTFont, letters: dict[str, float]) -> float:
    cmap = font.getBestCmap()
    metrics = font['hmtx'].metrics
    upm = font['head'].unitsPerEm
    total = weight = 0.0
    for char, frequency in letters.items():
        glyph = cmap.get(ord(char))
        if glyph and glyph in metrics:
            total += metrics[glyph][0] / upm * frequency
            weight += frequency
    return total / weight


def vertical(font: TTFont) -> tuple[float, float, float]:
    upm = font['head'].unitsPerEm
    os2 = font['OS/2']
    if os2.fsSelection & (1 << 7):  # USE_TYPO_METRICS: the browser uses the typo metrics
        return os2.sTypoAscender / upm, abs(os2.sTypoDescender) / upm, os2.sTypoLineGap / upm
    hhea = font['hhea']
    return hhea.ascent / upm, abs(hhea.descent) / upm, hhea.lineGap / upm


def main() -> None:
    for family, path, against, src, letters in SPEC:
        font, local = TTFont(path), TTFont(against)
        size = average_width(font, letters) / average_width(local, letters)
        ascent, descent, gap = vertical(font)
        print(f"@font-face {{ font-family: '{family} Fallback'; src: {src}; size-adjust: {size * 100:.2f}%; "
              f"ascent-override: {ascent / size * 100:.2f}%; descent-override: {descent / size * 100:.2f}%; line-gap-override: {gap / size * 100:.0f}%; }}")


if __name__ == '__main__':
    main()
