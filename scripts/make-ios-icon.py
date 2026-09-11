"""Builds the iOS app icon from the same artwork the web app uses.

Run: python3 scripts/make-ios-icon.py

Two things make this more than a resize.

An iOS app icon may not carry an alpha channel, and it must be full-bleed:
iOS applies its own squircle mask, wider than the rounded corners the artwork
was drawn with. Pasted in as-is, the white page those corners sit on shows as
pale slivers around the mask.

So the page is found and repainted with the ground it interrupts. The ground is
a 45 degree gradient — the top edge and the left edge read the same colour, and
so do the other two — so it is recovered by averaging along each anti-diagonal
rather than assumed to be a two-stop linear ramp.
"""

from collections import deque
from pathlib import Path

from PIL import Image

SOURCE = Path("public/icon-512.png")
TARGET = Path("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
SIZE = 1024

# The brand indigo sits near luma 90 and the page at 255. The antialiased ramp
# between them runs the whole way, so "is it white" stops several pixels early
# and leaves a fringe; 150 clears the ramp.
PAGE_LUMA = 150
GROW = 3


def luma(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def is_ground(c):
    """The indigo-to-purple ground, as opposed to the lettering on top of it."""
    r, g, b = c
    return b > 140 and b > r + 40 and b > g + 40 and r < 140


def find_page(px, w, h):
    """The page is the pale region connected to the corners.

    Flood filled rather than derived from a corner radius, so it finds whatever
    shape the artwork was actually drawn with — and so it never reaches the
    white underline bar in the middle, which touches no corner.
    """
    page = [[False] * w for _ in range(h)]
    queue = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if luma(px[x, y]) > PAGE_LUMA:
            page[y][x] = True
            queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not page[ny][nx] and luma(px[nx, ny]) > PAGE_LUMA:
                page[ny][nx] = True
                queue.append((nx, ny))

    for _ in range(GROW):
        grown = [row[:] for row in page]
        for y in range(h):
            for x in range(w):
                if not page[y][x]:
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        grown[ny][nx] = True
        page = grown
    return page


def ground_ramp(px, w, h, page):
    """The ground's colour for every value of x + y."""
    samples = {}
    for y in range(h):
        for x in range(w):
            if page[y][x]:
                continue
            colour = px[x, y]
            if is_ground(colour):
                samples.setdefault(x + y, []).append(colour)
    ramp = {}
    for diagonal, colours in samples.items():
        n = len(colours)
        ramp[diagonal] = (
            sum(c[0] for c in colours) // n,
            sum(c[1] for c in colours) // n,
            sum(c[2] for c in colours) // n,
        )
    return ramp


def main():
    image = Image.open(SOURCE).convert("RGB")
    w, h = image.size
    px = image.load()

    page = find_page(px, w, h)
    ramp = ground_ramp(px, w, h, page)
    if not ramp:
        raise SystemExit(f"{SOURCE} has no recognisable gradient ground")
    known = sorted(ramp)

    def ground_at(diagonal):
        # Anti-diagonals crossed end to end by lettering have no sample of their
        # own; the nearest that does is within a pixel or two of the right colour.
        if diagonal in ramp:
            return ramp[diagonal]
        return ramp[min(known, key=lambda k: abs(k - diagonal))]

    for y in range(h):
        for x in range(w):
            if page[y][x]:
                px[x, y] = ground_at(x + y)

    icon = image.resize((SIZE, SIZE), Image.LANCZOS)
    if icon.mode != "RGB":
        raise SystemExit("an iOS app icon may not carry an alpha channel")

    out = icon.load()
    corners = [out[0, 0], out[SIZE - 1, 0], out[0, SIZE - 1], out[SIZE - 1, SIZE - 1]]
    if any(luma(c) > 130 for c in corners):
        raise SystemExit(f"the page still shows in a corner: {corners}")

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    icon.save(TARGET)
    print(f"wrote {TARGET} ({SIZE}x{SIZE}, no alpha, corners {corners})")


if __name__ == "__main__":
    main()
