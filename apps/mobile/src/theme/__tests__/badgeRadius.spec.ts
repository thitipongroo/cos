// Every status pill / badge / chip in the app must be `radius.xl` (spec 32 §32.7).
//
// WHY A TEST RATHER THAN A CONVENTION. This ruling has now been re-litigated three times. The
// original code had no radius token at all, so 38 badge-ish styles each invented a value — 3, 4, 6,
// 8, 9, 10, 11, 16 and 999 were all in use simultaneously. Two rounds of hand-fixing missed
// `heroBadge`, which is why the hub still shipped a square "IN USE" next to five rounded ones.
//
// The mockups cannot settle it: counted 2026-08-06, 153 of the 226 `code.html` files under
// `mockup/mobile` keep `rounded-full` at 9999px and 52 override it to 0.75rem = 12px. §32.7 rules
// for one token because at the 18–26px heights these badges actually have, the two are within a
// pixel of each other — the disagreement is in the config, not on the screen.
//
// So this reads the real style sheets. A new badge with an invented radius fails here instead of
// reaching a screenshot review.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { radius } from '../tokens';

const SRC = join(__dirname, '..', '..');

/**
 * Styles whose name says "badge" but which are circles by construction: the radius is half the
 * width, so they are not on the scale at all (§32.7's closing paragraph). Each is listed with the
 * dimension that makes it a circle, so the exemption stays checkable rather than becoming a
 * dumping ground.
 */
const CIRCLES: Readonly<Record<string, string>> = {
  extBadgeDot: '22px dot on an external-app tile',
  chipDot: '8px state dot inside a sync-queue chip',
  statusBadgeDot: '6px dot beside a user status',
  bellBadge: '16px unread-count dot on the top-bar bell',
};

/**
 * Styles whose name matches the pattern but which are not badges. `formatChip` is a segmented
 * BUTTON (JSON / CSV) and takes the button radius; `sourceChip` is the inline provenance tag, which
 * the identity mockup draws with a bare `rounded` (2px) — `01_00_identity_contact_details:191`.
 */
const NOT_BADGES: Readonly<Record<string, number>> = {
  formatChip: radius.md,
  sourceChip: radius.sm,
};

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'e2e') out.push(...tsxFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

type Found = { file: string; style: string; value: string };

function badgeStyles(): Found[] {
  const found: Found[] = [];
  for (const file of tsxFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    const pattern = /(\w*(?:[Bb]adge|[Pp]ill|[Cc]hip|[Tt]ag)\w*):\s*\{([^{}]*)\}/g;
    for (const match of source.matchAll(pattern)) {
      const [, style = '', body = ''] = match;
      const value = /borderRadius:\s*([\w.]+)/.exec(body)?.[1];
      if (value !== undefined) found.push({ file: file.slice(SRC.length + 1), style, value });
    }
  }
  return found;
}

describe('badge radius (spec 32 §32.7)', () => {
  const found = badgeStyles();

  it('finds the badge styles it is meant to be guarding', () => {
    // Guards the guard: a regex that silently stops matching would make every assertion below pass
    // vacuously, which is the failure mode that lets a rule rot without anyone noticing.
    expect(found.length).toBeGreaterThan(20);
  });

  it('gives every status pill, badge and chip radius.xl', () => {
    const offenders = found
      .filter((f) => CIRCLES[f.style] === undefined && NOT_BADGES[f.style] === undefined)
      .filter((f) => f.value !== 'radius.xl')
      .map((f) => `${f.file}  ${f.style} = ${f.value}`);
    expect(offenders).toEqual([]);
  });

  it('never draws a badge as a 999 capsule', () => {
    // Called out separately because 999 is the one wrong value that LOOKS right on a short pill —
    // it survives a screenshot review and only shows up on the taller ones.
    const capsules = found
      .filter((f) => CIRCLES[f.style] === undefined)
      .filter((f) => f.value === '999')
      .map((f) => `${f.file}  ${f.style}`);
    expect(capsules).toEqual([]);
  });

  it('holds the two documented non-badges at their own values', () => {
    for (const [style, expected] of Object.entries(NOT_BADGES)) {
      const hits = found.filter((f) => f.style === style);
      expect(hits.length).toBeGreaterThan(0);
      for (const hit of hits) expect(hit.value).toBe(`radius.${nameOf(expected)}`);
    }
  });
});

function nameOf(value: number): string {
  const entry = Object.entries(radius).find(([, v]) => v === value);
  if (entry === undefined) throw new Error(`${value} is not on the radius scale`);
  return entry[0];
}
