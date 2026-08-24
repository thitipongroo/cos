# ADR-013: Secrets management and delivery

**Date:** 2026-06-30 (formalises a pre-existing decision already documented in
`05-security-compliance` §5.2; created to resolve the dangling "ADR-013" reference cited 3× in
`context.md`)
**Status:** Accepted
**Deciders:** Product owner (interim Platform Lead)
**Tags:** security, infra

---

## Context

The platform needs runtime secrets (DB credentials, API keys, JWT signing keys) across **cloud** and
**on-premise/hybrid** deployments, with **no secrets in code or git history** (QM-4). The secret
_store_ and the _delivery mechanism_ into pods are both part of the decision. This is fully specified
in `05-security-compliance` §5.2 and was referenced as "ADR-013" in `context.md`
(lines 204, 734, 824) — but the ADR file itself was never created. This ADR records the
existing decision so those
references resolve.

## Decision

- **Secret store:** **AWS Secrets Manager** (cloud / AWS EKS) · **HashiCorp Vault** (on-premise +
  hybrid). (§5.2)
- **Delivery into pods:** **External Secrets Operator** syncs AWS SM → native K8s Secret → pod env
  (cloud); **Vault Agent sidecar injector** delivers Vault secrets (on-prem/hybrid). (§5.2, §8.6)
- **Git-committed K8s Secrets:** only as a **SealedSecret** via `kubeseal` (sealed-secrets) — never
  plaintext. (§5.2, §8.6)
- **No secrets in code/git:** never commit `.env` / `*.pem` / `*.key` / `*.pfx`; pre-commit hook
  blocks secret patterns (`gitleaks` / `git-secrets`). (QM-4)
- **Rotation:** cloud = AWS SM automated rotation (Lambda per resource type); on-prem = Vault database
  secrets engine (dynamic, 24h lease TTL); JWT signing keys rotate every 180 days via JWKS. (QM-4)
- **Encryption at rest:** AES-256 minimum; SSE-KMS with a customer-managed key (CMK) for cloud storage
  (S3, RDS); AWS-managed key for ElastiCache; one CMK per storage-type per env via Terraform. (§5.2.1)

## Rationale

- Cloud-native managed secrets (AWS SM) where available; **Vault** for on-prem / data-sovereignty
  deployments (consistent with the self-host capability — §8.4).
- SealedSecret keeps the GitOps repository safe to store the few Secret objects that must be in git.
- Splitting _store_ vs _delivery_ makes the decision explicit and portable across environments.

## Consequences

### Positive

- No plaintext secrets in code/git; automated rotation; cloud↔on-prem parity via the same K8s Secret
  abstraction at the pod boundary.

### Negative

- Two secret backends to operate (AWS SM for cloud, Vault for on-prem/hybrid) — more surface, but each
  matches its deployment model.

### Neutral

- Application code reads secrets as pod env vars regardless of backend; switching backend is a
  deployment/operator concern, not an application change.

## References

- `05-security-compliance` §5.2 (secrets store + delivery), §5.2.1 (encryption at rest)
- `08-enterprise-deployment` §8.6 (operator-level secret delivery: ESO / Vault Agent / SealedSecret)
- `04-tech-stack` §4.4 (Vault), §4.7 (AWS Secrets Manager)
- QM-4 (no secrets in code; rotation) — `context.md`
