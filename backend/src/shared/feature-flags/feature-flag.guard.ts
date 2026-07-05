import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagService } from './feature-flag.service';
import { FEATURE_FLAG_KEY } from './feature-flag.decorator';

interface FlagRequest {
  userId?: string;
  tenantId?: string;
}

// Registered as a global APP_GUARD (app.module.ts) — evaluates only handlers/classes carrying
// @FeatureFlag metadata; every other route passes through untouched (same pattern as ThrottlerGuard).
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<string | undefined>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!flag) {
      return true;
    }
    const req = context.switchToHttp().getRequest<FlagRequest>();
    if (this.flags.isEnabled(flag, { userId: req.userId, tenantId: req.tenantId })) {
      return true;
    }
    // 503 per QM-10 (service temporarily unavailable — feature disabled via kill switch)
    throw new ServiceUnavailableException({
      code: 'COS-FLAG-001',
      message: `Feature '${flag}' is temporarily disabled`,
      messageKey: 'common.featureFlag.disabled',
    });
  }
}
