// Network-origin lookup (ADR-080) — self-hosted GeoLite2, read from a local database file.
//
// SELF-HOSTED, NOT A SaaS CALL, and that is the whole decision. Sending a user's IP to a lookup
// service would put personal data (GDPR Rec. 30) across a border, engage QM-5's rule that Thai-origin
// data stays in ap-southeast-7, require a DPA, and fail outright in the air-gapped RKE2 deployments
// this platform actually ships to. The database file answers all four by never leaving the cluster.
//
// NOTHING HERE IS PERSISTED. City, region and ASN are derived when the subject opens their own
// transparency screen and then discarded. `audit_logs.ip_address` is already collected and already
// tagged; deriving a label from it for its own subject adds no stored personal data, and therefore
// no retention row, no data-flow-map entry and no new erasure target. Writing the city to a column
// would create all four to cache something cheap to recompute.
//
// ABSENT DATABASE IS A NORMAL STATE. GeoLite2 requires a MaxMind account and licence key, and
// ADR-080 records that the licence must be cleared by legal before the first production deploy — so
// dev, CI and every air-gapped install run without the file. Every method degrades to null.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createLogger } from '@cos/logger';
// `maxmind` re-exports mmdb-lib's response types; using its own shapes rather than hand-rolled ones
// means the field names below are checked against the real database schema, not against a guess.
import { open, type AsnResponse, type CityResponse, type Reader } from 'maxmind';

const logger = createLogger('geoip-service');

/** What GeoLite2 City yields, reduced to the fields the transparency panel renders. */
export interface NetworkOrigin {
  /** e.g. "Bangkok". Null when the database has no city for this address. */
  city: string | null;
  /** e.g. "Krung Thep Maha Nakhon". */
  region: string | null;
  countryIsoCode: string | null;
  /** The ISP name, from the separate ASN database. */
  organisation: string | null;
}

@Injectable()
export class GeoIpService implements OnModuleDestroy {
  private city: Reader<CityResponse> | null = null;
  private asn: Reader<AsnResponse> | null = null;
  private loaded = false;

  async onModuleDestroy(): Promise<void> {
    // The readers memory-map the database files; dropping the references releases them.
    this.city = null;
    this.asn = null;
  }

  /**
   * Open the databases once, on first use.
   *
   * Lazy rather than in the constructor so a missing file cannot fail application startup. ADR-080
   * makes this enrichment presentational — a backend that refuses to boot because an optional
   * GeoLite2 file is absent would turn a transparency nicety into a hard dependency.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    const cityPath = process.env['GEOLITE2_CITY_DB_PATH'];
    const asnPath = process.env['GEOLITE2_ASN_DB_PATH'];

    if (cityPath) {
      this.city = await open<CityResponse>(cityPath).catch((err: unknown) => {
        // Path only, never the address being looked up.
        logger.warn(
          { err: String(err), event: 'geoip.city_db.unreadable' },
          'GeoLite2 City not opened',
        );
        return null;
      });
    }
    if (asnPath) {
      this.asn = await open<AsnResponse>(asnPath).catch((err: unknown) => {
        logger.warn(
          { err: String(err), event: 'geoip.asn_db.unreadable' },
          'GeoLite2 ASN not opened',
        );
        return null;
      });
    }
    if (!this.city && !this.asn) {
      logger.info(
        { event: 'geoip.not_configured' },
        'No GeoLite2 database configured — network origin will render as unavailable (ADR-080).',
      );
    }
  }

  /**
   * Look an address up. Null for every failure mode, and for an address the database does not cover.
   *
   * Null is rendered as "not available" rather than as a guess: a wrong city on a screen whose entire
   * purpose is telling someone what the platform knows about them is worse than an honest blank.
   */
  async lookup(ipAddress: string): Promise<NetworkOrigin | null> {
    await this.ensureLoaded();
    if (!this.city && !this.asn) return null;

    try {
      const cityRecord = this.city?.get(ipAddress) ?? null;
      const asnRecord = this.asn?.get(ipAddress) ?? null;
      if (!cityRecord && !asnRecord) return null;

      return {
        // English names. The screen is the subject's own transparency view and the platform's
        // system default is English (QM-3); a localised place name would need a locale this
        // service does not receive.
        city: cityRecord?.city?.names?.['en'] ?? null,
        region: cityRecord?.subdivisions?.[0]?.names?.['en'] ?? null,
        countryIsoCode: cityRecord?.country?.iso_code ?? null,
        organisation: asnRecord?.autonomous_system_organization ?? null,
      };
    } catch (err) {
      // A malformed address reaches here as a throw from the reader. Never log the address itself —
      // it is personal data under GDPR Rec. 30, which is precisely why this screen exists.
      logger.warn({ err: String(err), event: 'geoip.lookup_failed' }, 'lookup failed');
      return null;
    }
  }

  /**
   * The autonomous system NUMBER for an address, for counting distinct networks (ADR-081).
   *
   * Separate from `lookup()` because it answers a different question with a different type. The panel
   * renders the ISP's NAME; the trust score counts how many networks a device has appeared on, and
   * organisation names are not stable identifiers — "AIS" and "Advanced Info Service" can describe
   * the same AS across database releases, which would inflate the count and mark a stationary worker
   * as roaming. The number is the identifier MaxMind actually guarantees.
   *
   * Null whenever the ASN database is absent or the address is not in it. The caller must treat that
   * as "not established", never as a distinct network — see asnBand's INSUFFICIENT_DATA.
   */
  async asnNumber(ipAddress: string): Promise<number | null> {
    await this.ensureLoaded();
    if (!this.asn) return null;

    try {
      return this.asn.get(ipAddress)?.autonomous_system_number ?? null;
    } catch (err) {
      logger.warn({ err: String(err), event: 'geoip.asn_lookup_failed' }, 'ASN lookup failed');
      return null;
    }
  }
}
