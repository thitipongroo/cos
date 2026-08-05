// Recognising a server-side kill switch (QM-15 / ADR-049) from the client.
//
// WHY THIS EXISTS. `s1.identity.data-export` ships OFF (new features default off in the flag
// registry), so a user who reaches the export screen before rollout gets a 503 carrying
// `COS-FLAG-001` from FeatureFlagGuard. Without this, that 503 lands in the same `catch` as a
// genuine failure and the screen says "the confirmation code could not be sent" — blaming the
// network for a decision the platform made deliberately.
//
// The distinction matters most on THIS feature: PDPA §30 is a statutory right, and telling someone
// their rights request failed when it was simply not switched on yet is the kind of message that
// ends up in front of a regulator.

/** The guard's own error code. Matching on this, not on the 503, keeps it from catching an outage. */
export const FEATURE_DISABLED_CODE = 'COS-FLAG-001';

interface AxiosLikeError {
  response?: { status?: number; data?: { code?: unknown } };
}

/**
 * Is this error a feature flag being off, rather than something going wrong?
 *
 * Requires BOTH the 503 and the code. A bare 503 is an unhealthy backend — a real failure the user
 * should be told about — while the code alone could arrive on any status if an error envelope were
 * ever reshaped. Demanding both means this can only ever match the guard.
 */
export function isFeatureDisabled(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const res = (err as AxiosLikeError).response;
  return res?.status === 503 && res.data?.code === FEATURE_DISABLED_CODE;
}
