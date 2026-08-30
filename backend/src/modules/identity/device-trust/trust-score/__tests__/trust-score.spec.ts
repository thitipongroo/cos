// The rule-based trust scorer (ADR-081).
//
// Two things are being protected here. First, the properties that make a security score honest: caps
// are ceilings and not floors, an absent signal abstains rather than accuses, and the scorer can
// never label itself AI. Second, PARITY — the golden vectors at the bottom are the same file the
// Python baseline runs in mlops/tests/test_device_trust_baseline.py, so a change to either
// implementation that is not matched by the other turns one of the two suites red. Without that, the
// PR-AUC promotion gate would be comparing the model against a baseline nobody is served.

import {
  RULES_VERSION,
  asnBand,
  attestationBand,
  enrolmentAgeBand,
  recencyBand,
  revocationBand,
  scoreDevice,
  type TrustFeatures,
} from '../trust-score';
import RULES from '../device-trust-rules.v1.json';
import GOLDEN from '../device-trust-golden.json';

const CLEAN: TrustFeatures = {
  attestationVerdict: 'PASSED',
  integrityLevel: 'STRONG',
  enrolmentAgeDays: 90,
  lastSeenDaysAgo: 0,
  compromiseOnRecord: false,
  nonCompromiseRevocationDaysAgo: null,
  distinctAsnCount: 1,
  asnObservations: 10,
};

const with_ = (over: Partial<TrustFeatures>): TrustFeatures => ({ ...CLEAN, ...over });

describe('attestation band', () => {
  it('separates “never asked” from “asked, no answer”', () => {
    // The migration comment is explicit that these score differently: an enrolment predating the
    // attestation feature is a fact about the platform's history, while UNAVAILABLE is a fact about
    // this device right now. Collapsing them would make an old-but-honest device indistinguishable
    // from one whose platform integrity is currently unknowable.
    expect(attestationBand(null, null)).toBe('NOT_ATTEMPTED');
    expect(attestationBand('UNAVAILABLE', null)).toBe('UNAVAILABLE');
    expect(RULES.bands.attestation.NOT_ATTEMPTED).toBeGreaterThan(
      RULES.bands.attestation.UNAVAILABLE,
    );
  });

  it('reads a passing iOS attestation as PASSED_NO_TIER, not as a weak answer', () => {
    // App Attest attests the app on genuine Apple hardware and emits no device tier at all. Scoring
    // that absence as a failure would mark every iPhone in the fleet down for a field Apple has
    // never returned.
    expect(attestationBand('PASSED', null)).toBe('PASSED_NO_TIER');
    expect(RULES.bands.attestation.PASSED_NO_TIER).toBeGreaterThan(
      RULES.bands.attestation.PASSED_DEVICE,
    );
    expect(RULES.bands.attestation.PASSED_NO_TIER).toBeLessThan(
      RULES.bands.attestation.PASSED_STRONG,
    );
  });

  it('maps each Android tier to its own band', () => {
    expect(attestationBand('PASSED', 'STRONG')).toBe('PASSED_STRONG');
    expect(attestationBand('PASSED', 'DEVICE')).toBe('PASSED_DEVICE');
    expect(attestationBand('PASSED', 'BASIC')).toBe('PASSED_BASIC');
  });

  it('scores FAILED at zero whatever tier accompanies it', () => {
    expect(attestationBand('FAILED', 'STRONG')).toBe('FAILED');
    expect(RULES.bands.attestation.FAILED).toBe(0);
  });
});

describe('recency band', () => {
  it('draws both boundaries inclusively', () => {
    expect(recencyBand(7)).toBe('SEEN_WITHIN_FRESH_WINDOW');
    expect(recencyBand(8)).toBe('SEEN_WITHIN_TRUST_WINDOW');
    expect(recencyBand(30)).toBe('SEEN_WITHIN_TRUST_WINDOW');
    expect(recencyBand(31)).toBe('STALE');
  });

  it('uses the same 30 days as the §20.6.1 sliding trust window', () => {
    expect(RULES.thresholds.trustWindowDays).toBe(30);
  });
});

