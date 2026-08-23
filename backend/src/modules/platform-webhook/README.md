# platform-webhook

NestJS module receiving signed platform webhooks from external systems.

## Purpose

Hosts the CRM-agnostic enterprise contract webhook (Phase 25, Path B). A verified request starts the
`EnterpriseProvisioningWorkflow` on the `enterprise-provisioning` Temporal task queue — the same
workflow started by the SYSTEM_ADMIN path
(`PATCH /api/v1/admin/tenants/:tenantId/mark-contracted`). Source: `00_master` §Phase 25;
`34-enterprise-tenant-provisioning` §34.6.

## Public API

```text
POST /api/v1/platform/webhooks/enterprise-contract-signed
```

Request body is generic — no CRM-specific adapter exists in Phase 25:

```json
{ "tenant_id": "<uuid>", "contract_reference": "optional-string" }
```

Required header: `X-Webhook-Signature: sha256=<hex>`

## Dependencies

- Temporal client — starts `EnterpriseProvisioningWorkflow`
- Fastify `addContentTypeParser` — captures the **raw body** as a `Buffer` before parsing, so the
  HMAC is computed over the exact transmitted bytes
- Node `crypto` — `timingSafeEqual` for constant-time signature comparison

## Configuration

| Variable                  | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `PLATFORM_WEBHOOK_SECRET` | HMAC-SHA256 shared secret used to verify every request |

Injected from AWS Secrets Manager (cloud) or HashiCorp Vault (on-premise) — never committed.

## Usage

```text
expectedSig = "sha256=" + HMAC-SHA256(PLATFORM_WEBHOOK_SECRET, rawBody).hexDigest()
compare(X-Webhook-Signature, expectedSig) using timingSafeEqual
```

## Notes

- **Response codes (mandatory, §34.6):** missing secret or missing raw body → `500`;
  missing or invalid signature → `401`.
- The workflow is idempotent per `tenant_id` — re-delivery of the same webhook must not provision a
  second RDS instance.
- Events emitted downstream: `platform.enterprise.contract_signed.v1`,
  `platform.enterprise.db_provisioned.v1`.
- OpenAPI spec: `docs/api/platform-webhooks.openapi.yaml`.
- Test design: `docs/specifications/35-test-design.md` §35.10.25.
