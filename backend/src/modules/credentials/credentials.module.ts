import { Module } from '@nestjs/common';
import { CredentialClientService } from './credential-client.service';

// CredentialsModule — exposes the REST client for the CredentialService microservice
// (services/credential-service/, ADR-067). Consumed by contract signing (ADR-058) and BG-001
// worker/equipment/training credentialing. No controllers: the service is called internally by
// other modules, not exposed as its own HTTP surface here.
@Module({
  providers: [CredentialClientService],
  exports: [CredentialClientService],
})
export class CredentialsModule {}
