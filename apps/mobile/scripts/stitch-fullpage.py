#!/usr/bin/env python
# Stitch scrolling viewport screenshots into one full-page image.
# Fixed top bar (rows 0:TOP) and bottom nav (rows BOT:H) are kept once. The scrolling content region
# (rows TOP:BOT) is de-duplicated PAIRWISE: for each next shot, find how far the content scrolled vs the
# previous shot by matching a large fixed top window (robust against the repeating grid/cards), then
# append only the newly revealed rows.
#
# A FLOATING OVERLAY (a FAB) is fixed to the viewport but sits INSIDE the scrolling band, so it is
# not covered by the TOP/BOT rule and it lands in every shot — the Finance dashboard's first stitch
# came out with three "+" buttons down the page. Pass `--fab X0,Y0,X1,Y1` (viewport pixels, from
# uiautomator) and it is treated the same way the nav is: erased from the scrolling content and
# drawn ONCE over the finished page.
#
# Erased, not painted over: the page behind the button is genuinely visible in the NEXT shot, at
# `y - scroll`, because the button is fixed and the content moved. So the repair copies real pixels
# from a real screenshot rather than inventing background.
#
# A STICKY HEADER inside the page is the same problem seen from the other end: rows that look like
# content but never move. The Site Worker's task list pins a project bar and a filter row above a
# FlatList, and the scroll measurement — which matches the TOP of the current shot against the
# previous one — locked onto those unmoving rows and reported scroll≈0 for every shot. The run then
# declared "bottom reached" six times and wrote a single viewport out as though it were the whole
# page. Pass `--sticky N` (pixels, measured from TOP) and those rows join the fixed top bar: kept
# once, and excluded from both the comparison and the appended content.
#
# Usage: python stitch-fullpage.py OUT.png TOP BOT [--fab X0,Y0,X1,Y1] [--sticky N] shot0.png ...
import sys
import numpy as np
from PIL import Image

argv = sys.argv[1:]
fab = None
sticky = 0
if '--sticky' in argv:
    i = argv.index('--sticky')
    sticky = int(argv[i + 1])
    del argv[i:i + 2]

if '--fab' in argv:
    i = argv.index('--fab')
    fab = tuple(int(v) for v in argv[i + 1].split(','))
    del argv[i:i + 2]

out_path = argv[0]
TOP = int(argv[1])
BOT = int(argv[2])
shot_paths = argv[3:]

shots = [np.asarray(Image.open(p).convert('RGB')) for p in shot_paths]
H, W = shots[0].shape[:2]
# Everything that does not scroll, kept once: the app's top bar plus any sticky header below it.
CTOP = TOP + sticky
top_bar = shots[0][:CTOP]
# Bottom nav (fixed) is taken from the LAST, fully-scrolled shot: there the rows just above the nav are
# empty page background, so the nav's elevation shadow falls on nothing and no dark "seam" band appears
# (on a mid-scroll shot that same shadow would darken a card and bleed into the stitch).
bottom_nav = shots[-1][BOT:]
content_h = BOT - CTOP

MAX_SCROLL = 1400
WIN = content_h - MAX_SCROLL          # fixed comparison window (rows), large → no periodic false match
def cont(s): return s[CTOP:BOT]
def gray_ds(a): return a.mean(axis=2)[::3, ::4]

def measure(prev_g, c_g):
    """How far the page scrolled between two shots, in pixels (0 = did not move)."""
    top_win = c_g[:win_rows]
    best_scroll, best_sad = 0, None
    for scroll in range(0, MAX_SCROLL + 1, 3):
        sr = scroll // 3
        seg = prev_g[sr:sr + win_rows]
        if seg.shape[0] != win_rows:
            break
        sad = np.abs(seg - top_win).mean()
        if best_sad is None or sad < best_sad:
            best_sad, best_scroll = sad, scroll
    return best_scroll, best_sad


win_rows = WIN // 3                    # window height in downsampled rows

