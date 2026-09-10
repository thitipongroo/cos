"""Compose an open navigation drawer out of two frames, using a MEASURED scroll offset.

`stitch-fullpage.py` cannot do this screen, and the reason is structural rather than a tuning
problem. It finds the scroll by correlating whole ROWS of one 1080px-wide frame against the next,
and on an open drawer almost none of a row moves: the right ~220px is the dimmed backdrop, the
profile card sits ABOVE the ScrollView, and the logout button is pinned below it. What travels is a
window in the middle of a 310dp panel — too little of each row for a global correlation to see. It
answers `bottom reached (scroll~0)` on the first comparison and stops, which is how the 2026-09-10
capture shipped a drawer cut off at its third group.

So this one does not guess the offset. The caller reads it off uiautomator — the y of one row
before and after the scroll — and passes it in. Three numbers, all measured:

    --scroll N      how far the list actually moved, in device pixels
    --region A B    the scrolling window: A is the first row below the static header,
                    B is the first row of the pinned footer

The result is  frame1[0:B]  +  frame2[B-N:B]  +  frame1[B:]  — the top state in full, then only the
N pixels frame2 revealed, then the pinned footer once. Nothing is duplicated and nothing is
interpolated: every output row is a row that was on the screen.

Usage:
    python stitch-drawer.py out.png top.png bottom.png --scroll 412 --region 640 2180
"""

import sys

import numpy as np
from PIL import Image


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2

    out_path, top_path, bottom_path = argv[0], argv[1], argv[2]

    scroll = None
    region: tuple[int, int] | None = None
    i = 3
    while i < len(argv):
        if argv[i] == '--scroll':
            scroll = int(argv[i + 1])
            i += 2
        elif argv[i] == '--region':
            region = (int(argv[i + 1]), int(argv[i + 2]))
            i += 3
        else:
            print(f'stitch-drawer: unknown argument {argv[i]}')
            return 2

    if scroll is None or region is None:
        print('stitch-drawer: --scroll and --region are both required')
        return 2

    top = np.array(Image.open(top_path).convert('RGB'))
    bottom = np.array(Image.open(bottom_path).convert('RGB'))
    if top.shape != bottom.shape:
        print(f'stitch-drawer: frames differ in size, {top.shape} vs {bottom.shape}')
        return 1

    height, width = top.shape[0], top.shape[1]
    _, foot = region

    # A scroll of zero means the list fitted; the top frame IS the whole drawer, and saying so is
    # better than emitting a one-frame file that claims to be stitched.
    if scroll <= 0:
        Image.fromarray(top).save(out_path)
        print(f'  drawer: list fits one viewport (scroll={scroll}) — wrote the single frame')
        return 0

    if not 0 < foot <= height:
        print(f'stitch-drawer: region foot {foot} is outside the frame height {height}')
        return 1
    if scroll > foot:
        print(f'stitch-drawer: scroll {scroll} exceeds the scrolling window {foot}')
        return 1

    revealed = bottom[foot - scroll : foot]
    composed = np.vstack([top[:foot], revealed, top[foot:]])

    Image.fromarray(composed).save(out_path)
    print(
        f'  drawer: composed {width}x{composed.shape[0]} '
        f'= top[0:{foot}] + revealed[{foot - scroll}:{foot}] + footer[{foot}:{height}] '
        f'(measured scroll {scroll}px)'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
