// Display logic for the device trust score (ADR-081) — mockup 03_03_device_id_details.
//
// TWO RULES THIS FILE ENFORCES, both of which the mockup broke:
//
//   1. THE SCORE IS NOT CALLED AI UNTIL A MODEL IS SERVING. The mockup labels a static 98% "AI
//      Verified". ADR-081 permits that description only once a DeviceTrustModel has beaten the
//      rule-based baseline on PR-AUC, so the badge is derived from `scoredBy` and from nothing else.
//   2. A SCORE WITHOUT ITS DERIVATION IS THE SAME FAILURE, ONE DECIMAL PLACE BETTER. Every signal is
//      rendered with the band it landed in and the points it earned, so a low score is actionable
//      rather than oracular.

import type {
  AttestationVerdict,
  DeviceIntegrityLevel,
  DeviceTrustReport,
  TrustSignal,
} from '../api/devices';

/** Drives the gauge colour and the wording. Not a threshold the server knows about — presentation. */
export type TrustTone = 'STRONG' | 'FAIR' | 'WEAK';

/**
 * Bands for the gauge.
 *
 * WEAK starts at the cap value (30) on purpose: both of ADR-081's caps land a device exactly there,
 * so a capped device must never render as merely "fair". The boundary is where the rules already
 * draw a line rather than a round number chosen for the palette.
 */
export const TRUST_FAIR_MIN = 31;
export const TRUST_STRONG_MIN = 75;

export function trustTone(score: number): TrustTone {
  if (score >= TRUST_STRONG_MIN) return 'STRONG';
  if (score >= TRUST_FAIR_MIN) return 'FAIR';
  return 'WEAK';
}

/**
 * The badge above the gauge.
 *
 * `AI_VERIFIED` is reachable only when the server says a model produced the score. There is no
 * client-side override and no "looks good enough" path — the whole point of ADR-081's naming rule is
 * that the surface reports the mechanism it actually used.
 */
export function scorerBadge(
  report: Pick<DeviceTrustReport, 'scoredBy'>,
): 'RULE_BASED' | 'AI_VERIFIED' {
  return report.scoredBy === 'MODEL' ? 'AI_VERIFIED' : 'RULE_BASED';
}

export interface SignalRow extends TrustSignal {
  /** Points lost on this signal — what the reader can actually act on. */
  deficit: number;
  /** True when this signal alone triggered a cap, so the screen can say which finding held the score. */
  capping: boolean;
}

/**
 * The bands that trigger ADR-081's two caps.
 *
 * Kept as a list rather than re-deriving arithmetic from the score: the server already applied the
 * cap and reported `capped`, and a client that recomputed it would be a second implementation of the
 * rule — the exact drift the shared rules file exists to prevent.
 */
const CAPPING_BANDS = new Set(['FAILED', 'COMPROMISE_ON_RECORD']);

/**
 * Signals in the order the screen lists them, worst first.
 *
 * Worst-first because the reader's question is "why is this not 100", and a list that opens with
 * everything that passed buries the answer. Ties keep the server's order, which is the order the
 * rules file declares.
 */
export function signalRows(report: DeviceTrustReport): SignalRow[] {
  return report.signals
    .map((s) => ({
      ...s,
      deficit: s.maxPoints - s.points,
      capping: report.capped && CAPPING_BANDS.has(s.band),
    }))
    .sort((a, b) => b.deficit - a.deficit);
}

/**
 * Should the screen show the "held down by one finding" note?
 *
 * Only when the server says the total was capped AND a signal explains it. `capped` alone would be
 * enough for the sentence, but not for naming the cause, and a note that cannot name its cause is
 * the vagueness this screen exists to remove.
 */
export function cappingSignal(report: DeviceTrustReport): SignalRow | null {
  return signalRows(report).find((s) => s.capping) ?? null;
}

/**
 * What the "Root / Jailbreak Check" row says, from the attestation band.
 *
 * FOUR OUTCOMES, NOT TWO. The mockup shows a binary PASSED. The platform distinguishes:
 *   - PASSED       the platform vouched for device integrity
 *   - FAILED       the platform answered and the device did not pass
 *   - UNAVAILABLE  we asked and could not be told (no Play Services, verifier unconfigured)
 *   - NOT_ATTEMPTED an enrolment predating the attestation feature
 * Rendering the last two as "PASSED" would claim a check that never happened; rendering them as
 * "FAILED" would accuse a device of something nobody established.
 */
export type IntegrityRow = 'PASSED' | 'FAILED' | 'UNAVAILABLE' | 'NOT_ATTEMPTED';

export function integrityRow(band: string): IntegrityRow {
  if (band === 'FAILED') return 'FAILED';
  if (band === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (band === 'NOT_ATTEMPTED') return 'NOT_ATTEMPTED';
  return 'PASSED';
}

/**
 * Map a stored device row onto the same band names the scorer uses.
 *
 * The device list and the trust score arrive from two different endpoints and describe the same
 * attestation with two different shapes — one as `verdict` + `integrityLevel` columns, the other as
 * a band string. Mapping them to one vocabulary here means the screen has ONE translation table and
 * cannot label the same state two ways on the same page.
 */
export function attestationBand(device: {
  attestationVerdict: AttestationVerdict | null;
  integrityLevel: DeviceIntegrityLevel | null;
}): string {
  if (device.attestationVerdict === null) return 'NOT_ATTEMPTED';
  if (device.attestationVerdict === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (device.attestationVerdict === 'FAILED') return 'FAILED';
  // PASSED with no tier is iOS: App Attest attests the app on genuine Apple hardware and emits no
  // device tier at all — an absence of the concept, not a weak answer.
  return device.integrityLevel ? `PASSED_${device.integrityLevel}` : 'PASSED_NO_TIER';
}
