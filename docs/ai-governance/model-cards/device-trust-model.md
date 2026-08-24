# Model Card — DeviceTrustModel

**Status:** NOT DEPLOYED. A deterministic rule-based baseline is serving.
**Owner:** Platform Security / Identity (`backend/src/modules/identity/device-trust/`)
**Card version:** 1.0.0 · **Rules version serving:** 1.0.0
**Last reviewed:** 2026-08-05
**Governs:** spec §22.9 (model governance), §22.6 (ML models), §22.3 (autonomous-mode prohibition),
ADR-081, ADR-082, ADR-083, ADR-080

---

## Why this card exists before the model does

§22.9 requires a card for every deployed model, and nothing is deployed here. It is written now
anyway because §22.9 attaches a specific precondition to this one model:

> DeviceTrustModel's card additionally records the PR-AUC margin over the rule-based baseline that
> authorised its promotion (§22.6, ADR-081) — **the model may not be deployed without it**, and the
> surface must state which scorer is serving.

A card produced at promotion time would be written by whoever wants the promotion. Writing the gate
down first makes it a condition rather than a formality, and the promotion record below is a blank
that has to be filled in by evidence.

## Purpose

Render a device trust score, 0–100, on the mobile transparency screen
`03_03_device_id_details`. The score answers one question for one person: _how much does this
platform currently trust the device I am holding, and why._

It replaced a **static 98% labelled "AI Verified"** in the mockup — a number that was true of no
device and derived from nothing (ADR-081).

## What is serving today

A deterministic rule-based scorer. Not a stopgap: ADR-081 makes it **the control the model must
beat**, so it is maintained permanently rather than deleted on promotion.

| Signal                                                | Max | Source                                                                   |
| ----------------------------------------------------- | --- | ------------------------------------------------------------------------ |
| Platform attestation verdict + integrity tier         | 40  | `trusted_devices.attestation_verdict` / `.integrity_level` (ADR-082/083) |
| Recency (`last_seen_at` vs the 30-day sliding window) | 15  | `trusted_devices.last_seen_at`                                           |
| Enrolment age (`created_at`)                          | 10  | `trusted_devices.created_at`                                             |
| Revocation history for the user                       | 20  | `trusted_devices.revocation_reason` across all their devices             |
| Ingress ASN stability                                 | 15  | `audit_logs.ip_address` → GeoLite2 ASN, derived and discarded (ADR-080)  |

Two **caps**, both ceilings and never floors: a `FAILED` attestation, or a confirmed compromise on
the user's record, holds the total to 30 regardless of what the other signals earned. A device
failing every signal at once scores 3, not 30 — a cap limits how high a bad device climbs, it never
lifts one up.

Every band is returned with the score, so the screen states a derivation rather than asserting a
number. `scoredBy` reads `RULES`, and per ADR-081 the surface **must not** describe the score as
AI-derived while it does.

Weights and thresholds are not in code. They live in
`backend/src/modules/identity/device-trust/trust-score/device-trust-rules.v1.json`, which the
serving TypeScript scorer and the Python training-time baseline both read.

## Intended model (when the gate is cleared)

- **Algorithm:** XGBoost binary classifier, probability **calibrated**, rendered 0–100 (§22.6). An
  uncalibrated boosted-tree score is not a probability, and "87%" on a security screen has to mean
  87%.
- **Positive class:** a device whose enrolment was revoked with reason `COMPROMISED`.
- **Features:** the same five above, extracted point-in-time.
- **Pipeline:** `mlops/airflow/dags/dag_train_device_trust_model.py` · MLflow registry · Evidently
  drift (ADR-038).

## Promotion gate

> **No minimum-count threshold.** Promoted only when it beats the rule-based baseline on a held-out
> set, measured by **PR-AUC** (§22.6, ADR-081).

PR-AUC and not ROC-AUC or accuracy: under this imbalance ROC-AUC stays flattering while the model is
useless on the positive class, and accuracy is maximised by predicting "trusted" every time — which
is exactly the 98%-for-everyone failure being removed.

### Promotion record

| Date | Baseline PR-AUC | Model PR-AUC | Margin | Held-out set | Approved by |
| ---- | --------------- | ------------ | ------ | ------------ | ----------- |
| —    | —               | —            | —      | —            | —           |

**Empty is the expected state, not an omission.** ADR-081 accepts that the model may never pass its
gate. No row here means no model may be deployed and the surface keeps reporting `RULES`.

## Training and evaluation data

