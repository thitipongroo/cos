// A ratchet on hardcoded `borderRadius` numbers: the count may fall, never rise.
//
// Mobile had no radius token until 2026-08-05, so every component invented its own value — 253
// literals across 56 files, using 21 distinct numbers for what is a five-step scale. The 2026-08-06
// sweep took that to 43 by fixing what the spec actually rules on (buttons `md`, cards and inputs
// `lg`, list rows `md`) and by tokenising the literals that already sat on the scale.
//
// A second pass on 2026-08-06 took it from 43 to 28: the ten square icon plates moved onto
// `plateRadius()` (a rule — a quarter of the side — rather than nine hand-picked numbers), the
// progress-bar fills became the documented `999` capsule marker, and one full-width card that the
// first sweep missed because its style is named for its subject rather than its shape was corrected.
//
// WHY A COUNT RATHER THAN A BAN. What remains is circles: the radius is half the element's width,
// which §32.7 says is a shape and not a step on this scale, and a ban would force them onto a scale
// they do not belong to. One named exception is documented in place — the bottom-nav active-tab
// highlight at 20, which is neither a square plate nor a capsule.
//
// So this holds the line instead: new code uses `radius.*`, and anyone who adds a literal has to
// come here and justify raising the number. Same shape as the repo's jscpd duplication ratchet.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..');

/** Measured 2026-08-06, after the sweep; 28 → 27 on 2026-08-09 when the voice FAB's fixed 28
 * became the 999 capsule marker — its diameter is a prop now, and a fixed radius stops being a
 * circle as soon as a caller passes anything but 56. 27 → 26 on 2026-08-17: <LoadingState />'s
 * `iconPlate` style, whose `borderRadius: 28` was the plate's own literal, was deleted when the
 * plate became a <SkeletonBar> that takes its radius as a prop. Lower this when literals are
 * removed; never raise it. */
const CEILING = 26;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'e2e') out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && entry.name !== 'tokens.ts') {
      out.push(full);
    }
  }
  return out;
}

function literals(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(\w+):\s*\{[^{}]*?borderRadius:\s*(\d+)/g)) {
      // 999 is the documented "make this a capsule" marker, not a scale value (§32.7).
      if (match[2] === '999') continue;
      found.push(`${file.slice(SRC.length + 1)}  ${match[1]} = ${match[2]}`);
    }
  }
  return found;
}

describe('hardcoded borderRadius ratchet (spec 32 §32.7)', () => {
  it('never grows', () => {
    const found = literals();
    // Asserted as a LIST rather than a number so the failure names the offending sites. Whoever
    // trips this needs to see which literal they added, not that a count moved from 43 to 44.
    expect(found.length <= CEILING ? [] : found).toEqual([]);
  });

  it('has a ceiling that matches reality, so the ratchet keeps tightening', () => {
    // If the count drops below the ceiling and nobody lowers it, the slack silently becomes room for
    // new literals. Failing here is the reminder to lower CEILING in the same commit.
    expect(literals().length).toBe(CEILING);
  });
});
