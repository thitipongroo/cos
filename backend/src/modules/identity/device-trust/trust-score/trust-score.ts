// The rule-based device trust scorer (ADR-081) — the thing behind the mockup's "98%".
//
// ADR-081 replaced a static 98% with two commitments: a real, explainable score from day one, and a
// model that may only replace it by beating it. This file is the first. It is NOT scaffolding to be
// deleted when the model arrives — it is the control the model is measured against, so it has to
// exist and keep working either way (ADR-081 Consequences: "the rule-based scorer must be maintained
// as a permanent path").
//
// PURE, AND DELIBERATELY SO. Every input arrives as a plain number, boolean or enum, already derived
// from the database by TrustScoreService. Nothing here touches a database, a clock or an environment
// variable, which is what lets the same vectors run against the Python baseline in the training
// pipeline — see device-trust-golden.json.
//
// THE NUMBERS ARE NOT IN THIS FILE. They live in device-trust-rules.v1.json, which the Python
// baseline reads too. ADR-081 gates promotion on beating "the rule-based baseline"; if the baseline
// used in that comparison were a second, hand-copied implementation, the gate would be measuring the
// model against something nobody is served, and would pass or fail for reasons unrelated to the
// product. One file, two readers (product-owner decision, 2026-08-05).
//
// EVERY BAND IS RETURNED, not just the total. A number alone on a security screen cannot be acted on
// or argued with — it is the same failure as the 98%, one decimal place better. The caller renders
// each signal with the points it earned out of the points available.

import RULES from './device-trust-rules.v1.json';
import type { AttestationVerdict, DeviceIntegrityLevel } from '../attestation-verifier';

export const RULES_VERSION = RULES.rulesVersion;

/** Which scorer produced a score. ADR-081 forbids calling the rule-based path AI-derived. */
export type ScoredBy = 'RULES' | 'MODEL';

export type AttestationBand = keyof typeof RULES.bands.attestation;
export type RecencyBand = keyof typeof RULES.bands.recency;
export type EnrolmentAgeBand = keyof typeof RULES.bands.enrolmentAge;
export type RevocationBand = keyof typeof RULES.bands.revocationHistory;
export type AsnBand = keyof typeof RULES.bands.asnStability;

/**
 * Everything the scorer knows, and the only thing it knows.
 *
 * Ages are in whole days rather than timestamps on purpose: the training pipeline computes them from
 * Parquet snapshots where "now" is the snapshot date, and passing dates would leave two definitions
 * of the present.
 */
export interface TrustFeatures {
  /** null means no attestation was ever attempted — an enrolment predating migration 20260805000001. */
  attestationVerdict: AttestationVerdict | null;
  /** null on iOS (App Attest has no device tier) and whenever no verdict was obtained. */
  integrityLevel: DeviceIntegrityLevel | null;
  enrolmentAgeDays: number;
  lastSeenDaysAgo: number;
  /** Any device of this user still revoked with reason COMPROMISED. */
  compromiseOnRecord: boolean;
  /** Days since the user's most recent LOST_OR_STOLEN / ADMIN_REVOKED revocation; null if none. */
  nonCompromiseRevocationDaysAgo: number | null;
  /** Distinct autonomous systems seen across recent ingress addresses (ADR-080, never stored). */
  distinctAsnCount: number;
  /** How many addresses that count is based on. Below the floor, the signal abstains. */
  asnObservations: number;
}

export interface TrustSignal {
  signal: 'attestation' | 'recency' | 'enrolmentAge' | 'revocationHistory' | 'asnStability';
  band: string;
  points: number;
  maxPoints: number;
}

export interface TrustScore {
  score: number;
  maxScore: number;
  /** True when a cap held the total below the sum of its signals — the screen should say why. */
  capped: boolean;
  scoredBy: ScoredBy;
  rulesVersion: string;
  signals: TrustSignal[];
}

const T = RULES.thresholds;

/**
 * Platform integrity, the heaviest signal at 40 of 100.
 *
 * It is the only input that speaks to the state of the device rather than to the history of its use,
 * and ADR-082 exists precisely because a possession-proving key says nothing about the platform
 * holding it.
 *
 * PASSED_NO_TIER is structurally iOS. App Attest attests the app on genuine Apple hardware and emits
 * no device tier at all; the Android verifier cannot reach this state, because a Play Integrity
 * response carrying no recognised tier is mapped to FAILED at its source (play-integrity.adapter.ts).
 * So a missing tier alongside PASSED means "a platform that does not have the concept", which is why
 * it sits just under STRONG instead of being treated as a weak answer.
 */
