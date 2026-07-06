// Geo Service — reverse-geocode via the self-host Nominatim (Geofabrik Thailand) container.
// External geocoding stays in-tenant (no third-party call). Degrades gracefully: when Nominatim is
// unreachable or returns non-200, the address resolves to null rather than throwing.
import { Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('geo-service');

export interface ReverseGeocodeResult {
  latitude: number;
  longitude: number;
  address: string | null;
}

@Injectable()
export class GeoService {
  private readonly nominatimUrl = process.env['NOMINATIM_URL'] ?? 'http://nominatim:8080';

  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    const url = `${this.nominatimUrl}/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'nominatim reverse-geocode returned non-200');
        return { latitude, longitude, address: null };
      }
      const data = (await res.json()) as { display_name?: string };
      return { latitude, longitude, address: data.display_name ?? null };
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'nominatim reverse-geocode failed');
      return { latitude, longitude, address: null };
    }
  }
}
