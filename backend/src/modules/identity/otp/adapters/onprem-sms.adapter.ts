// OnPremSmsAdapter — the on-premise SmsSender (ADR-040, SMS_PROVIDER=onprem).
//
// DELIBERATELY NOT IMPLEMENTED. ADR-040 is explicit that the concrete on-prem provider is
// "country/customer-specific; NOT pinned at platform level" and "must not be guessed at platform
// level" — the integration shape is one of an in-country REST aggregator, an SMPP carrier link, or a
// customer-operated gateway, chosen per engagement against the ADR's six criteria (PDPA residency,
// deliverability, reachability, protocol, throughput/cost, TLS).
//
// So this follows the §32.9 Integration Stub Pattern, Type A: log WARN + throw a typed exception —
// fail fast. ADR-040 says so in as many words: "Until an on-prem adapter is configured, follow the
// §32.9 stub pattern (log WARN + fail-fast) — SMS login is unavailable, not silently broken."
//
// The alternative — returning silently — is what makes this dangerous rather than merely incomplete:
// requestOtp() would report success, the operator would see a healthy login endpoint, and every field
// worker would sit waiting for a code that was never sent. A hard failure at the first send is the
// signal that the deployment is missing a provider.

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import type { SmsSender } from '../sms-sender';

const logger = createLogger('onprem-sms-adapter');

@Injectable()
export class OnPremSmsAdapter implements SmsSender {
  async sendSms(_phoneE164: string, _message: string): Promise<void> {
    logger.warn(
      { provider: 'onprem' },
      'SMS_PROVIDER=onprem but no concrete gateway is configured — SMS delivery is unavailable ' +
        '(ADR-040: the provider is selected per deployment). Configure an adapter before go-live.',
    );
    return Promise.reject(
      new ServiceUnavailableException({
        error: {
          code: 'COS-AUTH-002',
          message:
            'SMS delivery is not configured for this deployment. Contact your administrator.',
          messageKey: 'auth.sms.providerUnavailable',
        },
      }),
    );
  }
}
