"""Unit tests for auth.get_verified_tenant — in-service Keycloak JWT verification (defense-in-depth).

Handlers/deps are called directly with a fake Request and a monkeypatched JWKS client + jwt.decode,
so no network or real token is needed. The security-critical assertions: a client-supplied tenant is
never trusted (tenant comes only from a verified token or the Kong-verified header), and a token that
disagrees with the gateway header fails closed.
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


class TestTenantFromBearer:
    def test_no_authorization_header_returns_none(self):
        assert auth._tenant_from_bearer(_Req()) is None

    def test_non_bearer_scheme_returns_none(self):
        assert auth._tenant_from_bearer(_Req(authorization="Basic abc")) is None

    def test_valid_token_returns_tenant(self, monkeypatch):
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-1"})
        assert auth._tenant_from_bearer(_Req(authorization="Bearer xxx")) == "t-1"

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
        with pytest.raises(HTTPException) as exc:
            auth._tenant_from_bearer(_Req(authorization="Bearer xxx"))
        assert exc.value.status_code == 401


class TestGetVerifiedTenant:
    def test_token_only(self, monkeypatch):
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-1"})
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
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-3"})
        req = _Req(authorization="Bearer x", **{"x-tenant-id": "t-3"})
        assert auth.get_verified_tenant(req) == "t-3"

    def test_token_and_header_mismatch_fails_closed(self, monkeypatch):
        _fake_jwks(monkeypatch)
        monkeypatch.setattr(auth.jwt, "decode", lambda *a, **k: {"tenant_id": "t-a"})
        req = _Req(authorization="Bearer x", **{"x-tenant-id": "t-b"})
        with pytest.raises(HTTPException) as exc:
            auth.get_verified_tenant(req)
        assert exc.value.status_code == 401

    def test_no_token_no_header_raises_401(self):
        with pytest.raises(HTTPException) as exc:
            auth.get_verified_tenant(_Req())
        assert exc.value.status_code == 401


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
