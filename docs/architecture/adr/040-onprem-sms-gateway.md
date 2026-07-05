# ADR-040: On-premise SMS gateway for OTP delivery

**Date:** 2026-06-30
**Status:** Accepted (2026-06-30) — SMS-gateway abstraction accepted; the concrete on-prem provider
is selected per deployment (country/customer-specific) against the criteria below
**Deciders:** Product owner (interim Platform Lead)
**Tags:** security, infra

---

## Context

SMS-OTP is the **Path A** login for `SITE_WORKER` / `SITE_ENGINEER` (`05-security-compliance` §5.4;
context Path A). The OTP module **hardcodes AWS SNS**:

- `backend/src/modules/identity/otp/otp.service.ts` imports `@aws-sdk/client-sns`, constructs
  `new SNSClient({region: ... 'ap-southeast-1'})`, and `sendSms()` calls `this.sns.send(PublishCommand)`.
- There is **no SMS-provider abstraction** (no port/interface — verified by grep).

This is the one remaining external dependency with **no on-premise alternative** in the spec. A
**Fully On-premise / air-gapped** deployment (`08-enterprise-deployment` §8.4 "no cloud dependency")
cannot reach AWS SNS, so SMS-OTP login would not work. Phone number + OTP are **PII**, so the gateway
also has PDPA / data-residency implications (`05-security-compliance` §5.6, QM-5 — must not leave the
in-country region without approval). The on-prem SMS provider is **UNSPECIFIED**.

## Decision

**1. Introduce an SMS-gateway abstraction** (mirrors the existing `LLMProvider` pattern):

- Define a port `SmsSender` in the identity/otp module: `sendSms(phoneE164: string, message: string): Promise<void>`.
- Select the adapter by config (`SMS_PROVIDER` env): `aws-sns` (cloud — refactor the current code into
  `AwsSnsSmsAdapter`) or `onprem` (the pluggable on-prem adapter).
- Credentials via the standard secret path (AWS Secrets Manager on cloud / HashiCorp Vault on-prem —
  spec `05-security-compliance` §5.2).

**2. On-premise adapter — concrete provider chosen per deployment** (country/customer-specific; NOT
pinned at platform level). Supported integration shapes for the `onprem` adapter:

| Shape                                            | When                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| In-country SMS aggregator over **HTTP REST API** | customer has internet egress to a local provider             |
| **SMPP** gateway (direct telco / carrier)        | telco integration / higher volume                            |
| **Customer-provided SMS gateway**                | customer already operates one (incl. air-gapped LAN gateway) |

The specific vendor is selected per on-prem engagement against the criteria below — it is inherently
per-country/customer and must not be guessed at platform level.

### Selection criteria for the concrete on-prem provider

1. **PDPA / data residency** — phone number + OTP (PII) processed/stored in-country; no cross-border
   transfer without approval (QM-5, §5.6).
2. **Deliverability / coverage** in the target country (sender-ID rules, carrier reach).
3. **Reachability** from the deployment network — internet egress to a REST provider, or a
   LAN-reachable SMPP/appliance for air-gapped sites.
4. **API protocol** — HTTP REST vs SMPP (drives adapter implementation).
5. **Throughput / rate** — sized to OTP login volume; **cost**; **SLA / uptime**.
6. **Security** — TLS to the gateway; OTP/phone never logged (QM-4/QM-8 PII rules).

## Consequences

### Positive

- Closes the last cloud-only dependency → SMS-OTP works on-prem / air-gapped; PII can stay in-country.
- Cloud deployments keep AWS SNS unchanged (just moved behind the port).

### Negative / required work

- **Code change:** refactor `otp.service.ts` (remove hardcoded `SNSClient`) into `SmsSender` +
  `AwsSnsSmsAdapter` + an `onprem` adapter; add `SMS_PROVIDER` config; unit tests per QM-1.
- Each on-prem engagement must select + configure a concrete provider (a per-deployment task), and
  validate deliverability before go-live.
- Until an on-prem adapter is configured, follow the §32.9 stub pattern (log WARN + fail-fast) — SMS
  login is unavailable, not silently broken.

### Neutral

- Email/password (Path B, Keycloak) is unaffected — only the SMS-OTP path uses the gateway.

## References

- `backend/src/modules/identity/otp/otp.service.ts` (current hardcoded SNS)
- `05-security-compliance` §5.4 (auth paths), §5.6 (data residency), §5.2 (secrets management);
  QM-5 (PDPA), QM-4/QM-8 (PII)
- `08-enterprise-deployment` §8.4 (Fully On-premise — no cloud dependency)
- Precedent: `LLMProvider` abstraction (cloud OpenAI/Claude ↔ on-prem Ollama — `22-ai-architecture` §22.6)
