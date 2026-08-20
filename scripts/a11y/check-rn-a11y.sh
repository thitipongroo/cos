#!/usr/bin/env bash
# React Native accessibility gate for apps/mobile (WCAG 2.2 AA — spec §20.8).
#
# eslint-plugin-jsx-a11y cannot do this job: its rules are DOM-shaped (alt, htmlFor, ARIA roles on
# HTML elements) and simply do not fire on <TouchableOpacity> or <Pressable>. There is no
# maintained React Native equivalent, so this script is the substitute: any file that renders a
# tappable element must set at least one accessibility prop on something.
#
# THE BASELINE REACHED ZERO ON 2026-08-20, so this is now a clean gate: every file with a tappable
# element carries at least one accessibility prop, and the next one that does not fails the build.
# It began as a ratchet because 24 of the 50 such files had none (measured 2026-08-03) and failing
# on all 24 then would only have meant disabling the check. BASELINE stays in the script rather than
# becoming a bare `if n > 0` so the history below keeps its meaning and so a future bulk import has
# somewhere to record a temporary line rather than deleting the gate.
#
# 10 -> 0 on 2026-08-20 (PO asked for the remainder). The last ten were labelled by what each
# control IS, not "button": the project chips and the sync-queue filters became radio groups, the
# additional-role chips checkboxes (they are independent of one another, which is what separates
# them from the primary-role picker on the same screen), and every control that genuinely cannot act
# — resolve while offline, save with nothing changed, enrol before the request lands — carries
# `disabled`, with `busy` where a micro loader replaces the label. The notification row's unread dot
# is a colour a screen reader cannot see, so it moved into the words, one i18n key per case so Thai
# can order it its own way.
#
# 19 → 10 on 2026-08-19, in two parts. FOUR of them were already fixed by earlier work that never
# lowered this number — verified by running the check against 20e4ce40, which reports the same 15
# files as today's tree did before this pass. A ratchet that lags reality stops being a ratchet: it
# would have accepted four regressions in silence.
#
# The other five were labelled here: conflict-review, deliveries, invoices, orders and payments —
# the list screens whose rows had just been lifted into their own components, which is what made the
# tappables easy to name. Each row announces the thing it is (a payment reference, a PO number, the
# entity in conflict) rather than "button", carries `expanded` where a tap expands it, and `disabled`
# where the control genuinely cannot act (resolve is online-only; an invoice row with no id opens
# nothing). The status and PO chips became radios with a selected state, matching tasks.tsx.
#
# 20 → 19 on 2026-08-08: profile.tsx, when the mockup restructure added its MFA row, version line
# and privacy link — the logout button and theme chips were labelled in the same pass. The three
# screens added that day (directory, quick-actions) shipped with accessibility props from the start,
# which is why the number fell rather than held.
#
# 24 → 20 earlier the same day: SignaturePad.tsx (a new component that shipped with none — the pad now
# announces as a named image with a signed/unsigned state, since TalkBack has no gesture that can
# draw a signature, and the Clear button is a labelled button) and tasks.tsx (filter chips as a
# radio group, plus the AI Insight action and the detail screen's save/back buttons).
#
# Usage: scripts/a11y/check-rn-a11y.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Number of files with tappable elements but no accessibility prop, as of 2026-08-20.
# This may only ever be lowered. It is 0 — the gate is clean.
BASELINE=0

python3 - "$ROOT" "$BASELINE" <<'PY'
import pathlib
import re
import sys

root, baseline = pathlib.Path(sys.argv[1]), int(sys.argv[2])
src = root / 'apps' / 'mobile' / 'src'

# Tappable RN primitives. A file rendering any of these needs an accessible name and role for
# TalkBack/VoiceOver — without them a screen reader announces an unlabelled "button".
INTERACTIVE = re.compile(
    r'<(TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Pressable|Button|Switch|Slider)\b'
)
# Any of these counts. The check is deliberately per-file, not per-element: a per-element rule
# needs a JSX parser, and the goal here is to find screens nobody has considered at all.
A11Y = re.compile(r'\baccessibilityLabel\b|\baccessibilityRole\b|\baccessibilityHint\b|\baccessible=')

if not src.is_dir():
    print(f'  ✗ not found: {src}')
    sys.exit(1)

interactive, missing = [], []
for f in sorted(src.rglob('*.tsx')):
    body = f.read_text(encoding='utf-8')
    if INTERACTIVE.search(body):
        interactive.append(f)
        if not A11Y.search(body):
            missing.append(f.relative_to(root))

n = len(missing)
print(f'  .tsx scanned                  : {len(list(src.rglob("*.tsx")))}')
print(f'  with tappable elements        : {len(interactive)}')
print(f'  ...of those, no a11y prop     : {n} (baseline {baseline})')

if missing:
    print('\n  Files with no accessibility prop:')
    for f in missing:
        print(f'    {f}')

if n > baseline:
    print(f'\n  ✗ FAIL: {n} > baseline {baseline} — a new screen shipped without accessibility props.')
    print('    Add accessibilityLabel + accessibilityRole to its tappable elements.')
    sys.exit(1)

if n < baseline:
    print(f'\n  ✓ Improved: {n} < baseline {baseline}. Lower BASELINE in check-rn-a11y.sh to {n}.')
    sys.exit(0)

if n == 0:
    print(f'\n  ✓ PASSED: every file with a tappable element carries an accessibility prop.')
    sys.exit(0)

print(f'\n  ⚠ WARNING: {n} files still have no accessibility props (at baseline, not failing).')
sys.exit(0)
PY
