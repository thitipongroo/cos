// SmsSender adapter selection (ADR-040): SMS_PROVIDER picks the live gateway.
//
// Defaults to aws-sns, which is what every cloud deployment runs and what the code did before the
// port existed — so an unset SMS_PROVIDER behaves exactly as it did before ADR-040 was implemented.
//
// An UNRECOGNISED value fails at construction rather than falling back. A typo like SMS_PROVIDER=sns
// silently selecting AWS would be fine on cloud and catastrophic on-premise: an air-gapped
// deployment would ship believing it had a local gateway while every OTP went to an unreachable AWS
// endpoint. Boot-time failure puts that in front of whoever set the variable.

import type { Provider } from '@nestjs/common';
import { SMS_SENDER } from './sms-sender';
import { AwsSnsSmsAdapter } from './adapters/aws-sns-sms.adapter';
import { OnPremSmsAdapter } from './adapters/onprem-sms.adapter';

export const SMS_PROVIDERS = ['aws-sns', 'onprem'] as const;
export type SmsProviderName = (typeof SMS_PROVIDERS)[number];

export function resolveSmsProvider(raw: string | undefined): SmsProviderName {
  const name = raw ?? 'aws-sns';
  if (!(SMS_PROVIDERS as readonly string[]).includes(name)) {
    throw new Error(
      `Unknown SMS_PROVIDER "${name}". Expected one of: ${SMS_PROVIDERS.join(', ')} (ADR-040).`,
    );
  }
  return name as SmsProviderName;
}

export const smsSenderProvider: Provider = {
  provide: SMS_SENDER,
  useFactory: () =>
    resolveSmsProvider(process.env['SMS_PROVIDER']) === 'onprem'
      ? new OnPremSmsAdapter()
      : new AwsSnsSmsAdapter(),
};
