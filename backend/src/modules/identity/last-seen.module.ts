// Global module for LastSeenService. JwtAuthGuard (used via @UseGuards across every feature module) is
// instantiated in each consuming module's injector, so — exactly like the global ClsService it also
// depends on — LastSeenService must be globally available, not scoped to IdentityModule.

import { Global, Module } from '@nestjs/common';
import { LastSeenService } from './last-seen.service';

@Global()
@Module({
  providers: [LastSeenService],
  exports: [LastSeenService],
})
export class LastSeenModule {}
