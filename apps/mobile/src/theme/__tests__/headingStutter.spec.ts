// A <SectionLabel /> and the card directly under it must not say the same thing.
//
// Eight pairs shipped this way — the label and the card's own `title` were the SAME i18n key — so the
// transparency screens read "HOW LONG THIS IS KEPT / How long this is kept". The mockups state a
// heading once (PO approval 2026-08-06), and both elements carry accessibilityRole="header", so a
// screen reader announced the duplicate twice in a row.
//
// This is a source scan rather than a render test on purpose: the defect is in what a screen PASSES,
// and it is invisible to a renderer — a card with a redundant title renders perfectly.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCREENS = join(__dirname, '..', '..', 'app', '(app)');

// <SectionLabel>{t('X')}</SectionLabel> … title={t('Y')} — flagged only when X === Y, and only within
// the next 400 characters, which is the same card rather than a later one in the section.
const PAIR =
  /<SectionLabel>\{t\('([^']+)'\)\}<\/SectionLabel>[\s\S]{0,400}?title=\{t\('([^']+)'\)\}/g;

describe('transparency screens: a heading is stated once', () => {
  const files = readdirSync(SCREENS).filter(
    (f) => f.startsWith('transparency') && f.endsWith('.tsx'),
  );

  it('scans every transparency screen', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s repeats no section label as a card title', (file) => {
    const src = readFileSync(join(SCREENS, file), 'utf8');
    const stutters: string[] = [];
    for (const m of src.matchAll(PAIR)) {
      if (m[1] === m[2]) stutters.push(m[1]);
    }
    expect(stutters).toEqual([]);
  });
});