|              |                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source       | `platform.trusted_devices` + `platform.audit_logs`, exported to the MinIO data lake as Parquet                                                                                             |
| Label column | `revocation_reason = 'COMPROMISED'` (migration `20260805000001`)                                                                                                                           |
| Excluded     | Revocations recorded **before** that migration — they carry a NULL reason and are neither confirmed compromises nor confirmed benign, so defaulting them either way would fabricate labels |
| Excluded     | `USER_REVOKED`, `ADMIN_REVOKED`, `LOST_OR_STOLEN` as positives — ordinary fleet churn; counting them would teach the model that retiring a phone looks like an attack                      |
| Volume       | Not yet measured. The positive class is rare **by design** in a fleet where trust is earned and revocation is manual                                                                       |
| Split        | Held-out set must be the same one `compute_baseline` scored — a control computed on a different split is not a control                                                                     |

## Known limitations

1. **A COMPROMISED marking can be cleared by re-enrolment.** `registerDevice` resets
   `revocation_reason` to NULL when a revoked device re-enrols. That is correct for labelling — the
   re-enrolled device is not the compromised one — but it means the revocation-history signal, and
   the label, both disappear when a user re-adds a device that was marked compromised. Recorded here
   rather than fixed silently; changing it is a separate decision with its own trade-off.
2. **The training baseline and the serving scorer are separate implementations** (Python and
   TypeScript). They read one rules file and are pinned to one set of golden vectors run by both
   suites, so a drift in either turns a test red — but the _feature extraction_ differs by
   necessity (SQL rows versus Parquet), and that step is not covered by the shared vectors.
3. **Scores are not logged.** The training set is therefore reconstructed features rather than the
   features actually served, which is a residual training/serving skew that the shared rules file
   narrows but does not eliminate. Logging served scores would remove it entirely (Google _Rules of
   ML_ #29) at the cost of a new PII table — score, signals and timestamp per device is a
   confidence judgement about a named person, carrying retention, erasure and data-flow-map
   consequences, and cutting against ADR-080's derive-never-persist principle. **Deferred by the
   product owner (2026-08-05): to be decided by a new ADR plus PDPA review before real training
   begins.** It does not block the current work, because with no model there is no gate to run.
4. **ASN stability abstains rather than accuses.** In a deployment with no GeoLite2 database — dev,
   CI, and every air-gapped install until the MaxMind licence is cleared by legal (ADR-080) — this
   signal reports INSUFFICIENT_DATA and scores at the two-network level. Scores from such a
   deployment are not comparable with scores from one that has the database.
5. **iOS carries no integrity tier at all.** App Attest attests the app on genuine Apple hardware and
   emits no device-level verdict (ADR-083). `PASSED_NO_TIER` is scored just below `PASSED_STRONG`;
   iOS and Android scores are therefore not measuring quite the same thing, and cross-platform
   comparison of individual scores is not supported.
6. **Not a location signal.** Roaming across carriers is normal work on a construction site. ASN
   instability costs at most 12 of 100 points and never caps.

## Governance

- **Advisory, permanently.** The score never revokes a device and never blocks a login. §22.3 bars a
  model from executing a state transition that requires a human, and locking a field worker out of
  the app on a score's say-so is exactly that class of action. The property is enforced while the
  scorer is rules too, so a regression cannot become an outage.
- **Kill switch:** `s1.identity.device-trust-score` (QM-15), default OFF until rollout. Because the
  score is advisory, OFF costs a user one panel and costs the platform nothing — which makes
  fail-closed the right direction here.
- **Access:** `GET /api/v1/auth/devices/:deviceId/trust`, scoped by the JWT's own `user_id` **and**
  the device id. Another user's device and an unknown device leave by the same 404, so the response
  cannot confirm that someone else's enrolment exists.
- **PDPA:** nothing this feature derives is written back. ASN numbers are resolved from addresses
  already collected and already tagged, counted, and discarded (ADR-080). No score is persisted —
  see limitation 3.
- **Provenance:** every response carries `rulesVersion`, so a score a person saw can be tied to the
  rules that produced it. After promotion it must carry the MLflow model version instead.

## References

- `docs/architecture/adr/081-device-trust-model.md` — the decision, the gate, and the naming rule
- `docs/architecture/adr/082-device-attestation-v2-accepted.md`, `083-security-patch-level-source.md`
- `docs/architecture/adr/080-geoip-enrichment-and-behavioral-context.md` — the ASN signal
- `docs/specifications/22-ai-architecture.md` §22.3, §22.6, §22.9
- `backend/src/modules/identity/device-trust/trust-score/` — the serving scorer, its rules file and
  the golden vectors
- `mlops/models/device_trust_baseline.py`, `device_trust_model.py`,
  `mlops/airflow/dags/dag_train_device_trust_model.py`
- `backend/prisma/migrations/20260805000001_device_attestation_and_revocation_reason/`
