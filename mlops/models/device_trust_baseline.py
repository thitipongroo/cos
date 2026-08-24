"""
The rule-based device trust baseline — Phase 23 (ADR-081)

THIS IS NOT A STUB. Unlike the four models beside it, this file has to work today: ADR-081 promotes
DeviceTrustModel only when it beats "the rule-based baseline on a held-out set, measured by PR-AUC",
and this is that baseline. A gate needs something real on both sides of the comparison.

WHY THE NUMBERS ARE SOMEWHERE ELSE. The rules that SERVE are in the backend
(backend/src/modules/identity/device-trust/trust-score/), because the score is rendered on a mobile
transparency screen by the Node application. If the baseline used in the promotion gate were a
second, hand-copied implementation, it would drift from the one people are actually served, and the
gate would then pass or fail for reasons unrelated to the product — the classic training/serving
skew. So both implementations read ONE file, device-trust-rules.v1.json, and both are checked against
ONE set of golden vectors (product-owner decision, 2026-08-05).

That file lives under backend/src rather than here for a mechanical reason worth writing down: the
backend's production build sets rootDir to ./src, so a JSON imported from outside it would compile in
development and be missing from the container. The serving path gets to keep its file; this reads it.

SCOPE. Everything here is pure arithmetic over already-extracted features. Reading the features out
of Parquet is the DAG's job, not this module's — see dag_train_device_trust_model.py.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

# backend/src/modules/identity/device-trust/trust-score/ — see the module docstring for why there.
_TRUST_SCORE_DIR = (
    Path(__file__).resolve().parents[2]
    / "backend"
    / "src"
    / "modules"
    / "identity"
    / "device-trust"
    / "trust-score"
)
RULES_PATH = _TRUST_SCORE_DIR / "device-trust-rules.v1.json"
GOLDEN_PATH = _TRUST_SCORE_DIR / "device-trust-golden.json"


def load_rules(path: Path = RULES_PATH) -> dict[str, Any]:
    """Read the shared rules. Deliberately not cached at import — the tests swap the file."""
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass(frozen=True)
class TrustFeatures:
    """
    The scorer's entire input.

    Ages are whole days rather than timestamps because "now" differs between the two callers: the
    backend means the request, the training pipeline means the snapshot date. Passing dates would
    leave two definitions of the present and one of them would be wrong.
    """

    attestation_verdict: Optional[str]
    integrity_level: Optional[str]
    enrolment_age_days: int
    last_seen_days_ago: int
    compromise_on_record: bool
    non_compromise_revocation_days_ago: Optional[int]
    distinct_asn_count: int
    asn_observations: int


def attestation_band(verdict: Optional[str], level: Optional[str]) -> str:
    """
    Platform integrity — the heaviest signal, and the only one about the device's current state
    rather than the history of its use.

    PASSED with no tier is structurally iOS: App Attest attests the app on genuine Apple hardware and
    emits no device tier at all. The Android verifier cannot reach this state, because a Play
    Integrity response carrying no recognised tier is mapped to FAILED at its source. So a missing
    tier alongside PASSED means "a platform without the concept", not a weak answer.
    """
    if verdict is None:
        return "NOT_ATTEMPTED"
    if verdict == "UNAVAILABLE":
        return "UNAVAILABLE"
    if verdict == "FAILED":
        return "FAILED"
    if level == "STRONG":
        return "PASSED_STRONG"
    if level == "DEVICE":
        return "PASSED_DEVICE"
    if level == "BASIC":
        return "PASSED_BASIC"
    return "PASSED_NO_TIER"


def recency_band(last_seen_days_ago: int, thresholds: dict[str, Any]) -> str:
    if last_seen_days_ago <= thresholds["recencyFreshDays"]:
        return "SEEN_WITHIN_FRESH_WINDOW"
    if last_seen_days_ago <= thresholds["trustWindowDays"]:
        return "SEEN_WITHIN_TRUST_WINDOW"
    return "STALE"


def enrolment_age_band(age_days: int, thresholds: dict[str, Any]) -> str:
    long_, medium, short = thresholds["enrolmentAgeDays"]
    if age_days >= long_:
        return "AT_LEAST_90_DAYS"
    if age_days >= medium:
        return "AT_LEAST_30_DAYS"
    if age_days >= short:
        return "AT_LEAST_7_DAYS"
    return "UNDER_7_DAYS"


def revocation_band(
    compromise_on_record: bool,
    non_compromise_days_ago: Optional[int],
    thresholds: dict[str, Any],
) -> str:
    """
    Grades DIFFERENTLY from the training label, deliberately.

    Migration 20260805000001 counts only COMPROMISED as a positive label, because labelling ordinary
    churn as an attack would teach the model that retiring a phone looks like one. A score answers a
    different question — risk right now — so a handset reported lost last week is worth noting here
    while contributing nothing to the label.
    """
    if compromise_on_record:
        return "COMPROMISE_ON_RECORD"
    if (
        non_compromise_days_ago is not None
        and non_compromise_days_ago <= thresholds["nonCompromiseRecentDays"]
    ):
        return "NON_COMPROMISE_RECENT"
    return "CLEAN"


def asn_band(distinct_asn_count: int, observations: int, thresholds: dict[str, Any]) -> str:
    """
    The only signal that abstains. Below the observation floor — or in a deployment with no GeoLite2
    database, where every lookup returns nothing and the count is 0 — this is INSUFFICIENT_DATA,
    scored at the two-network level rather than at zero. An air-gapped install has not established
    that its devices roam, and scoring absence as instability would mark an entire on-premise fleet
    down for an operator's licence decision (ADR-080).
    """
    if observations < thresholds["asnMinObservations"] or distinct_asn_count == 0:
        return "INSUFFICIENT_DATA"
    if distinct_asn_count == 1:
        return "SINGLE_ASN"
    if distinct_asn_count == 2:
        return "TWO_ASNS"
    if distinct_asn_count <= 4:
        return "THREE_TO_FOUR_ASNS"
    return "FIVE_OR_MORE_ASNS"


def score_device(features: TrustFeatures, rules: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """
    Score a device 0-100, with the band each signal landed in.

    The two caps are ceilings, never floors: `min` over the subtotal means a device failing every
    signal at once scores 3 rather than being lifted to 30. `capped` is therefore False in that case
    — nothing was held back, the signals really did sum that low — and True only when a single
    finding pulled the total below what the signals added up to.
    """
    rules = rules if rules is not None else load_rules()
    bands, caps, thresholds = rules["bands"], rules["caps"], rules["thresholds"]

    chosen = {
        "attestation": attestation_band(features.attestation_verdict, features.integrity_level),
        "recency": recency_band(features.last_seen_days_ago, thresholds),
        "enrolmentAge": enrolment_age_band(features.enrolment_age_days, thresholds),
        "revocationHistory": revocation_band(
            features.compromise_on_record,
            features.non_compromise_revocation_days_ago,
            thresholds,
        ),
        "asnStability": asn_band(
            features.distinct_asn_count, features.asn_observations, thresholds
        ),
    }

    subtotal = sum(bands[signal][band] for signal, band in chosen.items())

    ceilings = [rules["maxScore"]]
    if chosen["attestation"] == "FAILED":
        ceilings.append(caps["ATTESTATION_FAILED"])
    if chosen["revocationHistory"] == "COMPROMISE_ON_RECORD":
        ceilings.append(caps["COMPROMISE_ON_RECORD"])
    score = min([subtotal, *ceilings])

    return {
        "score": score,
        "maxScore": rules["maxScore"],
        "capped": score < subtotal,
        # Never "MODEL" from here. ADR-081: the surface may call the score AI-derived only once a
        # model has been promoted, and claiming it over an if-chain is the same class of dishonesty
        # as the static 98% this whole ADR exists to remove.
        "scoredBy": "RULES",
        "rulesVersion": rules["rulesVersion"],
        "bands": chosen,
    }


def baseline_probability(features: TrustFeatures, rules: Optional[dict[str, Any]] = None) -> float:
    """
    The baseline expressed as P(compromised), so it can be ranked against a classifier's output.

    PR-AUC is computed over a ranking, and the two sides of the gate must rank the same direction:
    the model's positive class is "this device was later found compromised", while a HIGH trust score
    means the opposite. Inverting here rather than in the DAG keeps the sign convention in one place,
    where getting it backwards would flip a promotion decision.
    """
    result = score_device(features, rules)
    return 1.0 - (result["score"] / result["maxScore"])
