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
which always send `Authorization` (the backend's AiProxyController forwards their tokens; since ADR-107 this
service in turn asks the backend who they are). The MLOps
model-promotion job uses `/internal/models/{name}/reload` with `X-Internal-Token`, which does not go
through this dependency.

If a verifying gateway is deployed later it still cannot be the only check: a header that agrees with
the token is accepted, a header that disagrees fails closed, and a header alone is refused.

WHY THE TOKEN'S OWN CLAIM IS NO LONGER THE TENANT EITHER (ADR-107)
------------------------------------------------------------------
`tenant_id` is a Keycloak USER ATTRIBUTE. Until the realm ran `unmanagedAttributePolicy: ADMIN_EDIT` a
signed-in user could rewrite their own through the Account API (measured 2026-09-14), and even under
ADMIN_EDIT anything able to set attributes can. A valid signature says Keycloak minted the token, not that
the attribute is true, and this service cannot read platform.users. So a verified USER token is forwarded
to the backend's `GET /api/v1/auth/identity`, which answers after realm binding, subject binding (ADR-106)
and the database role check (ADR-077), and the tenant is taken from that answer.

Fail closed: a backend refusal is 401; an unreachable backend, a non-2xx, or an answer without a tenant is
503 — never the claim. Answers are cached per SHA-256 of the Authorization header for the shorter of the
token's remaining lifetime and 30 s, in a map capped at 10 000 entries. Mirrors
packages/@cos/service-identity (the Node services' shared client).

`get_verified_tenant` is a *sync* dependency on purpose: FastAPI runs sync dependencies in a
threadpool, so the (cached) JWKS fetch and the backend call never block the event loop. The cache is
therefore shared between threads, hence the lock.
"""
from __future__ import annotations

import functools
import hashlib
import logging
import os
import threading
import time
from collections import OrderedDict
from typing import Callable

import httpx
import jwt
from fastapi import HTTPException, Request

_KEYCLOAK_URL = os.environ.get("KEYCLOAK_URL", "http://keycloak:8080")
_KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "construction-os")
# The token `iss` reflects Keycloak's public URL, which can differ from the backend-reachable URL
# (split-horizon) — mirror the backend's KeycloakJwtStrategy and allow an explicit override.
_ISSUER = os.environ.get("KEYCLOAK_ISSUER", f"{_KEYCLOAK_URL}/realms/{_KEYCLOAK_REALM}")
_AUDIENCE = os.environ.get("KEYCLOAK_AUDIENCE", "cos-backend")
_JWKS_URL = f"{_KEYCLOAK_URL}/realms/{_KEYCLOAK_REALM}/protocol/openid-connect/certs"

CACHE_MAX_S = 30.0
CACHE_MAX_ENTRIES = 10_000
_BACKEND_TIMEOUT_S = 5.0
_UNAVAILABLE = "Identity could not be verified right now — try again"

_logger = logging.getLogger("cos.ai.auth")
_identity_cache: "OrderedDict[str, tuple[str, float]]" = OrderedDict()
_identity_cache_lock = threading.Lock()


def clear_identity_cache() -> None:
    """Test seam: the cache is module state."""
    with _identity_cache_lock:
        _identity_cache.clear()


def _unavailable(reason: str) -> HTTPException:
    _logger.error("auth.identity.unavailable — refusing rather than trusting claims: %s", reason)
    return HTTPException(status_code=503, detail=_UNAVAILABLE)


def _tenant_from_backend(
    authorization: str, exp: object, now: Callable[[], float] = time.time
) -> str:
    """The caller's tenant as the backend verified it (ADR-107). Never the token's own claim."""
    key = hashlib.sha256(authorization.encode()).hexdigest()
    with _identity_cache_lock:
        hit = _identity_cache.get(key)
        if hit and hit[1] > now():
            return hit[0]
        if hit:
            del _identity_cache[key]

    base = os.environ.get("BACKEND_INTERNAL_URL")
    if not base:
        raise _unavailable("BACKEND_INTERNAL_URL is not set")
    try:
        with httpx.Client(timeout=_BACKEND_TIMEOUT_S) as client:
            resp = client.get(
                f"{base.rstrip('/')}/api/v1/auth/identity",
                headers={"authorization": authorization},
            )
    # InvalidURL is not an HTTPError in httpx 0.28.1 — a malformed BACKEND_INTERNAL_URL would otherwise
    # escape as a 500 (Rule 41 review, 2026-09-14).
    except (httpx.HTTPError, httpx.InvalidURL) as exc:
        raise _unavailable(f"backend unreachable: {exc}") from exc

    # Only 401 is the token being refused. 503 means the backend could not check it; a 403 or 404 is not a
    # verified identity either — fail closed as unavailable (revision R8).
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not resp.is_success:
        raise _unavailable(f"backend answered {resp.status_code}")
    try:
        body = resp.json()
    except ValueError as exc:
        raise _unavailable("backend answered a body that is not JSON") from exc
    tenant = body.get("tenant_id") if isinstance(body, dict) else None
    if not isinstance(tenant, str) or not tenant:
        raise _unavailable("backend answered without tenant_id")

    ttl = min(CACHE_MAX_S, float(exp) - now()) if isinstance(exp, (int, float)) else 0.0
    if ttl > 0:
        with _identity_cache_lock:
            if len(_identity_cache) >= CACHE_MAX_ENTRIES:
                _identity_cache.popitem(last=False)
            _identity_cache[key] = (tenant, now() + ttl)
    return tenant


@functools.lru_cache(maxsize=1)
def _jwks_client() -> "jwt.PyJWKClient":
    # PyJWKClient caches signing keys in-process and refreshes on an unknown `kid`.
    return jwt.PyJWKClient(_JWKS_URL)


def _tenant_from_bearer(request: Request) -> str | None:
    """Verify the Authorization bearer token (if any) and return the tenant the BACKEND gives for it.

    None when there is no bearer token. The token's own `tenant_id` claim only decides that this is a
    user's token; the tenant returned is the backend's (ADR-107).
    """
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
    if not claims.get("tenant_id"):
        raise HTTPException(status_code=401, detail="Token missing tenant_id claim")
    return _tenant_from_backend(auth.strip(), claims.get("exp"))


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
