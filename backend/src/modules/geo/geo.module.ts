import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

// JwtAuthGuard works app-wide (the keycloak-jwt strategy is registered by IdentityModule in
// AppModule; ClsModule is global) — no extra imports needed, matching AnalyticsModule.
@Module({
  controllers: [GeoController],
  providers: [GeoService],
})
export class GeoModule {}
