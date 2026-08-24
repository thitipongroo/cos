// Maps an AI delay-forecast (ai.risk_prediction.generated.v1, model_type=DELAY_FORECAST) onto a
// ProjectRisk (ADR-065). Pure + tested — the consumer stays thin.
//
// A delay forecast is, by construction, a SCHEDULE risk. Its LOW/MEDIUM/HIGH/CRITICAL level maps to a
// symmetric likelihood × impact on the 5×5 register (a translation, not an estimate the AI did not
// make): LOW→2, MEDIUM→3, HIGH→4, CRITICAL→5. An unknown level yields null so the consumer skips it
// rather than inventing a score.

export interface DelayForecast {
  delay_risk_level: string;
  risk_factors: string[];
}

export interface SuggestedRiskInput {
  title: string;
  description: string;
  category: 'SCHEDULE';
  likelihood: number;
  impact: number;
}

const LEVEL_SCORE: Record<string, number> = {
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  CRITICAL: 5,
};

/**
 * Translate a delay forecast into the fields for an AI-suggested ProjectRisk, or null when the level
 * is not one of the four known bands (the register must not fill with unscored noise).
 * `confidence` is the model's 0–1 score, surfaced in the description for the human triager.
 */
export function mapDelayForecast(
  forecast: DelayForecast,
  confidence: string | null,
): SuggestedRiskInput | null {
  const score = LEVEL_SCORE[forecast.delay_risk_level];
  if (score === undefined) return null;

  const factors = forecast.risk_factors ?? [];
  const factorText = factors.length > 0 ? factors.join('; ') : 'no factors reported';
  const confidenceText = confidence ? ` (model confidence ${confidence})` : '';

  return {
    title: `AI delay-risk: ${forecast.delay_risk_level}`,
    description:
      `AI-suggested schedule delay risk${confidenceText}. Factors: ${factorText}. ` +
      `Verify against the project schedule before accepting.`,
    category: 'SCHEDULE',
    likelihood: score,
    impact: score,
  };
}
