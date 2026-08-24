// Device trust score display logic (ADR-081).
//
// The mockup rendered a static 98% labelled "AI Verified" over nothing at all. These tests hold the
// two properties that replaced it: the badge follows the server's `scoredBy` and can never be talked
// into saying AI, and the score always arrives with the derivation that makes it contestable.

import {
  TRUST_FAIR_MIN,
  TRUST_STRONG_MIN,
  attestationBand,
  cappingSignal,
  integrityRow,
  scorerBadge,
  signalRows,
  trustTone,
} from '../trustScore';
import type { DeviceTrustReport, TrustSignal } from '../../api/devices';

const signal = (over: Partial<TrustSignal>): TrustSignal => ({
  signal: 'attestation',
  band: 'PASSED_STRONG',
  points: 40,
  maxPoints: 40,
  ...over,
});

const report = (over: Partial<DeviceTrustReport> = {}): DeviceTrustReport => ({
  deviceId: 'd1',
  score: 82,
  maxScore: 100,
  capped: false,
  scoredBy: 'RULES',
  rulesVersion: '1.0.0',
  signals: [
    signal({}),
    signal({ signal: 'recency', band: 'SEEN_WITHIN_FRESH_WINDOW', points: 15, maxPoints: 15 }),
    signal({ signal: 'enrolmentAge', band: 'UNDER_7_DAYS', points: 0, maxPoints: 10 }),
    signal({ signal: 'revocationHistory', band: 'CLEAN', points: 20, maxPoints: 20 }),
    signal({ signal: 'asnStability', band: 'INSUFFICIENT_DATA', points: 11, maxPoints: 15 }),
  ],
  ...over,
});

describe('trustTone', () => {
  it('puts a capped device in WEAK, not FAIR', () => {
    // Both of ADR-081's caps land a device on exactly 30. If FAIR started at 30, a device the
    // platform found rooted would render in the same colour as an ordinary imperfect one.
    expect(trustTone(30)).toBe('WEAK');
    expect(TRUST_FAIR_MIN).toBe(31);
  });

  it('draws its boundaries where the constants say', () => {
    expect(trustTone(TRUST_FAIR_MIN)).toBe('FAIR');
    expect(trustTone(TRUST_STRONG_MIN - 1)).toBe('FAIR');
    expect(trustTone(TRUST_STRONG_MIN)).toBe('STRONG');
    expect(trustTone(100)).toBe('STRONG');
    expect(trustTone(0)).toBe('WEAK');
  });
});

describe('scorerBadge', () => {
  it('says AI only when a MODEL produced the score', () => {
    expect(scorerBadge({ scoredBy: 'MODEL' })).toBe('AI_VERIFIED');
  });

  it('says rule-based while the rules are serving — there is no override', () => {
    // ADR-081 Naming. This is the assertion that keeps the mockup's "AI VERIFIED" from returning as
    // a default, a fallback, or a nicer-looking else-branch.
    expect(scorerBadge({ scoredBy: 'RULES' })).toBe('RULE_BASED');
  });
});

describe('signalRows', () => {
  it('lists the biggest deficit first, because that is the reader’s question', () => {
    const rows = signalRows(report());
    expect(rows[0]!.signal).toBe('enrolmentAge');
    expect(rows[0]!.deficit).toBe(10);
    expect(rows.at(-1)!.deficit).toBe(0);
  });

  it('returns every signal, including the ones that scored full marks', () => {
    expect(signalRows(report())).toHaveLength(5);
  });

  it('marks no signal as capping when the server says nothing was capped', () => {
    expect(signalRows(report()).every((r) => !r.capping)).toBe(true);
  });

  it('marks the capping signal when the server says the total was held down', () => {
    const rooted = report({
      capped: true,
      score: 30,
      signals: [signal({ band: 'FAILED', points: 0 }), ...report().signals.slice(1)],
    });
    expect(signalRows(rooted).find((r) => r.capping)!.band).toBe('FAILED');
  });
});

describe('cappingSignal', () => {
  it('names the finding that held the score down', () => {
    const tainted = report({
      capped: true,
      score: 30,
      signals: [
        signal({}),
        signal({
          signal: 'revocationHistory',
          band: 'COMPROMISE_ON_RECORD',
          points: 0,
          maxPoints: 20,
        }),
      ],
    });
    expect(cappingSignal(tainted)!.signal).toBe('revocationHistory');
  });

  it('is null when nothing was capped, so the screen shows no note it cannot explain', () => {
    expect(cappingSignal(report())).toBeNull();
  });

  it('is null when the server says capped but no band explains it', () => {
    // Defensive: a future rules version could add a cap this client does not know. A note that
    // cannot name its cause is the vagueness this screen exists to remove, so it is not shown.
    expect(cappingSignal(report({ capped: true }))).toBeNull();
  });
});

describe('integrityRow', () => {
  it('keeps four outcomes where the mockup had two', () => {
    // "We asked and could not be told" and "we never asked" are not PASSED — that would claim a
    // check that did not happen — and they are not FAILED either, which would accuse a device of
    // something nobody established.
    expect(integrityRow('FAILED')).toBe('FAILED');
    expect(integrityRow('UNAVAILABLE')).toBe('UNAVAILABLE');
    expect(integrityRow('NOT_ATTEMPTED')).toBe('NOT_ATTEMPTED');
  });

  it.each(['PASSED_STRONG', 'PASSED_DEVICE', 'PASSED_BASIC', 'PASSED_NO_TIER'])(
    'reads %s as PASSED',
    (band) => {
      expect(integrityRow(band)).toBe('PASSED');
    },
  );
});

describe('attestationBand', () => {
  it('gives the device row and the score row one shared vocabulary', () => {
    // The two arrive from different endpoints in different shapes. Without this, the same
    // attestation could be labelled two ways on the same page.
    expect(attestationBand({ attestationVerdict: 'PASSED', integrityLevel: 'STRONG' })).toBe(
      'PASSED_STRONG',
    );
    expect(attestationBand({ attestationVerdict: 'PASSED', integrityLevel: 'DEVICE' })).toBe(
      'PASSED_DEVICE',
    );
    expect(attestationBand({ attestationVerdict: 'PASSED', integrityLevel: 'BASIC' })).toBe(
      'PASSED_BASIC',
    );
  });

  it('reads a passing iOS attestation as PASSED_NO_TIER', () => {
    // App Attest emits no device tier at all — an absence of the concept, not a weak answer.
    expect(attestationBand({ attestationVerdict: 'PASSED', integrityLevel: null })).toBe(
      'PASSED_NO_TIER',
    );
  });

  it('keeps “never asked” apart from “asked, no answer” and from “did not pass”', () => {
    expect(attestationBand({ attestationVerdict: null, integrityLevel: null })).toBe(
      'NOT_ATTEMPTED',
    );
    expect(attestationBand({ attestationVerdict: 'UNAVAILABLE', integrityLevel: null })).toBe(
      'UNAVAILABLE',
    );
    expect(attestationBand({ attestationVerdict: 'FAILED', integrityLevel: null })).toBe('FAILED');
  });
});
