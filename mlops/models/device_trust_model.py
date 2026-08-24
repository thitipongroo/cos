"""
DeviceTrustModel stub — Phase 23 (ADR-081, spec §22-ai-architecture §22.6)
Algorithm: XGBoost binary classifier; calibrated probability rendered 0-100.

ACTIVATION IS NOT A ROW COUNT. This is the one §22.6 model with no minimum-data threshold. Its
positive class — "this device was later revoked as compromised" — is rare by design in a fleet where
trust is earned and revocation is manual, so a calendar- or volume-based trigger of the kind the
other four use would fire while the positive class was still nearly empty and promote a model that
had learned almost nothing. The gate is instead:

    promoted only when it beats device_trust_baseline on a held-out set, measured by PR-AUC.

PR-AUC and not ROC-AUC or accuracy: under this imbalance ROC-AUC stays flattering while the model is
useless on the positive class, and accuracy is maximised by predicting "trusted" every time — which
is precisely the static 98%-for-everyone that ADR-081 exists to remove.

UNTIL THEN, THE BASELINE SERVES, and the surface says so. `scored_by` exists so a caller cannot
render "AI Verified" over an if-chain (ADR-081 Naming). While this class is inactive the score comes
from device_trust_baseline via the backend's TypeScript port of the same rules file.

ADVISORY, PERMANENTLY. §22.3 bars AI from executing a state transition that requires a human. This
model renders a score; it never revokes a device and never blocks a login. A false negative on a
security score should cost a warning, not a worker's shift.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from mlops.models.device_trust_baseline import TrustFeatures, score_device


@dataclass(frozen=True)
class TrustScore:
    """0-100 plus the provenance the transparency screen is required to state."""

    score: int
    max_score: int
    #: "RULES" while the baseline serves, "MODEL" only after a promotion that cleared the PR-AUC gate.
    scored_by: str
    #: The rules file version, or the MLflow model version once a model is serving.
    version: str


class DeviceTrustModel:
    """
    Stub. A concrete implementation requires, in order:

    1. Labels: `platform.trusted_devices.revocation_reason = 'COMPROMISED'` rows exported to the data
       lake (migration 20260805000001 added the column so the label exists at all).
    2. A held-out set on which `device_trust_baseline` has been scored — the control.
    3. A trained XGBoost binary classifier whose PR-AUC EXCEEDS that control's.
    4. An MLflow model registered at 'device-trust-model' stage=Production, and a model card recording
       the PR-AUC margin that authorised the promotion (§22.9 — the model may not be deployed
       without it).

    There is deliberately no `if not trained: fall back to rules` path here. The backend serves the
    baseline directly; a silent fallback inside the model would make "which scorer produced this
    number" a runtime accident, and that is the one thing ADR-081 requires the surface to state.
    """

    def __init__(self, model_uri: Optional[str] = None) -> None:
        # TODO: mlflow.xgboost.load_model(model_uri) once the PR-AUC gate has been cleared
        self._model = None

    def predict(self, features: TrustFeatures) -> TrustScore:
        raise NotImplementedError(
            "DeviceTrustModel.predict — not active. Promotion is gated on beating "
            "device_trust_baseline on PR-AUC (ADR-081), not on a data threshold. "
            "Use device_trust_baseline.score_device until that gate is cleared."
        )

    @staticmethod
    def baseline(features: TrustFeatures) -> TrustScore:
        """
        The control, in this module's return type — so a caller comparing the two cannot accidentally
        compare a model score against a differently-shaped number.
        """
        result = score_device(features)
        return TrustScore(
            score=result["score"],
            max_score=result["maxScore"],
            scored_by=result["scoredBy"],
            version=result["rulesVersion"],
        )
