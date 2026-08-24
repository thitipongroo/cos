"""Shared pytest fixtures for the ai-gateway suite.

Every tenant-scoped endpoint now derives its tenant from a verified source (auth.get_verified_tenant
— an in-service Keycloak JWT check, cross-checked against the Kong-injected x-tenant-id header),
never from a request body/query parameter. The TestClient-based tests in this suite send no bearer
token, so this autouse fixture stubs that dependency to a fixed tenant. The real verification logic
is exercised directly in test_auth.py; here we only need endpoints to proceed past the auth gate.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest


@pytest.fixture(autouse=True)
def _override_verified_tenant():
    from auth import get_verified_tenant
    from main import app

    app.dependency_overrides[get_verified_tenant] = lambda: "tenant-abc"
    yield
    app.dependency_overrides.pop(get_verified_tenant, None)
