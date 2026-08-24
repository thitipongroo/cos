"""Verified tenant resolution for the AI Gateway (defense-in-depth — spec §5.9.4 + zero-trust).

Two independent layers establish the caller's tenant; the service trusts neither the client nor any
single layer alone:

  1. Kong (edge) verifies the Keycloak JWT signature (jwt plugin), strips any client-supplied
     identity headers, and injects `x-tenant-id` from the verified token (request-transformer +
     post-function — same pattern as the file-service route, kong-declarative.yml §5.9.4).
  2. This service ALSO verifies the Keycloak JWT itself (RS256 via JWKS, issuer/audience/exp) and
     derives the tenant from the token claim — so it never depends on Kong alone, and never reads a
     tenant from a request query/body parameter (the previous behaviour, which let any authenticated
     caller read/write another tenant's data by passing an arbitrary tenant_id).

When both a Kong-injected `x-tenant-id` header and a verifiable bearer token are present they MUST
agree; a mismatch fails closed. The dependency raises 401 when neither a verifiable token nor a
gateway-verified header is available.

`get_verified_tenant` is a *sync* dependency on purpose: FastAPI runs sync dependencies in a
threadpool, so the (cached) JWKS network fetch never blocks the event loop.
"""
from __future__ import annotations

import functools
import os

import jwt
from fastapi import HTTPException, Request

_KEYCLOAK_URL = os.environ.get("KEYCLOAK_URL", "http://keycloak:8080")
_KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "construction-os")
# The token `iss` reflects Keycloak's public URL, which can differ from the backend-reachable URL
# (split-horizon) — mirror the backend's KeycloakJwtStrategy and allow an explicit override.
_ISSUER = os.environ.get("KEYCLOAK_ISSUER", f"{_KEYCLOAK_URL}/realms/{_KEYCLOAK_REALM}")
_AUDIENCE = os.environ.get("KEYCLOAK_AUDIENCE", "cos-backend")
_JWKS_URL = f"{_KEYCLOAK_URL}/realms/{_KEYCLOAK_REALM}/protocol/openid-connect/certs"


@functools.lru_cache(maxsize=1)
def _jwks_client() -> "jwt.PyJWKClient":
    # PyJWKClient caches signing keys in-process and refreshes on an unknown `kid`.
    return jwt.PyJWKClient(_JWKS_URL)


def _tenant_from_bearer(request: Request) -> str | None:
    """Verify the Authorization bearer token (if any) and return its tenant_id claim, else None."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=_AUDIENCE,
            issuer=_ISSUER,
            options={"require": ["exp", "iss", "aud"]},
        )
    except Exception as exc:  # bad signature / expired / wrong aud|iss / malformed
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    tenant = claims.get("tenant_id")
    if not tenant:
        raise HTTPException(status_code=401, detail="Token missing tenant_id claim")
    return str(tenant)


def get_verified_tenant(request: Request) -> str:
    """FastAPI dependency: the caller's tenant_id, cryptographically verified — never a client param."""
    header_tenant = request.headers.get("x-tenant-id") or None  # Kong-injected, verified at edge
    token_tenant = _tenant_from_bearer(request)

    if token_tenant and header_tenant and token_tenant != header_tenant:
        # Gateway and token disagree — fail closed.
        raise HTTPException(status_code=401, detail="Tenant mismatch between gateway and token")

    tenant = token_tenant or header_tenant
    if not tenant:
        raise HTTPException(status_code=401, detail="Missing authenticated tenant")
    return tenant
