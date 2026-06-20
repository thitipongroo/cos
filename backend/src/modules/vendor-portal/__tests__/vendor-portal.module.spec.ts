import { RequestMethod } from '@nestjs/common';
import { VendorPortalModule } from '../vendor-portal.module';

describe('VendorPortalModule', () => {
  it('registers VendorAuthMiddleware on /api/v1/vendor/* routes', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn().mockReturnValue({ forRoutes });
    new VendorPortalModule().configure({ apply } as never);
    expect(apply).toHaveBeenCalled();
    expect(forRoutes).toHaveBeenCalledWith({ path: 'api/v1/vendor/*', method: RequestMethod.ALL });
  });
});
