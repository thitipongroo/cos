// EP-AUTH-003: EnterpriseSSOProvider
// Source: context/00_master_construction_os.md §Phase 2 Extension points
// Trigger: enterprise customer has existing IdP (AD, Okta) requiring SAML 2.0 federation
// Implementation: Keycloak Identity Provider configuration — no code change required.
// Keycloak supports SAML 2.0 out of the box via admin console per tenant realm.
// This EP is a configuration task, not a development task.

import { StubBase } from '../stub-base';

export class EnterpriseSSOProvider extends StubBase {
  readonly EP_ID = 'EP-AUTH-003';
  readonly EP_VERSION = '0.1.0';
  readonly TRIGGER =
    'Enterprise customer has existing IdP (AD/Okta) requiring SAML 2.0 federation into Keycloak realm';
  readonly PHASE = 'Phase 2';

  // N/A — this EP is implemented via Keycloak admin console configuration,
  // not application code. The stub exists for tracking and observability only.
  async configureSamlIdp(tenantId: string, _idpMetadataUrl: string): Promise<void> {
    this.logStubCall('configureSamlIdp', { tenantId, idpMetadataUrl: '[UNSPECIFIED]' });
    // Implementation: Keycloak Admin REST API call to create SAML Identity Provider
    // in the tenant's Keycloak realm. No application code change required.
  }
}
