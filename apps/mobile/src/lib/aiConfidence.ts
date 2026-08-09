// How an AI report's confidence is turned into something a reader can act on.
//
// WHY A BAND AND NOT A BARE PERCENTAGE. Google's People+AI Guidebook is explicit that a numeric
// confidence assumes the reader understands probability, that over-granular values (85.8% vs 87%)
// separate nothing actionable, and that the recommended form is a small set of buckets each tied to
// what the reader should DO. The number is kept alongside the band (product-owner decision
// 2026-08-10 — it is a real field the platform already carries and will need), but the band is what
// the screen leads with.
//
// THE THRESHOLDS ARE THE PLATFORM'S OWN, NOT INVENTED HERE. Spec §33.8 already bands a confidence
// score for digital-twin state: 1.0 live, 0.7–0.9 recent, below 0.7 inferred. The same edges are used
// here so the product means one thing by "0.7" everywhere. Per spec §22 a learned threshold (τ) must
// come from an eval set rather than being hardcoded — that rule governs MODEL ROUTING, and when an
// eval set exists these display bands should be revisited against it too.
//
// `low_confidence` OUTRANKS THE NUMBER. The gateway sets it when the model returned unusable output
// (non-JSON, guard-tripped), in which case `confidence` is null or meaningless. It is a required
// field on ReportResponse precisely because it is the server's own verdict, and the client does not
// second-guess it.

/** Confidence band. `UNKNOWN` = the report arrived without a number to band. */
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** §33.8's band edges, reused so one number means one thing across the product. */
export const HIGH_CONFIDENCE_MIN = 0.9;
export const MEDIUM_CONFIDENCE_MIN = 0.7;

export function confidenceBand(
  confidence: number | null | undefined,
  lowConfidence: boolean,
): ConfidenceBand {
  if (lowConfidence) return 'LOW';
  if (confidence == null || Number.isNaN(confidence)) return 'UNKNOWN';
  if (confidence >= HIGH_CONFIDENCE_MIN) return 'HIGH';
  if (confidence >= MEDIUM_CONFIDENCE_MIN) return 'MEDIUM';
  return 'LOW';
}

/**
 * The percentage to print beside the band, or null when there is nothing to print.
 *
 * Rounded to whole percent on purpose: the guidance above is that finer granularity separates nothing
 * a reader can act on, and printing 85.8% invites a precision the model does not have.
 */
export function confidencePercent(confidence: number | null | undefined): number | null {
  if (confidence == null || Number.isNaN(confidence)) return null;
  return Math.round(confidence * 100);
}