describe('enrolment age band', () => {
  it('treats each threshold as an inclusive lower bound', () => {
    expect(enrolmentAgeBand(90)).toBe('AT_LEAST_90_DAYS');
    expect(enrolmentAgeBand(89)).toBe('AT_LEAST_30_DAYS');
    expect(enrolmentAgeBand(30)).toBe('AT_LEAST_30_DAYS');
    expect(enrolmentAgeBand(29)).toBe('AT_LEAST_7_DAYS');
    expect(enrolmentAgeBand(7)).toBe('AT_LEAST_7_DAYS');
    expect(enrolmentAgeBand(6)).toBe('UNDER_7_DAYS');
    expect(enrolmentAgeBand(0)).toBe('UNDER_7_DAYS');
  });

  it('costs a new device points without capping it', () => {
    // A device enrolled an hour ago has earned nothing yet — which is not the same as being
    // suspicious. It should be the only thing keeping an otherwise perfect enrolment off 100.
    const fresh = scoreDevice(with_({ enrolmentAgeDays: 0 }));
    expect(fresh.capped).toBe(false);
    expect(fresh.score).toBe(100 - RULES.bands.enrolmentAge.AT_LEAST_90_DAYS);
  });
});

describe('revocation band', () => {
  it('grades a confirmed compromise apart from ordinary churn', () => {
    expect(revocationBand(true, null)).toBe('COMPROMISE_ON_RECORD');
    expect(revocationBand(false, 20)).toBe('NON_COMPROMISE_RECENT');
    expect(revocationBand(false, null)).toBe('CLEAN');
  });

  it('lets a non-compromise revocation age out of the window', () => {
    expect(revocationBand(false, 90)).toBe('NON_COMPROMISE_RECENT');
    expect(revocationBand(false, 91)).toBe('CLEAN');
  });

  it('grades differently from the TRAINING label, deliberately', () => {
    // Migration 20260805000001 counts only COMPROMISED as a positive label, because labelling
    // ordinary churn as an attack would teach the model that retiring a phone looks like one. A
    // score answers a different question — risk right now — so a handset reported lost last week is
    // worth 10 points here while contributing nothing to the label.
    expect(revocationBand(false, 7)).toBe('NON_COMPROMISE_RECENT');
    expect(RULES.bands.revocationHistory.NON_COMPROMISE_RECENT).toBeGreaterThan(
      RULES.bands.revocationHistory.COMPROMISE_ON_RECORD,
    );
  });
});

describe('ASN stability band', () => {
  it('abstains below the observation floor', () => {
    expect(asnBand(1, 2)).toBe('INSUFFICIENT_DATA');
    expect(asnBand(1, 3)).toBe('SINGLE_ASN');
  });

  it('abstains — never accuses — when no GeoLite2 database is configured', () => {
    // Every lookup returns null in that deployment, so the distinct count is 0 with any number of
    // observations. Scoring that as instability would mark an entire air-gapped fleet down for an
    // operator's licence decision (ADR-080).
    expect(asnBand(0, 500)).toBe('INSUFFICIENT_DATA');
    expect(RULES.bands.asnStability.INSUFFICIENT_DATA).toBe(RULES.bands.asnStability.TWO_ASNS);
  });

  it('counts up through the roaming bands', () => {
    expect(asnBand(2, 10)).toBe('TWO_ASNS');
    expect(asnBand(3, 10)).toBe('THREE_TO_FOUR_ASNS');
    expect(asnBand(4, 10)).toBe('THREE_TO_FOUR_ASNS');
    expect(asnBand(5, 10)).toBe('FIVE_OR_MORE_ASNS');
  });

  it('never caps, because roaming between sites is the job', () => {
    const roaming = scoreDevice(with_({ distinctAsnCount: 9, asnObservations: 40 }));
    expect(roaming.capped).toBe(false);
    expect(roaming.score).toBeGreaterThan(RULES.caps.ATTESTATION_FAILED);
  });
});

