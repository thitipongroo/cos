# 081: DeviceTrustModel — a fifth Phase 23 model, promoted only by beating a rule-based baseline

**Date:** 2026-08-04
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** ai, security, data

---

## Context

The mockup `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/03_03_device_id_details`
renders a "Real-time Trust Score" gauge at **98%**, labelled **AI Verified**, with the caption
"Device behavior and telemetry align perfectly with established secure baselines."

Nothing behind it exists. `platform.trusted_devices` (ADR-054) stores a public key, platform, model,
`last_seen_at`, `expires_at` and `revoked_at` — a device is trusted or it is not; there is no score.
`docs/specifications/22-ai-architecture.md` §22.6 names exactly four Phase 23 models
(DelayForecastModel, SafetyVisionModel, GraphMLModel, RiskClassifier), all four present under
`mlops/models/`. A trust score is a **fifth model that the spec does not define**.

The product owner's decision (2026-08-04) was explicit: keep the score **and** build a real model —
not a static number, and not an "AI" label over a hand-tuned formula.

The hard part is the label. The positive class is "this device was later found compromised", which is
rare by design in a fleet where trust is earned and revocation is manual. A count-based training
trigger of the kind §22.6 uses for the other four models ("90+ days", "10,000+ photos") would fire on
calendar time while the positive class was still nearly empty, and promote a model that had learned
almost nothing.

## Decision

Add **DeviceTrustModel** as the fifth Phase 23 model, and gate its promotion on **performance against
a baseline**, not on a data count.

**Day-one behaviour: a deterministic rule-based score.** The screen ships with a transparent score
computed from signals that already exist or arrive with ADR-082:

- platform attestation verdict (Play Integrity / App Attest — ADR-082)
- enrolment age (`created_at`) and recency (`last_seen_at`) against the 30-day sliding window
- revocation history for the user
- stability of the ingress ASN across recent sessions (derived, never stored — ADR-080)

The score is explainable on screen: each contributing signal is shown with its own state, so a low
score is actionable rather than oracular.

**The model, when it exists, replaces the scorer behind the same interface.**
`mlops/models/device_trust_model.py` — XGBoost binary classifier per §22.6's framework decision
(scikit-learn + XGBoost), with the probability calibrated and rendered 0–100. It joins the existing
MLOps pipeline: an Airflow DAG for training, MLflow for the registry, Evidently for drift, and a model
card per §22.9.

**Promotion gate (this is the amendment to §22.6):**

> DeviceTrustModel has **no minimum-count threshold**. It is promoted only when it beats the
> rule-based baseline on a held-out set, measured by **PR-AUC**.

**Labelling.** The positive class is a device whose enrolment was revoked and marked compromised —
which requires the revocation reason to be recorded. `DELETE /auth/devices/:deviceId` currently
records only that a revocation happened; a reason field is added so the label exists at all.

**Naming.** The screen says "Trust Score". It is described as AI-derived **only once the model is
promoted**; while the rule-based scorer is serving, the screen says so. Claiming "AI Verified" over
an `if`-chain is the same class of dishonesty as the static 98%.

**Governance.** Because the output influences a security surface, the model is **advisory**: it
renders a score and never itself revokes a device or blocks a login. §22.3's autonomous-mode
prohibition already bars AI from executing state transitions that require human approval, and locking
a field worker out of the app on a model's say-so is exactly that class of action.

## Rationale

- **PR-AUC, not ROC-AUC or accuracy.** Under severe class imbalance ROC-AUC stays flattering while
  the model is useless on the positive class, and accuracy is maximised by predicting "trusted"
  every time — which is precisely the 98%-for-everyone failure this ADR removes.
- **Beat-the-baseline is a real gate; a row count is a proxy.** The question that matters is "is the
  model better than the rules we already have", and that is directly measurable. A count answers a
  different question and answers it badly here.
- **A rule-based day one is not a stopgap, it is the control.** It is the comparison the model must
  beat, so it has to exist and be measured either way.
- **Advisory keeps a model error from becoming a lockout.** A false negative on a security score
  should cost a warning, not a worker's shift.

Alternatives rejected: **keep the static 98%** (states a fact about every device that is true of
none); **call the rule-based score "AI"** (misrepresents the mechanism on a security screen);
**train immediately on synthetic labels** (§22.9 model governance forbids shipping a model that
cannot be evaluated, and a wrong security score has a real victim); **let the score gate login**
(violates §22.3 and turns a model regression into an outage).

## Consequences

### Positive

- A real, explainable score from day one, and a defined path to a real model.
- Reuses the Phase 23 pipeline already on disk — no new MLOps infrastructure.

### Negative

- `docs/specifications/22-ai-architecture.md` §22.6 must be amended (a fifth row and a
  threshold that is a gate, not a number) — the first §22.6 row that does not carry a count.
- A revocation-reason field is a schema change on `platform.trusted_devices`.
- The model may never pass its gate; the rule-based scorer must be maintained as a permanent path,
  not treated as throwaway scaffolding.

### Neutral

- No behaviour change to device trust itself: ADR-054's earned-trust flow is untouched and the score
  is presentational.

## References

- `docs/specifications/22-ai-architecture.md` §22.6 (ML Models), §22.9 (model governance), §22.3
  (autonomous-mode prohibition)
- `mlops/models/` (the four existing models), `mlops/airflow/dags/`, `mlops/mlflow/`
- ADR-054 (`platform.trusted_devices`, earned trust), ADR-082 (attestation signals), ADR-038 (Evidently)
- `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/03_03_device_id_details`
- **That drawing was withdrawn on 2026-08-15**, with the whole `01_data_collection/**` set (~114
  screens). This decision and the screen it shipped are unaffected — ADR-085.
