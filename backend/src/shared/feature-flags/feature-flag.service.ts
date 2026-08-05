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
  // Retrofit kill-switch for ADR-077 (security review F1b/F2b): resolve platform.users.is_active and
  // the effective role from the database on every request instead of trusting the JWT claim. Default
  // ON — it is a security fix, and this file's convention is that retrofit kill-switches fail open to
  // the CURRENT behaviour. Turning it OFF reverts to trusting the token, which re-opens the finding;
  // it exists only so an auth-path incident can be mitigated in <60s without a rollback deploy.
  's1.identity.authoritative-role-check': true,
  's1.finance.payment-mutations': true,
  // New feature, not a retrofit kill-switch — defaults OFF until rollout. Failing closed is the
  // safe direction here: with it off, web forms fall back to server-only validation (QM-4
  // class-validator), which is the behaviour that shipped before the flag existed.
  's1.web.client-validation': false,
  // Encrypt platform.tenants.dedicated_db_url at rest on WRITE (security review F5b; QM-15 kill
  // switch). Defaults OFF until rollout — reads always accept both formats, so flipping it either way
  // is safe at any time and never strands a row.
  's1.tenant.encrypted-db-url': false,
  // PDPA §30/§31 data export (ADR-078). New feature, so OFF until rollout per this file's convention.
  //
  // It becomes a permanent kill switch afterwards, and it gates the DOWNLOAD as well as the request:
  // the incident it exists for is a bad join putting one person's rows in another's archive, and then
  // the archives already in MinIO are precisely what must stop being served.
  //
  // FLIP THIS TO true WHEN THE ROLLOUT REACHES 100%. Leaving it false permanently makes an Unleash
  // outage fail closed on a statutory right — PDPA §30 gives 30 days to answer, and "the flag service
  // was down" is not an answer. It is correct only while the feature is not yet rolled out.
  's1.identity.data-export': false,
  // Platform attestation verification (ADR-082) — kill-switch, permanent.
  //
  // Defaults ON despite being new, which is the opposite of this file's usual rule, because of what
  // OFF means here. Attestation is additive and non-blocking by construction: the worst OFF can do is
  // stop recording verdicts, and the worst ON can do is record UNAVAILABLE. Neither affects sign-in.
  // The switch exists so a Google or Apple outage can be taken out of the request path without a
  // deploy — and a flag-service outage must not be the thing that silently stops a security signal
  // from being collected.
  's1.identity.device-attestation': true,
  // The device trust score (ADR-081). New feature, so OFF until rollout per this file's convention,
  // and failing closed is the right direction for a reason specific to this one: the score is
  // ADVISORY (§22.3) and never gates anything, so OFF costs a user one panel on a transparency
  // screen and costs the platform nothing. A wrong score shown confidently on a security screen is
  // the more expensive failure, and this is the switch that removes it in under 60 seconds.
  's1.identity.device-trust-score': false,
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
