"""
The rule-based device trust baseline (ADR-081) and its parity with the serving scorer.

This is one half of a two-language contract. The other half is
backend/src/modules/identity/device-trust/trust-score/__tests__/trust-score.spec.ts, and both run the
SAME golden vector file. ADR-081 promotes DeviceTrustModel only when it beats "the rule-based
baseline"; if this implementation drifted from the one people are served, the PR-AUC gate would be
measuring the model against a baseline nobody uses, and would pass or fail for reasons unrelated to
the product. A change to either side that is not matched by the other turns one of the two suites red
— that is the entire mechanism (product-owner decision, 2026-08-05).
"""

from __future__ import annotations

import json

import pytest

from mlops.models.device_trust_baseline import (
    GOLDEN_PATH,
    RULES_PATH,
    TrustFeatures,
    asn_band,
    attestation_band,
    baseline_probability,
    enrolment_age_band,
    load_rules,
    recency_band,
    revocation_band,
    score_device,
)
from mlops.models.device_trust_model import DeviceTrustModel


@pytest.fixture(scope="module")
def rules():
    return load_rules()


@pytest.fixture(scope="module")
def golden():
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def _features(raw: dict) -> TrustFeatures:
    """The golden file is written in the TypeScript field names — one file, two naming conventions."""
    return TrustFeatures(
        attestation_verdict=raw["attestationVerdict"],
        integrity_level=raw["integrityLevel"],
        enrolment_age_days=raw["enrolmentAgeDays"],
        last_seen_days_ago=raw["lastSeenDaysAgo"],
        compromise_on_record=raw["compromiseOnRecord"],
        non_compromise_revocation_days_ago=raw["nonCompromiseRevocationDaysAgo"],
        distinct_asn_count=raw["distinctAsnCount"],
        asn_observations=raw["asnObservations"],
    )


CLEAN = TrustFeatures(
    attestation_verdict="PASSED",
    integrity_level="STRONG",
    enrolment_age_days=90,
    last_seen_days_ago=0,
    compromise_on_record=False,
    non_compromise_revocation_days_ago=None,
    distinct_asn_count=1,
    asn_observations=10,
)


# ─── The shared file ──────────────────────────────────────────────────────────


class TestSharedRulesFile:
    def test_reads_the_file_the_backend_serves_from(self):
        """
        Not a copy under mlops/. If this path ever stops resolving, the parity guarantee is gone and
        this failure is the only thing that would say so.
        """
        assert RULES_PATH.is_file(), f"shared rules file missing at {RULES_PATH}"
        assert GOLDEN_PATH.is_file(), f"shared golden vectors missing at {GOLDEN_PATH}"

    def test_weights_sum_to_the_maximum_score(self, rules):
        """A re-tuned band that is not matched elsewhere makes 100 unreachable or exceedable."""
        assert sum(max(group.values()) for group in rules["bands"].values()) == rules["maxScore"]

    def test_golden_vectors_were_computed_against_these_rules(self, rules, golden):
        assert golden["rulesVersion"] == rules["rulesVersion"]


# ─── Parity ───────────────────────────────────────────────────────────────────


class TestGoldenVectors:
    def test_every_vector_scores_identically_to_the_serving_scorer(self, golden, rules):
        for vector in golden["vectors"]:
            result = score_device(_features(vector["features"]), rules)
            expected = vector["expected"]
            assert result["score"] == expected["score"], vector["name"]
            assert result["capped"] == expected["capped"], vector["name"]
            assert result["bands"] == expected["bands"], vector["name"]

    def test_every_band_of_every_signal_is_covered(self, golden, rules):
        """Parity is only worth what the vectors cover; an unexercised band could differ in silence."""
        seen = {band for v in golden["vectors"] for band in v["expected"]["bands"].values()}
        declared = {band for group in rules["bands"].values() for band in group}
        assert declared - seen == set()


# ─── Bands ────────────────────────────────────────────────────────────────────


