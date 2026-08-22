// @Global — the backend's own service credential (TDD OQ-46).
//
// Global for the same reason EventsModule is: ServiceTokenService holds ONE cached token with one
// refresh timer, and providing it per-module would give each importer its own cache and its own
// 15-minutely round trip to Keycloak for a token identical to the others'.

import { Global, Module } from '@nestjs/common';
import { ServiceTokenService } from './service-token.service';

@Global()
@Module({
  providers: [ServiceTokenService],
  exports: [ServiceTokenService],
})
export class ServiceAuthModule {}
