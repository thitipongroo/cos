// AwsSnsSmsAdapter — the cloud SmsSender (ADR-040, SMS_PROVIDER=aws-sns).
//
// This is the code that used to live inline in otp.service.ts, moved behind the port unchanged: same
// client construction, same region default, same Transactional message attributes and SenderID. The
// dev-mode short-circuit moved with it — an OTP must never traverse a real carrier during local
// development, and the SNS sandbox would reject the number anyway.

import { Injectable } from '@nestjs/common';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { createLogger } from '@cos/logger';
import type { SmsSender } from '../sms-sender';

const logger = createLogger('aws-sns-sms-adapter');

@Injectable()
export class AwsSnsSmsAdapter implements SmsSender {
  private readonly sns: SNSClient;

  constructor() {
    this.sns = new SNSClient({ region: process.env['AWS_REGION'] ?? 'ap-southeast-1' });
  }

  async sendSms(phoneE164: string, message: string): Promise<void> {
    if (process.env['NODE_ENV'] === 'development') {
      // Dev only. The message body carries a live code, so this branch is gated on NODE_ENV rather
      // than a log level — a misconfigured level must not be able to print a credential.
      logger.debug({ message, phone: '[REDACTED]' }, '[DEV] SMS not sent');
      return;
    }

    await this.sns.send(
      new PublishCommand({
        PhoneNumber: phoneE164,
        Message: message,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
          'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: 'COS' },
        },
      }),
    );
  }
}