if fab is not None:
    x0, y0, x1, y1 = fab
    grays = [gray_ds(cont(s)) for s in shots]
    scrolls = [0] + [measure(grays[i - 1], grays[i])[0] for i in range(1, len(shots))]
    # The LAST shot that actually contributes rows keeps its button — that is the one that ends up
    # at the bottom of the stitched page, which is where a floating button belongs. Every earlier
    # contributor is repaired from its successor.
    #
    # Not the other way round (repair everything, then paste the button back): the page behind the
    # button in that last shot is genuinely never photographed. The view is already at the bottom,
    # so no scroll ever moves that content out from under it, and no screenshot contains those
    # pixels. Repairing there would mean inventing them.
    fab_h = y1 - y0
    repaired = 0
    for i in range(len(shots)):
        # ROW BY ROW, and from ANY later shot — not just the next one. A trailing scroll step can be
        # SHORTER than the button (75px against a 115px button), in which case the immediate
        # successor's own button still covers part of the same band; the rows it cannot supply are
        # taken from the shot after that, and so on. Skipping the whole rectangle when the next step
        # was short is what left a crescent of a second button under the first.
        shot = shots[i].copy()
        fixed_rows = 0
        for row in range(y0, y1):
            total = 0
            for j in range(i + 1, len(shots)):
                total += scrolls[j]
                src = row - total
                # The row must be on-screen in shot j and not behind shot j's own button.
                if src < CTOP:
                    break
                if y0 <= src < y1:
                    continue
                shot[row, x0:x1] = shots[j][src, x0:x1]
                fixed_rows += 1
                break
        shots[i] = shot
        if fixed_rows:
            repaired += 1
    print(f"  fab: erased from {repaired} shot(s); drawn once from the bottom-of-page shot")

prev = cont(shots[0])
base = prev.copy()
prev_g = gray_ds(prev)
for idx, s in enumerate(shots[1:], 1):
    c = cont(s)
    c_g = gray_ds(c)
    best_scroll, best_sad = measure(prev_g, c_g)
    if best_scroll < 8:
        print(f"  shot {idx}: bottom reached (scroll~{best_scroll}, sad={best_sad:.1f}) — skip")
        prev, prev_g = c, c_g
        continue
    overlap = content_h - best_scroll
    # Feather the join: base's bottom `feather` rows are the SAME content as the current shot's
    # rows [overlap-feather:overlap], so cross-fade from the base (previous-shot) pixels into the
    # current-shot pixels over that band. Without this, the hard concatenation leaves a faint grey
    # seam line wherever a card/text sits exactly on the cut (e.g. across a role card).
    feather = int(min(48, overlap, base.shape[0]))
    if feather > 0:
        band_base = base[-feather:].astype(np.float32)
        band_cur = c[overlap - feather:overlap].astype(np.float32)
        alpha = np.linspace(0.0, 1.0, feather, dtype=np.float32)[:, None, None]
        base[-feather:] = (band_base * (1.0 - alpha) + band_cur * alpha).astype(np.uint8)
    new_part = c[overlap:]
    base = np.vstack([base, new_part])
    print(f"  shot {idx}: scroll={best_scroll} sad={best_sad:.1f} +{new_part.shape[0]}px (feather {feather})")
    prev, prev_g = c, c_g

final = np.vstack([top_bar, base, bottom_nav])

# The button, drawn ONCE, from the bottom-of-page shot — with the band directly above it, which in
# that shot is plain page background.
#
# The band is why this is a paste and not just an erase. The last scroll step can be SHORTER than the
# button (87px against 115px on this page), so a few of its rows are behind a button in every single
# screenshot and exist nowhere to be copied from. Painting the real background from above the button
# over that band covers the leftover crescent with pixels that were genuinely photographed.
if fab is not None:
    x0, y0, x1, y1 = fab
    pad = min(fab_h, y0 - CTOP)
    patch = shots[-1][y0 - pad:y1, x0:x1]
    gap = BOT - y1                      # the button's clearance above the nav, as on the device
    fy1 = final.shape[0] - (H - BOT) - gap
    final[fy1 - patch.shape[0]:fy1, x0:x1] = patch
    print(f"  fab: composited at rows {fy1 - patch.shape[0]}:{fy1}")
Image.fromarray(final).save(out_path)
print(f"stitched {len(shots)} shots -> {out_path}  {final.shape[1]}x{final.shape[0]}")
