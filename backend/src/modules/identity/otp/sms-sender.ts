// SmsSender — the SMS gateway port (ADR-040).
//
// ADR-040 was Accepted on 2026-06-30 and specified this exact port, but it was never built: a grep
// for `SmsSender` returned nothing and otp.service.ts still constructed an SNSClient inline. That
// left AWS SNS as the last cloud-only dependency in the platform, so SMS-OTP login — the Path A
// login for every SITE_WORKER and SITE_ENGINEER — simply could not work in a fully on-premise or
// air-gapped deployment (§8.4 "no cloud dependency"). It is extracted here because step-up OTP
// (ADR-078) is the second caller, and duplicating the SNS call would have made the gap permanent.
//
// Signature is ADR-040's, unchanged: sendSms(phoneE164, message).
//
// Mirrors the LLMProvider pattern (§22.6): one port, an adapter chosen by env, no caller aware of
// which one is live.

/** DI token — the port is an interface, which has no runtime identity to inject by. */
export const SMS_SENDER = Symbol('SmsSender');

export interface SmsSender {
  /**
   * Deliver `message` to an E.164 phone number.
   *
   * Implementations MUST NOT log the message or the number: both are PII, and the message body is a
   * live credential for its TTL (QM-4, QM-8).
   */
  sendSms(phoneE164: string, message: string): Promise<void>;
}