describe('caps', () => {
  it('holds a rooted device down however long it has been trusted', () => {
    const rooted = scoreDevice(with_({ attestationVerdict: 'FAILED', integrityLevel: null }));
    expect(rooted.score).toBe(RULES.caps.ATTESTATION_FAILED);
    expect(rooted.capped).toBe(true);
  });

  it('holds down a pristine device belonging to a compromised account', () => {
    const tainted = scoreDevice(with_({ compromiseOnRecord: true }));
    expect(tainted.score).toBe(RULES.caps.COMPROMISE_ON_RECORD);
    expect(tainted.capped).toBe(true);
  });

  it('is a ceiling, never a floor', () => {
    // The single most likely misreading of a cap. A device failing every signal at once must not be
    // LIFTED to 30 by the same rule that holds a familiar rooted phone down to it.
    const worst = scoreDevice({
      attestationVerdict: 'FAILED',
      integrityLevel: null,
      enrolmentAgeDays: 0,
      lastSeenDaysAgo: 400,
      compromiseOnRecord: true,
      nonCompromiseRevocationDaysAgo: 1,
      distinctAsnCount: 9,
      asnObservations: 60,
    });
    expect(worst.score).toBeLessThan(RULES.caps.ATTESTATION_FAILED);
    // …and `capped` is false, because nothing was held back — the signals really did sum this low.
    // Reporting true would tell the screen that one finding was responsible for a total that every
    // one of them produced together.
    expect(worst.capped).toBe(false);
  });

  it('reports capped:false when nothing was held back', () => {
    expect(scoreDevice(CLEAN).capped).toBe(false);
  });
});

describe('the shape the screen renders', () => {
  it('returns every signal with its points out of the points available', () => {
    // A bare number on a security screen cannot be acted on or argued with — the same failure as the
    // static 98%, one decimal place better.
    const { signals } = scoreDevice(CLEAN);
    expect(signals.map((s) => s.signal)).toEqual([
      'attestation',
      'recency',
      'enrolmentAge',
      'revocationHistory',
      'asnStability',
    ]);
    for (const s of signals) {
      expect(s.points).toBeLessThanOrEqual(s.maxPoints);
      expect(typeof s.band).toBe('string');
    }
  });

  it('has signal maxima summing to exactly the maximum score', () => {
    const { signals, maxScore } = scoreDevice(CLEAN);
    expect(signals.reduce((sum, s) => sum + s.maxPoints, 0)).toBe(maxScore);
  });

  it('scores out of the 100 the spec fixes, not out of whatever the rules file says', () => {
    // master:5615 fixes `score: int 0..100`. The assertion above reads maxScore from the same
    // rules JSON it sums the signals out of, so halving every signal AND maxScore together keeps it
    // green while the rendered score quietly stops being a percentage — and the mobile bands
    // (trustTone: STRONG at >= 80, FAIR at >= 50) are absolute numbers that would then mean
    // something else. 100 is the one number here that comes from the spec rather than from us.
    expect(scoreDevice(CLEAN).maxScore).toBe(100);
  });

  it('never calls itself AI', () => {
    // ADR-081 Naming: the surface may describe the score as AI-derived only once a model has been
    // promoted. Claiming it over an if-chain is the same class of dishonesty as the static 98%.
    expect(scoreDevice(CLEAN).scoredBy).toBe('RULES');
  });

  it('stamps the rules version, so a rendered score can be tied to the rules that produced it', () => {
    expect(scoreDevice(CLEAN).rulesVersion).toBe(RULES_VERSION);
    expect(RULES_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─── Parity with the training-time baseline ──────────────────────────────────

describe('golden vectors', () => {
  it('is the same rules version the vectors were computed against', () => {
    expect(GOLDEN.rulesVersion).toBe(RULES_VERSION);
  });

  it.each(GOLDEN.vectors.map((v) => [v.name, v] as const))('%s', (_name, vector) => {
    const result = scoreDevice(vector.features as TrustFeatures);
    expect(result.score).toBe(vector.expected.score);
    expect(result.capped).toBe(vector.expected.capped);
    expect(Object.fromEntries(result.signals.map((s) => [s.signal, s.band]))).toEqual({
      attestation: vector.expected.bands.attestation,
      recency: vector.expected.bands.recency,
      enrolmentAge: vector.expected.bands.enrolmentAge,
      revocationHistory: vector.expected.bands.revocationHistory,
      asnStability: vector.expected.bands.asnStability,
    });
  });

  it('covers every band of every signal at least once', () => {
    // Parity is only worth what the vectors cover. A band no vector exercises is a band the Python
    // baseline could get wrong in silence.
    const seen = new Set<string>();
    for (const v of GOLDEN.vectors) {
      for (const band of Object.values(v.expected.bands)) seen.add(band);
    }
    const all = Object.values(RULES.bands).flatMap((group) => Object.keys(group));
    expect([...all].filter((band) => !seen.has(band))).toEqual([]);
  });
});
