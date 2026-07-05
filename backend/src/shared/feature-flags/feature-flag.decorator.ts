import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'cos:feature-flag';

// Gates an endpoint behind a feature flag (QM-15). When the flag evaluates to false,
// FeatureFlagGuard rejects with 503 COS-FLAG-001. Naming: {stage}.{domain}.{feature}.
export const FeatureFlag = (flag: string): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_FLAG_KEY, flag);
