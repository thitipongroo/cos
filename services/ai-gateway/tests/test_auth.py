"""Unit tests for auth.get_verified_tenant — in-service Keycloak JWT verification (defense-in-depth).

Handlers/deps are called directly with a fake Request and a monkeypatched JWKS client + jwt.decode,
so no network or real token is needed. The security-critical assertions: a client-supplied tenant is
never trusted; the tenant of a verified user token is the BACKEND's answer, not the token's own claim
(ADR-107); a header that disagrees with it fails closed; and a backend that cannot answer is a 503.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import auth
import pytest
from fastapi import HTTPException


class _Req:
    """Minimal stand-in for starlette Request — code only reads lower-cased header names."""

    def __init__(self, **headers):
        self.headers = headers


def _fake_jwks(monkeypatch):
    class _Key:
        key = "pubkey"

    class _Client:
        def get_signing_key_from_jwt(self, token):
            return _Key()

    monkeypatch.setattr(auth, "_jwks_client", lambda: _Client())


def _backend_says(monkeypatch, tenant="t-backend"):
    """Stand in for the backend's /auth/identity (ADR-107); records what it was asked."""
    calls = []

    def fake(authorization, exp, now=None):
        calls.append((authorization, exp))
        return tenant

    monkeypatch.setattr(auth, "_tenant_from_backend", fake)
    return calls


class TestTenantFromBearer:
    def test_no_authorization_header_returns_none(self):
        assert auth._tenant_from_bearer(_Req()) is None

    def test_non_bearer_scheme_returns_none(self):
        assert auth._tenant_from_bearer(_Req(authorization="Basic abc")) is None

    def test_valid_token_returns_the_backends_tenant_not_the_claim(self, monkeypatch):
        # ADR-107: the claim is a Keycloak user attribute a user could rewrite. The backend's answer wins.
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(
            auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-claimed", "exp": 1900000000}
        )
        calls = _backend_says(monkeypatch)
        assert auth._tenant_from_bearer(_Req(authorization="Bearer xxx")) == "t-backend"
        assert calls == [("Bearer xxx", 1900000000)]

    def test_invalid_token_raises_401(self, monkeypatch):
        _fake_jwks(monkeypatch)

        def boom(*a, **k):
            raise ValueError("bad signature")

        monkeypatch.setattr(auth.jwt, "decode", boom)
        with pytest.raises(HTTPException) as exc:
            auth._tenant_from_bearer(_Req(authorization="Bearer xxx"))
        assert exc.value.status_code == 401

    def test_token_without_tenant_claim_raises_401(self, monkeypatch):
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"sub": "u"})
        calls = _backend_says(monkeypatch)
        with pytest.raises(HTTPException) as exc:
            auth._tenant_from_bearer(_Req(authorization="Bearer xxx"))
        assert exc.value.status_code == 401
        assert calls == []


class TestGetVerifiedTenant:
    def test_token_only(self, monkeypatch):
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-claimed"})
        _backend_says(monkeypatch, "t-1")
        assert auth.get_verified_tenant(_Req(authorization="Bearer x")) == "t-1"

    def test_header_alone_is_refused(self):
        # TDD OQ-46. This used to return "t-2". The justification was that Kong verified the token at
        # the edge and injected the header itself — but the Kong config that does the strip-and-inject
        # is applied by no ArgoCD Application, exists as no KongPlugin CRD, and the only charts naming
        # `className: kong` do so on an Ingress defaulting to disabled. With the gateway absent, this
        # branch let any pod in the cluster name its own tenant with no credential whatsoever.
        with pytest.raises(HTTPException) as exc:
            auth.get_verified_tenant(_Req(**{"x-tenant-id": "t-2"}))
        assert exc.value.status_code == 401

    def test_header_alone_is_refused_even_for_a_plausible_tenant(self, monkeypatch):
        # And it is refused because there is no token, not because the value looked wrong: a working
        # JWKS changes nothing when the request carries no Authorization header to verify.
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-2"})
        with pytest.raises(HTTPException) as exc:
            auth.get_verified_tenant(_Req(**{"x-tenant-id": "t-2"}))
        assert exc.value.status_code == 401

    def test_token_and_header_agree(self, monkeypatch):
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-claimed"})
        _backend_says(monkeypatch, "t-3")
        req = _Req(authorization="Bearer x", **{"x-tenant-id": "t-3"})
        assert auth.get_verified_tenant(req) == "t-3"

    def test_header_matching_only_the_claim_fails_closed(self, monkeypatch):
        # The header agrees with the self-edited claim but not with the backend: refused.
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-a"})
        _backend_says(monkeypatch, "t-real")
        req = _Req(authorization="Bearer x", **{"x-tenant-id": "t-a"})
        with pytest.raises(HTTPException) as exc:
            auth.get_verified_tenant(req)
        assert exc.value.status_code == 401

    def test_no_token_no_header_raises_401(self):
        with pytest.raises(HTTPException) as exc:
            auth.get_verified_tenant(_Req())
        assert exc.value.status_code == 401


class _Resp:
    def __init__(self, status, body=None, bad_json=False):
        self.status_code = status
        self.is_success = 200 <= status < 300
        self._body = body
        self._bad_json = bad_json

    def json(self):
        if self._bad_json:
            raise ValueError("not json")
        return self._body


