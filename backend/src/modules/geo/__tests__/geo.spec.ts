import { BadRequestException } from '@nestjs/common';
import { GeoController } from '../geo.controller';
import { GeoService } from '../geo.service';

describe('GeoController', () => {
  const svc = { reverseGeocode: jest.fn() } as unknown as GeoService;
  const controller = new GeoController(svc);

  afterEach(() => jest.clearAllMocks());

  it('rejects non-numeric lat/lon', () => {
    expect(() => controller.reverse('abc', '100')).toThrow(BadRequestException);
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => controller.reverse('91', '100')).toThrow(BadRequestException);
    expect(() => controller.reverse('13', '200')).toThrow(BadRequestException);
  });

  it('delegates valid coordinates to the service', () => {
    controller.reverse('13.7563', '100.5018');
    expect(svc.reverseGeocode).toHaveBeenCalledWith(13.7563, 100.5018);
  });
});

describe('GeoService', () => {
  const service = new GeoService();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the Nominatim display_name as address on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'ถนนสีลม กรุงเทพมหานคร' }),
    }) as unknown as typeof fetch;

    const result = await service.reverseGeocode(13.7563, 100.5018);
    expect(result).toEqual({
      latitude: 13.7563,
      longitude: 100.5018,
      address: 'ถนนสีลม กรุงเทพมหานคร',
    });
  });

  it('returns null address when a 200 response omits display_name', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const result = await service.reverseGeocode(13.7563, 100.5018);
    expect(result.address).toBeNull();
  });

  it('degrades to null address on non-200', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    const result = await service.reverseGeocode(13, 100);
    expect(result.address).toBeNull();
  });

  it('degrades to null address when Nominatim is unreachable', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const result = await service.reverseGeocode(13, 100);
    expect(result.address).toBeNull();
  });
});
