"""Verified tenant resolution for the AI Gateway (spec §5.9.4 + zero-trust).

**The tenant comes from a token this service verifies itself. Nothing else.** RS256 via JWKS, with
issuer, audience and expiry checked, and the tenant read from the `tenant_id` claim — never from a
query parameter, a request body, or a header.

WHY THE HEADER IS NO LONGER A SOURCE (TDD OQ-46)
------------------------------------------------
This module used to accept `x-tenant-id` on its own when a request carried no bearer token, on the
stated grounds that Kong had verified the JWT at the edge, stripped any client-supplied identity
headers, and injected that one itself. Two independent layers, neither trusted alone.

**Layer 1 is not deployed.** `infrastructure/kubernetes/kong/kong-declarative.yml` — the file that
configures the strip-and-inject, and the only place `key_claim_name: azp` and an anonymous consumer
appear — is applied by nothing: no ArgoCD Application references
`infrastructure/kubernetes/kong/` (every one points at a Helm chart or the otel overlays), there are
no `KongPlugin` CRDs anywhere in the repository, and the two charts that name `className: kong` do so
on an Ingress that defaults to `enabled: false`.

So the header had no verifier in front of it. This service is `ClusterIP` with no Ingress and no
NetworkPolicy, which keeps the internet out but leaves every pod in the cluster able to send
`x-tenant-id: <any tenant>` with no credential at all and be served that tenant's data. The
`get_verified_tenant` docstring promised two layers and there was, in the deployed topology, less
than one.

Requiring the token costs nothing: the only callers of these endpoints are the web and mobile apps,
which always send `Authorization`. The backend never calls this service, and the MLOps
model-promotion job uses `/internal/models/{name}/reload` with `X-Internal-Token`, which does not go
through this dependency.

If a verifying gateway is deployed later it still cannot be the only check: a header that agrees with
the token is accepted, a header that disagrees fails closed, and a header alone is refused.

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
    token_tenant = _tenant_from_bearer(request)
    if not token_tenant:
        # No bearer token, so nothing to verify. A gateway-injected header is NOT a substitute — see
        # the module docstring: the gateway that was supposed to place it there is deployed nowhere,
        # which made this branch "any pod in the cluster may name its own tenant".
        raise HTTPException(status_code=401, detail="Missing authenticated tenant")

    header_tenant = request.headers.get("x-tenant-id") or None
    if header_tenant and header_tenant != token_tenant:
        # A gateway that verified the token would have injected the same value. Disagreement means one
        # of them is lying, and there is no way to tell which — fail closed.
        raise HTTPException(status_code=401, detail="Tenant mismatch between gateway and token")

    return token_tenant
