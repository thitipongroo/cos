import { VendorPortalModule } from '../vendor-portal.module';
import { VendorPortalController } from '../vendor-portal.controller';
import { VendorAuthGuard } from '../vendor-auth.guard';

describe('VendorPortalModule', () => {
  // The vendor context used to be applied by a middleware, which could not reach TenantPrismaService
  // (it reads CLS, and Nest middleware under Fastify is the wrong place to set it). It is now a guard
  // bound to the controller — assert that binding, since losing it silently disables vendor auth.
  it('binds VendorAuthGuard to VendorPortalController', () => {
    const guards = Reflect.getMetadata('__guards__', VendorPortalController) as unknown[];
    expect(guards).toContain(VendorAuthGuard);
  });

  it('registers VendorAuthGuard as a provider so its dependencies resolve', () => {
    const providers = Reflect.getMetadata('providers', VendorPortalModule) as unknown[];
    expect(providers).toContain(VendorAuthGuard);
  });

  it('no longer registers request middleware', () => {
    expect((VendorPortalModule.prototype as { configure?: unknown }).configure).toBeUndefined();
  });
});
