// A screen is named once — and a top-level tab screen is named by its TAB (spec §32.7 Mobile App Shell).
//
// WHY THIS TEST EXISTS. The rule had been followed by all 21 tab screens since the 2026-07-31 shell
// rework, but was written down only in `docs/screens/android/README.md` — a per-capture narrative —
// and not in §32.7 where the TopBar / MobileNav / Breadcrumb standards live. Three of the four Site
// Worker screens then shipped with an in-content page title, and the reasoning that produced them was
// sound: the mockups draw a title, ADR-085 makes mockups authoritative for style, and the only nearby
// sentence in §32.7 ("a role screen never renders its own header") sits under TopBar and reads as
// being about the bar. A convention that only exists in prose gets re-broken; this makes it fail.
//
// SOURCE SCAN, NOT A RENDER TEST — deliberately, for the same reason as headingStutter.spec.ts: a
// screen with a redundant title renders perfectly. The defect is in what the screen DRAWS, and only
// reading the source can see it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TAB_ROUTES } from '../../lib/routeRegistry';

const SCREENS = join(__dirname, '..', '..', 'app', '(app)');

/**
 * A page title is hero-sized text rendering a TRANSLATED STRING.
 *
 * Both halves are load-bearing. Hero (28px, the §32.7 scale step for page titles) alone is not
 * enough: `home.tsx` renders its KPI figures at that size and those are values, not names — the
 * first version of this test failed on them. Requiring `{t('…')}` in the same element separates a
 * screen NAME from a big number, because a name is always a translated constant and a metric never is.
 */
function pageTitleOffenders(source: string): string[] {
  const heroStyles = [
    ...source.matchAll(/^\s*(\w+):\s*\{[^}]*fontSize:\s*typography\.hero\.fontSize/gm),
  ].map((m) => m[1]!);

  return heroStyles.filter((style) =>
    // <Text style={[styles.title, …]}>{t('…')}</Text> — the style reference and the t() call in one
    // element. `[^<]*` keeps the match inside a single tag rather than spanning the whole file.
    new RegExp(`style=\\{[^}]*styles\\.${style}\\b[^<]*\\{t\\('`).test(source),
  );
}

describe('tab screens draw no in-content page title (§32.7)', () => {
  it.each([...TAB_ROUTES])('%s', (route) => {
    const source = readFileSync(join(SCREENS, `${route}.tsx`), 'utf8');
    // The route is carried into the expectation so a failure names the screen, not just the array.
    expect({ route, offenders: pageTitleOffenders(source) }).toEqual({ route, offenders: [] });
  });

  // Guards the guard. Without this, a regex that silently stopped matching — a renamed token, a
  // reformatted style block — would make every assertion above pass vacuously, which is exactly how
  // the rule was lost the first time. The fixture is the real shape the Site Worker screens shipped;
  // `tasks.list.title` is a plain string here and no longer an i18n key (the four title keys were
  // deleted with the titles), which is fine because nothing in this file resolves it.
  it('flags a screen that does draw a page title', () => {
    const offending = `
      <View style={styles.header}>
        <Text style={[styles.title, { color: p.text }]}>{t('tasks.list.title')}</Text>
      </View>
      const styles = StyleSheet.create({
        title: { fontSize: typography.hero.fontSize, fontFamily: fontFamily.bold },
      });
    `;
    expect(pageTitleOffenders(offending)).toEqual(['title']);
  });

  it('does not flag a hero-sized VALUE, which names a metric rather than the screen', () => {
    const kpi = `
      <Text style={styles.kpiValue}>{value}</Text>
      const styles = StyleSheet.create({
        kpiValue: { fontSize: typography.hero.fontSize, fontFamily: fontFamily.bold },
      });
    `;
    expect(pageTitleOffenders(kpi)).toEqual([]);
  });
});