export function attestationBand(
  verdict: AttestationVerdict | null,
  level: DeviceIntegrityLevel | null,
): AttestationBand {
  if (verdict === null) return 'NOT_ATTEMPTED';
  if (verdict === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (verdict === 'FAILED') return 'FAILED';
  if (level === 'STRONG') return 'PASSED_STRONG';
  if (level === 'DEVICE') return 'PASSED_DEVICE';
  if (level === 'BASIC') return 'PASSED_BASIC';
  return 'PASSED_NO_TIER';
}

/** Recency against the 30-day sliding trust window §20.6.1 already renews on each trusted verify. */
export function recencyBand(lastSeenDaysAgo: number): RecencyBand {
  if (lastSeenDaysAgo <= T.recencyFreshDays) return 'SEEN_WITHIN_FRESH_WINDOW';
  if (lastSeenDaysAgo <= T.trustWindowDays) return 'SEEN_WITHIN_TRUST_WINDOW';
  return 'STALE';
}

/**
 * How long the device has been enrolled.
 *
 * A device enrolled an hour ago has earned nothing yet — not because it is suspicious, but because
 * there is no history to be reassured by. This is the signal that keeps a brand-new enrolment off
 * 100 without implying anything is wrong with it.
 */
export function enrolmentAgeBand(ageDays: number): EnrolmentAgeBand {
  const [long, medium, short] = T.enrolmentAgeDays as [number, number, number];
  if (ageDays >= long) return 'AT_LEAST_90_DAYS';
  if (ageDays >= medium) return 'AT_LEAST_30_DAYS';
  if (ageDays >= short) return 'AT_LEAST_7_DAYS';
  return 'UNDER_7_DAYS';
}

/**
 * The user's revocation history.
 *
 * This grades DIFFERENTLY from the training label, deliberately. Migration 20260805000001 treats
 * only COMPROMISED as a positive label, because a label is a claim that a compromise happened and
 * marking ordinary churn as an attack would teach the model that retiring a phone looks like one.
 * A score is a different claim — about risk right now — so a handset reported lost last week is
 * worth noting, while a user tidying up an old install is not.
 */
export function revocationBand(
  compromiseOnRecord: boolean,
  nonCompromiseDaysAgo: number | null,
): RevocationBand {
  if (compromiseOnRecord) return 'COMPROMISE_ON_RECORD';
  if (nonCompromiseDaysAgo !== null && nonCompromiseDaysAgo <= T.nonCompromiseRecentDays) {
    return 'NON_COMPROMISE_RECENT';
  }
  return 'CLEAN';
}

/**
 * Stability of the ingress network across recent sessions.
 *
 * The lightest signal at 15, and the only one that abstains. Below the observation floor — or in a
 * deployment with no GeoLite2 database, where every lookup returns null and the count is 0 — the
 * band is INSUFFICIENT_DATA, scored at the two-network level rather than at zero. An air-gapped
 * install has not established that its devices roam; scoring absence as instability would mark an
 * entire on-premise fleet down for an operator's licence decision (ADR-080).
 *
 * Note what this is NOT: it does not say where the worker is. Roaming across carriers is the job on
 * a construction site, so the top penalty is 12 points and there is no cap.
 */
export function asnBand(distinctAsnCount: number, observations: number): AsnBand {
  if (observations < T.asnMinObservations || distinctAsnCount === 0) return 'INSUFFICIENT_DATA';
  if (distinctAsnCount === 1) return 'SINGLE_ASN';
  if (distinctAsnCount === 2) return 'TWO_ASNS';
  if (distinctAsnCount <= 4) return 'THREE_TO_FOUR_ASNS';
  return 'FIVE_OR_MORE_ASNS';
}

function maxOf(bands: Record<string, number>): number {
  return Math.max(...Object.values(bands));
}

/**
 * Score a device, 0–100.
 *
 * The two caps are ceilings, never floors. `Math.min` over the sum means the worst-case device
 * scores 3 rather than being lifted to 30 — a cap answers "how high may this climb", and a device
 * that is failing every signal at once has not earned the cap either.
 */
export function scoreDevice(features: TrustFeatures): TrustScore {
  const b = RULES.bands;

  const attestation = attestationBand(features.attestationVerdict, features.integrityLevel);
  const recency = recencyBand(features.lastSeenDaysAgo);
  const enrolmentAge = enrolmentAgeBand(features.enrolmentAgeDays);
  const revocation = revocationBand(
    features.compromiseOnRecord,
    features.nonCompromiseRevocationDaysAgo,
  );
  const asn = asnBand(features.distinctAsnCount, features.asnObservations);

  const signals: TrustSignal[] = [
    {
      signal: 'attestation',
      band: attestation,
      points: b.attestation[attestation],
      maxPoints: maxOf(b.attestation),
    },
    { signal: 'recency', band: recency, points: b.recency[recency], maxPoints: maxOf(b.recency) },
    {
      signal: 'enrolmentAge',
      band: enrolmentAge,
      points: b.enrolmentAge[enrolmentAge],
      maxPoints: maxOf(b.enrolmentAge),
    },
    {
      signal: 'revocationHistory',
      band: revocation,
      points: b.revocationHistory[revocation],
      maxPoints: maxOf(b.revocationHistory),
    },
    {
      signal: 'asnStability',
      band: asn,
      points: b.asnStability[asn],
      maxPoints: maxOf(b.asnStability),
    },
  ];

  const subtotal = signals.reduce((sum, s) => sum + s.points, 0);

  const ceilings = [RULES.maxScore];
  if (attestation === 'FAILED') ceilings.push(RULES.caps.ATTESTATION_FAILED);
  if (revocation === 'COMPROMISE_ON_RECORD') ceilings.push(RULES.caps.COMPROMISE_ON_RECORD);
  const score = Math.min(subtotal, ...ceilings);

  return {
    score,
    maxScore: RULES.maxScore,
    capped: score < subtotal,
    // Never 'MODEL' from here, whatever the caller would prefer to display. ADR-081: claiming AI over
    // an if-chain is the same class of dishonesty as the static 98%.
    scoredBy: 'RULES',
    rulesVersion: RULES.rulesVersion,
    signals,
  };
}
