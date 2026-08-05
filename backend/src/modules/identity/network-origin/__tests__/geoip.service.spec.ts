// Self-hosted GeoLite2 lookup (ADR-080).
//
// Two properties, both about restraint rather than capability:
//
//   1. AN ABSENT DATABASE IS NORMAL, NOT AN ERROR. GeoLite2 needs a MaxMind account and a licence
//      ADR-080 records as uncleared, so dev, CI and every air-gapped install run without the file.
//      A throw here would break the transparency screen for everyone who has not obtained it.
//   2. THE IP NEVER APPEARS IN A LOG LINE. It is personal data under GDPR Rec. 30 — which is exactly
//      why the screen that displays it exists — so a failure logs a reason, never the address.

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const mockOpen = jest.fn();

jest.mock('@cos/logger', () => ({ createLogger: () => mockLogger }));
jest.mock('maxmind', () => ({ open: (...args: unknown[]) => mockOpen(...args) }));

import { GeoIpService } from '../geoip.service';

const IP = '203.0.113.7';

const cityReader = (record: unknown) => ({ get: jest.fn().mockReturnValue(record) });

const CITY = {
  city: { names: { en: 'Bangkok' } },
  subdivisions: [{ names: { en: 'Krung Thep Maha Nakhon' } }],
  country: { iso_code: 'TH' },
};
const ASN = { autonomous_system_organization: 'Advanced Info Service' };

const originalEnv = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env['GEOLITE2_CITY_DB_PATH'];
  delete process.env['GEOLITE2_ASN_DB_PATH'];
});
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('when no database is configured', () => {
  it('returns null instead of throwing', async () => {
    // The state of every developer machine, every CI run and every air-gapped install.
    await expect(new GeoIpService().lookup(IP)).resolves.toBeNull();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('says so once, at info — not as a warning repeated per request', async () => {
    const service = new GeoIpService();
    await service.lookup(IP);
    await service.lookup(IP);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
  });
});

describe('when the databases are configured', () => {
  beforeEach(() => {
    process.env['GEOLITE2_CITY_DB_PATH'] = '/srv/geolite2/City.mmdb';
    process.env['GEOLITE2_ASN_DB_PATH'] = '/srv/geolite2/ASN.mmdb';
  });

  it('returns city, region, country and ISP', async () => {
    mockOpen.mockResolvedValueOnce(cityReader(CITY)).mockResolvedValueOnce(cityReader(ASN));

    await expect(new GeoIpService().lookup(IP)).resolves.toEqual({
      city: 'Bangkok',
      region: 'Krung Thep Maha Nakhon',
      countryIsoCode: 'TH',
      organisation: 'Advanced Info Service',
    });
  });

  it('opens each database exactly once, however many lookups run', async () => {
    // Opening memory-maps the file; doing it per request would re-map a multi-megabyte database on
    // every render of the transparency screen.
    mockOpen.mockResolvedValue(cityReader(CITY));
    const service = new GeoIpService();
    await service.lookup(IP);
    await service.lookup(IP);
    await service.lookup(IP);
    expect(mockOpen).toHaveBeenCalledTimes(2); // City + ASN, once each
  });

  it('works with only the City database present', async () => {
    // The two are separate downloads; having one is a real deployment state.
    delete process.env['GEOLITE2_ASN_DB_PATH'];
    mockOpen.mockResolvedValueOnce(cityReader(CITY));

    await expect(new GeoIpService().lookup(IP)).resolves.toMatchObject({
      city: 'Bangkok',
      organisation: null,
    });
  });

  it('works with only the ASN database present', async () => {
    delete process.env['GEOLITE2_CITY_DB_PATH'];
    mockOpen.mockResolvedValueOnce(cityReader(ASN));

    await expect(new GeoIpService().lookup(IP)).resolves.toMatchObject({
      city: null,
      organisation: 'Advanced Info Service',
    });
  });

  it('returns null for an address the database does not cover', async () => {
    // A private or unallocated range. Not an error — just nothing known.
    mockOpen.mockResolvedValue(cityReader(null));
    await expect(new GeoIpService().lookup('10.0.0.1')).resolves.toBeNull();
  });

  it('reports nulls rather than guesses for fields the record omits', async () => {
    // GeoLite2 coverage is uneven: plenty of addresses resolve to a country and nothing finer.
    mockOpen.mockResolvedValueOnce(cityReader({ country: { iso_code: 'TH' } }));
    delete process.env['GEOLITE2_ASN_DB_PATH'];

    await expect(new GeoIpService().lookup(IP)).resolves.toEqual({
      city: null,
      region: null,
      countryIsoCode: 'TH',
      organisation: null,
    });
  });

  it('degrades to null when a database file cannot be opened', async () => {
    // A stale mount, a bad path, a corrupt download. None of these should break the screen.
    mockOpen.mockRejectedValue(new Error('ENOENT'));
    await expect(new GeoIpService().lookup(IP)).resolves.toBeNull();
  });

  it('degrades to null when the reader throws on a malformed address', async () => {
    mockOpen.mockResolvedValue({
      get: jest.fn(() => {
        throw new Error('invalid ip');
      }),
    });
    await expect(new GeoIpService().lookup('not-an-ip')).resolves.toBeNull();
  });

  it('NEVER logs the address', async () => {
    // The single most important assertion in this file. The IP is the personal datum the whole
    // transparency screen exists to disclose to its subject — putting it in a log aggregator would
    // create a second, undisclosed copy.
    mockOpen.mockResolvedValue({
      get: jest.fn(() => {
        throw new Error('invalid ip');
      }),
    });
    await new GeoIpService().lookup(IP);

    const logged = JSON.stringify([
      ...mockLogger.warn.mock.calls,
      ...mockLogger.info.mock.calls,
      ...mockLogger.error.mock.calls,
    ]);
    expect(logged).not.toContain(IP);
  });

  it('releases the readers on shutdown (ADR-034 / Rule 39)', async () => {
    mockOpen.mockResolvedValue(cityReader(CITY));
    const service = new GeoIpService();
    await service.lookup(IP);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    // The readers memory-map their files; holding them past shutdown keeps the mapping alive.
    await expect(service.lookup(IP)).resolves.toBeNull();
  });
});
