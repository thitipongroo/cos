// The ADR-099 register, asserted rather than trusted.
//
// This module holds the figures the EXECUTIVE screens print that no query in this platform produces.
// The product owner allowed them on ONE condition: that the whole set lives in one place, so it can
// be counted, reviewed, and removed together. That condition is only worth something if it keeps
// being true, and nothing but a test can keep it true — a new constant added here, or an existing
// one quietly repurposed, looks exactly like the rest of the file.
//
// So this suite asserts the CONTRACT, not the values. It does not care that compliance reads 92; it
// cares that every entry says what would have to exist before it can go, and that the set has not
// grown without someone deciding it should.

import {
  ACTIVE_PROJECTS_DELTA,
  ACTIVE_REGION,
  COMPLIANCE,
  COMPLIANCE_TREND,
  HOME_KPI_CONFIDENCE,
  PROJECT_LIST_FILTER,
  PROJECT_SAFETY_SCORES,
  PROJECT_SYNC_STATE,
  SAFE_MAN_HOURS,
  UNBUILT_MORE_TILES,
} from '../mockupFigures';

/** Every figure in the register, with the name ADR-099's own table uses. */
const REGISTER = [
  ['ACTIVE_PROJECTS_DELTA', ACTIVE_PROJECTS_DELTA],
  ['HOME_KPI_CONFIDENCE', HOME_KPI_CONFIDENCE],
  ['PROJECT_SYNC_STATE', PROJECT_SYNC_STATE],
  ['ACTIVE_REGION', ACTIVE_REGION],
  ['COMPLIANCE', COMPLIANCE],
  ['SAFE_MAN_HOURS', SAFE_MAN_HOURS],
  ['COMPLIANCE_TREND', COMPLIANCE_TREND],
  ['PROJECT_SAFETY_SCORES', PROJECT_SAFETY_SCORES],
  ['PROJECT_LIST_FILTER', PROJECT_LIST_FILTER],
  ['UNBUILT_MORE_TILES', UNBUILT_MORE_TILES],
] as const;

describe('mockupFigures — the ADR-099 register', () => {
  it('holds exactly the ten figures the decision covers', () => {
    // TEN was the number put to the product owner and the number ADR-099 tabulates. An eleventh
    // arriving without that table changing is a figure nobody approved.
    expect(REGISTER).toHaveLength(10);
  });

  it('says, for every figure, what would have to exist before it can be deleted', () => {
    // The removal condition is the only thing that makes this reversible rather than permanent. An
    // entry with an empty `needs` is a value with no way out.
    for (const [name, figure] of REGISTER) {
      expect(typeof figure.needs).toBe('string');
      // The name is in the loop variable so a failure names the offender in its own line.
      expect({ name, hasReason: figure.needs.length > 20 }).toEqual({ name, hasReason: true });
    }
  });

  it('carries a value for every figure', () => {
    for (const [name, figure] of REGISTER) {
      expect({ name, defined: figure.value !== undefined }).toEqual({ name, defined: true });
    }
  });

  it('keeps the six-month trend at six months, and the rankings at three projects', () => {
    // Both feed a fixed layout: six bars in the chart, three rows in the ranking. A length change
    // here silently changes the drawing.
    expect(COMPLIANCE_TREND.value).toHaveLength(6);
    expect(PROJECT_SAFETY_SCORES.value).toHaveLength(3);
  });

  it('names the three More tiles that reach no screen', () => {
    expect([...UNBUILT_MORE_TILES.value]).toEqual(['strategicBim', 'carbon', 'globalMap']);
  });

  it('keeps every trend bar and safety score inside the percentage range it is drawn in', () => {
    // The chart maps these straight to a `height: N%`, so a value outside 0–100 draws off the card.
    for (const height of COMPLIANCE_TREND.value) {
      expect(height).toBeGreaterThanOrEqual(0);
      expect(height).toBeLessThanOrEqual(100);
    }
    for (const score of PROJECT_SAFETY_SCORES.value) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('keeps the compliance grade and percentage together', () => {
    expect(COMPLIANCE.value.percent).toBeGreaterThanOrEqual(0);
    expect(COMPLIANCE.value.percent).toBeLessThanOrEqual(100);
    expect(COMPLIANCE.value.grade).not.toBe('');
    expect(COMPLIANCE.value.deltaLabel).not.toBe('');
  });
});
