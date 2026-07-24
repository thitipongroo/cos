// Feature flags — Unleash (open-source, self-hosted) per ADR-049; QM-15.
// Server-evaluated: clients read GET /api/v1/flags — no client-side flag SDK or credentials.
// Local dev / unit tests: when UNLEASH_URL is unset the service runs in fallback mode and
// serves DEFAULT_FLAGS (retrofit kill-switches default ON) — no Unleash server required.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { initialize } from 'unleash-client';
import type { Unleash } from 'unleash-client';
import { createLogger } from '@cos/logger';

const logger = createLogger('feature-flags');

// Flag registry: docs/feature-flags/registry.md — naming {stage}.{domain}.{feature} (QM-15).
// Fallback values apply when Unleash is unreachable or not configured; retrofit kill-switches
// default ON so a flag-service outage never disables a live feature (fail-open by design).
export const DEFAULT_FLAGS: Readonly<Record<string, boolean>> = {
  's1.ai.report-generation': true,
  's1.ai.completions': true,
  's1.identity.sms-otp-login': true,
  's1.finance.payment-mutations': true,
};

export interface FlagContext {
  userId?: string;
  tenantId?: string;
}

// Kill switch must propagate in ≤ 60s without a deployment (QM-15) — 15s poll keeps worst-case
// staleness well inside that bound.
const REFRESH_INTERVAL_MS = 15_000;

@Injectable()
export class FeatureFlagService implements OnModuleDestroy {
  private readonly unleash: Unleash | null;

  constructor() {
    const url = process.env['UNLEASH_URL'];
    if (!url) {
      this.unleash = null;
      logger.warn(
        { event: 'feature-flags.fallback-mode' },
        'UNLEASH_URL not set — serving DEFAULT_FLAGS (local dev / degraded mode)',
      );
      return;
    }
    this.unleash = initialize({
      url,
      appName: process.env['UNLEASH_APP_NAME'] ?? 'cos-backend',
      customHeaders: { Authorization: process.env['UNLEASH_API_TOKEN'] ?? '' },
      refreshInterval: REFRESH_INTERVAL_MS,
    });
    this.unleash.on('error', (err: unknown) => {
      logger.error({ err, event: 'feature-flags.client-error' }, 'Unleash client error');
    });
  }

  isEnabled(flag: string, ctx: FlagContext = {}): boolean {
    if (!this.unleash) {
      return DEFAULT_FLAGS[flag] ?? false;
    }
    return this.unleash.isEnabled(
      flag,
      { userId: ctx.userId, properties: { tenantId: ctx.tenantId ?? '' } },
      DEFAULT_FLAGS[flag] ?? false,
    );
  }

  // Server-evaluated flag map for GET /api/v1/flags: every flag Unleash knows about plus the
  // registry defaults (so a flag not yet created in Unleash still reaches clients).
  allFlags(ctx: FlagContext = {}): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const name of Object.keys(DEFAULT_FLAGS)) {
      result[name] = this.isEnabled(name, ctx);
    }
    if (this.unleash) {
      for (const def of this.unleash.getFeatureToggleDefinitions() ?? []) {
        result[def.name] = this.isEnabled(def.name, ctx);
      }
    }
    return result;
  }

  // ADR-034 / Rule 39: the Unleash client owns a poller + metrics timer — close on shutdown.
  onModuleDestroy(): void {
    this.unleash?.destroy();
  }
}