class TestAttestationBand:
    def test_never_asked_outranks_asked_and_unanswered(self, rules):
        """
        An enrolment predating the attestation migration is a fact about the platform's history;
        UNAVAILABLE is a fact about this device now. Collapsing them would make an old-but-honest
        device indistinguishable from one whose platform integrity is currently unknowable.
        """
        assert attestation_band(None, None) == "NOT_ATTEMPTED"
        assert attestation_band("UNAVAILABLE", None) == "UNAVAILABLE"
        bands = rules["bands"]["attestation"]
        assert bands["NOT_ATTEMPTED"] > bands["UNAVAILABLE"]

    def test_passing_ios_is_not_treated_as_a_weak_answer(self, rules):
        """App Attest emits no device tier at all; scoring that absence low marks every iPhone down."""
        assert attestation_band("PASSED", None) == "PASSED_NO_TIER"
        bands = rules["bands"]["attestation"]
        assert bands["PASSED_DEVICE"] < bands["PASSED_NO_TIER"] < bands["PASSED_STRONG"]

    @pytest.mark.parametrize(
        "level,expected",
        [("STRONG", "PASSED_STRONG"), ("DEVICE", "PASSED_DEVICE"), ("BASIC", "PASSED_BASIC")],
    )
    def test_each_android_tier_has_its_own_band(self, level, expected):
        assert attestation_band("PASSED", level) == expected

    def test_failed_stays_failed_whatever_tier_accompanies_it(self, rules):
        assert attestation_band("FAILED", "STRONG") == "FAILED"
        assert rules["bands"]["attestation"]["FAILED"] == 0


class TestRecencyBand:
    @pytest.mark.parametrize(
        "days,expected",
        [
            (7, "SEEN_WITHIN_FRESH_WINDOW"),
            (8, "SEEN_WITHIN_TRUST_WINDOW"),
            (30, "SEEN_WITHIN_TRUST_WINDOW"),
            (31, "STALE"),
        ],
    )
    def test_boundaries_are_inclusive(self, days, expected, rules):
        assert recency_band(days, rules["thresholds"]) == expected


class TestEnrolmentAgeBand:
    @pytest.mark.parametrize(
        "days,expected",
        [
            (90, "AT_LEAST_90_DAYS"),
            (89, "AT_LEAST_30_DAYS"),
            (30, "AT_LEAST_30_DAYS"),
            (29, "AT_LEAST_7_DAYS"),
            (7, "AT_LEAST_7_DAYS"),
            (0, "UNDER_7_DAYS"),
        ],
    )
    def test_thresholds_are_inclusive_lower_bounds(self, days, expected, rules):
        assert enrolment_age_band(days, rules["thresholds"]) == expected


class TestRevocationBand:
    def test_a_confirmed_compromise_is_graded_apart_from_churn(self, rules):
        t = rules["thresholds"]
        assert revocation_band(True, None, t) == "COMPROMISE_ON_RECORD"
        assert revocation_band(False, 20, t) == "NON_COMPROMISE_RECENT"
        assert revocation_band(False, None, t) == "CLEAN"

    def test_a_non_compromise_revocation_ages_out(self, rules):
        t = rules["thresholds"]
        assert revocation_band(False, 90, t) == "NON_COMPROMISE_RECENT"
        assert revocation_band(False, 91, t) == "CLEAN"

    def test_grades_differently_from_the_training_label(self, rules):
        """
        The label counts only COMPROMISED, because marking ordinary churn as an attack would teach the
        model that retiring a phone looks like one. The SCORE answers a different question, so a
        handset lost last week is worth points here and nothing to the label.
        """
        bands = rules["bands"]["revocationHistory"]
        assert bands["NON_COMPROMISE_RECENT"] > bands["COMPROMISE_ON_RECORD"]