class _FakeClient:
    """Stand-in for httpx.Client; the class attributes set per test decide the answer."""

    answer = None
    error = None
    calls = []

    def __init__(self, timeout):
        self.timeout = timeout

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get(self, url, headers):
        _FakeClient.calls.append((url, headers, self.timeout))
        if _FakeClient.error is not None:
            raise _FakeClient.error
        return _FakeClient.answer


NOW = 1_800_000_000.0
EXP_FAR = NOW + 3600


@pytest.fixture
def backend(monkeypatch):
    auth.clear_identity_cache()
    _FakeClient.answer = _Resp(200, {"tenant_id": "t1", "user_id": "u1", "role": "FINANCE"})
    _FakeClient.error = None
    _FakeClient.calls = []
    monkeypatch.setattr(auth.httpx, "Client", _FakeClient)
    monkeypatch.setenv("BACKEND_INTERNAL_URL", "http://backend:3000/")
    yield _FakeClient
    auth.clear_identity_cache()


def _ask(authorization="Bearer tok", exp=EXP_FAR, now=NOW):
    return auth._tenant_from_backend(authorization, exp, lambda: now)


class TestTenantFromBackend:
    def test_asks_with_the_callers_own_authorization_header(self, backend):
        assert _ask() == "t1"
        assert backend.calls == [
            ("http://backend:3000/api/v1/auth/identity", {"authorization": "Bearer tok"}, 5.0)
        ]

    def test_uses_the_real_clock_by_default(self, backend):
        assert auth._tenant_from_backend("Bearer tok", None) == "t1"

    def test_repeated_token_is_answered_from_the_cache(self, backend):
        _ask()
        _ask()
        assert len(backend.calls) == 1

    def test_asks_again_after_30_seconds(self, backend):
        _ask()
        _ask(now=NOW + auth.CACHE_MAX_S)
        assert len(backend.calls) == 2

    def test_never_cached_past_the_token_expiry(self, backend):
        _ask(exp=NOW + 5)
        _ask(exp=NOW + 5, now=NOW + 5)
        assert len(backend.calls) == 2

    def test_no_exp_or_expired_token_is_not_cached(self, backend):
        _ask(authorization="Bearer a", exp=None)
        _ask(authorization="Bearer b", exp=NOW - 1)
        assert len(auth._identity_cache) == 0

    def test_evicts_the_oldest_when_full(self, backend, monkeypatch):
        monkeypatch.setattr(auth, "CACHE_MAX_ENTRIES", 2)
        _ask(authorization="Bearer 0")
        _ask(authorization="Bearer 1")
        _ask(authorization="Bearer 2")
        assert len(auth._identity_cache) == 2
        backend.calls = []
        _ask(authorization="Bearer 0")
        assert len(backend.calls) == 1

    @pytest.mark.parametrize("status", [401])
    def test_refusal_is_401_and_not_cached(self, backend, status):
        backend.answer = _Resp(status)
        with pytest.raises(HTTPException) as exc:
            _ask()
        assert exc.value.status_code == 401
        assert len(auth._identity_cache) == 0

    def test_unset_backend_url_is_503(self, backend, monkeypatch):
        monkeypatch.delenv("BACKEND_INTERNAL_URL")
        with pytest.raises(HTTPException) as exc:
            _ask()
        assert exc.value.status_code == 503
        assert backend.calls == []

    def test_malformed_backend_url_is_503_not_500(self, backend):
        backend.error = auth.httpx.InvalidURL("Invalid IPv6 URL")
        with pytest.raises(HTTPException) as exc:
            _ask()
        assert exc.value.status_code == 503

    def test_unreachable_backend_is_503(self, backend):
        backend.error = auth.httpx.ConnectError("refused")
        with pytest.raises(HTTPException) as exc:
            _ask()
        assert exc.value.status_code == 503

    @pytest.mark.parametrize("status", [403, 500, 502, 503, 404])
    def test_non_success_is_503(self, backend, status):
        backend.answer = _Resp(status)
        with pytest.raises(HTTPException) as exc:
            _ask()
        assert exc.value.status_code == 503

    def test_non_json_body_is_503(self, backend):
        backend.answer = _Resp(200, bad_json=True)
        with pytest.raises(HTTPException) as exc:
            _ask()
        assert exc.value.status_code == 503

    @pytest.mark.parametrize("body", [None, [], {}, {"tenant_id": ""}, {"tenant_id": 7}])
    def test_answer_without_a_tenant_is_503(self, backend, body):
        backend.answer = _Resp(200, body)
        with pytest.raises(HTTPException) as exc:
            _ask()
        assert exc.value.status_code == 503


def test_jwks_client_is_constructed(monkeypatch):
    auth._jwks_client.cache_clear()
    made = {}

    def fake_ctor(url):
        made["url"] = url
        return "client"

    monkeypatch.setattr(auth.jwt, "PyJWKClient", fake_ctor)
    assert auth._jwks_client() == "client"
    assert made["url"] == auth._JWKS_URL
    auth._jwks_client.cache_clear()
