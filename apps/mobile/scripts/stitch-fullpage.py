#!/usr/bin/env python
# Stitch scrolling viewport screenshots into one full-page image.
# Fixed top bar (rows 0:TOP) and bottom nav (rows BOT:H) are kept once. The scrolling content region
# (rows TOP:BOT) is de-duplicated PAIRWISE: for each next shot, find how far the content scrolled vs the
# previous shot by matching a large fixed top window (robust against the repeating grid/cards), then
# append only the newly revealed rows.
# Usage: python stitch-fullpage.py OUT.png TOP BOT shot0.png shot1.png ...
import sys
import numpy as np
from PIL import Image

out_path = sys.argv[1]
TOP = int(sys.argv[2])
BOT = int(sys.argv[3])
shot_paths = sys.argv[4:]

shots = [np.asarray(Image.open(p).convert('RGB')) for p in shot_paths]
H, W = shots[0].shape[:2]
top_bar = shots[0][:TOP]
# Bottom nav (fixed) is taken from the LAST, fully-scrolled shot: there the rows just above the nav are
# empty page background, so the nav's elevation shadow falls on nothing and no dark "seam" band appears
# (on a mid-scroll shot that same shadow would darken a card and bleed into the stitch).
bottom_nav = shots[-1][BOT:]
content_h = BOT - TOP

MAX_SCROLL = 1400
WIN = content_h - MAX_SCROLL          # fixed comparison window (rows), large → no periodic false match
def cont(s): return s[TOP:BOT]
def gray_ds(a): return a.mean(axis=2)[::3, ::4]

prev = cont(shots[0])
base = prev.copy()
prev_g = gray_ds(prev)
win_rows = WIN // 3                    # window height in downsampled rows
for idx, s in enumerate(shots[1:], 1):
    c = cont(s)
    c_g = gray_ds(c)
    top_win = c_g[:win_rows]           # top WIN rows of the new shot (downsampled)
    best_scroll, best_sad = 0, None
    for scroll in range(0, MAX_SCROLL + 1, 3):
        sr = scroll // 3
        seg = prev_g[sr:sr + win_rows]
        if seg.shape[0] != win_rows:
            break
        sad = np.abs(seg - top_win).mean()
        if best_sad is None or sad < best_sad:
            best_sad, best_scroll = sad, scroll
    if best_scroll < 8:
        print(f"  shot {idx}: bottom reached (scroll~{best_scroll}, sad={best_sad:.1f}) — skip")
        prev, prev_g = c, c_g
        continue
    new_part = c[content_h - best_scroll:]
    base = np.vstack([base, new_part])
    print(f"  shot {idx}: scroll={best_scroll} sad={best_sad:.1f} +{new_part.shape[0]}px")
    prev, prev_g = c, c_g

final = np.vstack([top_bar, base, bottom_nav])
Image.fromarray(final).save(out_path)
print(f"stitched {len(shots)} shots -> {out_path}  {final.shape[1]}x{final.shape[0]}")
