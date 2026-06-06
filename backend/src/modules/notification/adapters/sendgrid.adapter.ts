// SendGridAdapter — email delivery via SendGrid (MVP).
// Migrate to AWS SES before Stage 2 go-live (spec §19.7).

import sgMail from '@sendgrid/mail';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('sendgrid-adapter');

@Injectable()
export class SendGridAdapter implements OnModuleInit {
  onModuleInit(): void {
    const apiKey = process.env['SENDGRID_API_KEY'];
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    } else {
      logger.warn('SENDGRID_API_KEY not set — email delivery disabled');
    }
  }

  async send(params: { to: string; subject: string | null; body: string }): Promise<void> {
    const from = process.env['SENDGRID_FROM_EMAIL'];
    if (!from || !process.env['SENDGRID_API_KEY']) {
      logger.warn({ to: params.to }, 'SendGrid not configured — skipping email');
      return;
    }

    await sgMail.send({
      to: params.to,
      from,
      subject: params.subject ?? '(no subject)',
      text: params.body,
    });

    logger.info({ to: params.to }, 'Email sent via SendGrid');
  }
}