class TestAsnBand:
    def test_abstains_below_the_observation_floor(self, rules):
        t = rules["thresholds"]
        assert asn_band(1, 2, t) == "INSUFFICIENT_DATA"
        assert asn_band(1, 3, t) == "SINGLE_ASN"

    def test_abstains_rather_than_accuses_without_a_geolite_database(self, rules):
        """Every lookup returns nothing there, so the count is 0 at any number of observations."""
        t = rules["thresholds"]
        assert asn_band(0, 500, t) == "INSUFFICIENT_DATA"
        bands = rules["bands"]["asnStability"]
        assert bands["INSUFFICIENT_DATA"] == bands["TWO_ASNS"]

    @pytest.mark.parametrize(
        "count,expected",
        [(2, "TWO_ASNS"), (3, "THREE_TO_FOUR_ASNS"), (4, "THREE_TO_FOUR_ASNS"), (5, "FIVE_OR_MORE_ASNS")],
    )
    def test_counts_up_through_the_roaming_bands(self, count, expected, rules):
        assert asn_band(count, 10, rules["thresholds"]) == expected


# ─── Caps ─────────────────────────────────────────────────────────────────────


class TestCaps:
    def test_a_rooted_device_stays_down_however_familiar(self, rules):
        rooted = score_device(
            TrustFeatures(**{**CLEAN.__dict__, "attestation_verdict": "FAILED", "integrity_level": None}),
            rules,
        )
        assert rooted["score"] == rules["caps"]["ATTESTATION_FAILED"]
        assert rooted["capped"] is True

    def test_a_pristine_device_on_a_compromised_account_stays_down(self, rules):
        tainted = score_device(
            TrustFeatures(**{**CLEAN.__dict__, "compromise_on_record": True}), rules
        )
        assert tainted["score"] == rules["caps"]["COMPROMISE_ON_RECORD"]
        assert tainted["capped"] is True

    def test_a_cap_is_a_ceiling_never_a_floor(self, rules):
        """The single most likely misreading: the worst device must not be LIFTED to the cap."""
        worst = score_device(
            TrustFeatures(
                attestation_verdict="FAILED",
                integrity_level=None,
                enrolment_age_days=0,
                last_seen_days_ago=400,
                compromise_on_record=True,
                non_compromise_revocation_days_ago=1,
                distinct_asn_count=9,
                asn_observations=60,
            ),
            rules,
        )
        assert worst["score"] < rules["caps"]["ATTESTATION_FAILED"]
        # …and nothing was held back — the signals really did sum this low.
        assert worst["capped"] is False


# ─── Provenance and the gate's sign convention ────────────────────────────────


class TestProvenance:
    def test_the_baseline_never_calls_itself_a_model(self):
        """ADR-081 Naming: AI-derived only after promotion. An if-chain is not a model."""
        assert score_device(CLEAN)["scoredBy"] == "RULES"
        assert DeviceTrustModel.baseline(CLEAN).scored_by == "RULES"

    def test_the_report_carries_the_rules_version(self, rules):
        assert score_device(CLEAN, rules)["rulesVersion"] == rules["rulesVersion"]


class TestBaselineProbability:
    def test_ranks_opposite_to_the_trust_score(self):
        """
        PR-AUC is computed over a ranking and both sides of the gate must rank the same direction: the
        positive class is "compromised", while a HIGH trust score means the opposite. Reversed, a
        promotion decision flips.
        """
        trusted = baseline_probability(CLEAN)
        rooted = baseline_probability(
            TrustFeatures(**{**CLEAN.__dict__, "attestation_verdict": "FAILED", "integrity_level": None})
        )
        assert rooted > trusted

    def test_stays_within_the_unit_interval(self, golden):
        for vector in golden["vectors"]:
            p = baseline_probability(_features(vector["features"]))
            assert 0.0 <= p <= 1.0, vector["name"]


class TestModelStubIsNotSilentlyActive:
    def test_predict_refuses_rather_than_returning_a_number(self):
        """
        A stub that returned the baseline from predict() would make "which scorer produced this" a
        runtime accident — the one thing ADR-081 requires the surface to state.
        """
        with pytest.raises(NotImplementedError, match="PR-AUC"):
            DeviceTrustModel().predict(CLEAN)
