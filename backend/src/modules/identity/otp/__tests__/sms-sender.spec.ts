// SmsSender port + adapters (ADR-040).
//
// What these protect is the property that made the port worth extracting: SMS-OTP is the ONLY login
// a SITE_WORKER has, so an air-gapped deployment must either deliver the code or fail loudly — never
// report success on a code that was not sent.

const snsSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: snsSend })),
  PublishCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { ServiceUnavailableException } from '@nestjs/common';
import { AwsSnsSmsAdapter } from '../adapters/aws-sns-sms.adapter';
import { OnPremSmsAdapter } from '../adapters/onprem-sms.adapter';
import { resolveSmsProvider, smsSenderProvider, SMS_PROVIDERS } from '../sms-sender.provider';
import { SMS_SENDER } from '../sms-sender';

const withEnv = async (vars: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const saved = Object.keys(vars).map((k) => [k, process.env[k]] as const);
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

describe('AwsSnsSmsAdapter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('publishes a Transactional SMS with the COS sender id', async () => {
    await withEnv({ NODE_ENV: 'production', AWS_REGION: undefined }, async () => {
      snsSend.mockResolvedValue({});
      await new AwsSnsSmsAdapter().sendSms('+66812345678', 'code 123456');
      expect(snsSend).toHaveBeenCalledTimes(1);
      const { input } = snsSend.mock.calls[0]![0] as {
        input: {
          PhoneNumber: string;
          Message: string;
          MessageAttributes: Record<string, { StringValue: string }>;
        };
      };
      expect(input.PhoneNumber).toBe('+66812345678');
      expect(input.Message).toBe('code 123456');
      // Transactional, not Promotional: carriers deprioritise Promotional and some drop it entirely,
      // which would silently degrade login deliverability.
      expect(input.MessageAttributes['AWS.SNS.SMS.SMSType']!.StringValue).toBe('Transactional');
      expect(input.MessageAttributes['AWS.SNS.SMS.SenderID']!.StringValue).toBe('COS');
    });
  });

  it('does NOT reach the network in development — a code must never hit a real carrier locally', async () => {
    await withEnv({ NODE_ENV: 'development' }, async () => {
      await new AwsSnsSmsAdapter().sendSms('+66812345678', 'code 123456');
      expect(snsSend).not.toHaveBeenCalled();
    });
  });

  it('propagates an SNS failure rather than swallowing it', async () => {
    await withEnv({ NODE_ENV: 'production' }, async () => {
      snsSend.mockRejectedValueOnce(new Error('throttled'));
      await expect(new AwsSnsSmsAdapter().sendSms('+66812345678', 'x')).rejects.toThrow(
        'throttled',
      );
    });
  });
});

describe('OnPremSmsAdapter — §32.9 Type A stub (fail-fast)', () => {
  it('rejects rather than pretending the message was sent', async () => {
    const err = await new OnPremSmsAdapter().sendSms('+66812345678', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    const body = (err as ServiceUnavailableException).getResponse() as {
      error: { code: string; messageKey: string };
    };
    expect(body.error.code).toBe('COS-AUTH-002');
    expect(body.error.messageKey).toBe('auth.sms.providerUnavailable');
  });
});

describe('resolveSmsProvider / smsSenderProvider', () => {
  it('defaults to aws-sns when SMS_PROVIDER is unset (pre-ADR-040 behaviour preserved)', () => {
    expect(resolveSmsProvider(undefined)).toBe('aws-sns');
  });

  it.each(SMS_PROVIDERS)('accepts the documented value %s', (name) => {
    expect(resolveSmsProvider(name)).toBe(name);
  });

  it('throws on an unrecognised value instead of falling back to AWS', () => {
    // A typo silently selecting AWS is harmless on cloud and catastrophic on-prem: the deployment
    // would believe it had a local gateway while every OTP went to an unreachable endpoint.
    expect(() => resolveSmsProvider('sns')).toThrow(/Unknown SMS_PROVIDER "sns"/);
  });

  it('is registered against the SMS_SENDER token', () => {
    expect((smsSenderProvider as { provide: symbol }).provide).toBe(SMS_SENDER);
  });

  it('builds the on-prem adapter when SMS_PROVIDER=onprem', async () => {
    await withEnv({ SMS_PROVIDER: 'onprem' }, async () => {
      const factory = (smsSenderProvider as { useFactory: () => unknown }).useFactory;
      expect(factory()).toBeInstanceOf(OnPremSmsAdapter);
    });
  });

  it('builds the AWS adapter otherwise', async () => {
    await withEnv({ SMS_PROVIDER: undefined }, async () => {
      const factory = (smsSenderProvider as { useFactory: () => unknown }).useFactory;
      expect(factory()).toBeInstanceOf(AwsSnsSmsAdapter);
    });
  });
});
