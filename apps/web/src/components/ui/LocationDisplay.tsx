'use client';

import { useEffect, useState } from 'react';
import { ApiError, useApi } from '../../lib/api/client';
import { useI18n } from '../../i18n';

interface ReverseGeocodeResult {
  latitude: number;
  longitude: number;
  address: string | null;
}

type Status = 'idle' | 'locating' | 'done';

export function LocationDisplay() {
  const { t } = useI18n();
  const api = useApi();

  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && !!navigator.geolocation);
  }, []);

  const getLocation = () => {
    setError(null);
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setCoords({ lat: latitude, lon: longitude, accuracy });
        void resolveAddress(latitude, longitude);
      },
      (err) => {
        const key =
          err.code === err.PERMISSION_DENIED
            ? 'location.denied'
            : err.code === err.TIMEOUT
              ? 'location.timeout'
              : 'location.unavailable';
        setError(t(key));
        setStatus('idle');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  };

  const resolveAddress = async (lat: number, lon: number) => {
    try {
      const result = await api<ReverseGeocodeResult>(`/geo/reverse?lat=${lat}&lon=${lon}`);
      setAddress(result.address);
    } catch (err) {
      // A geocode failure does not invalidate the fix — show coordinates without an address.
      setAddress(err instanceof ApiError ? null : null);
    } finally {
      setStatus('done');
    }
  };

  if (!supported) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-center text-body text-cos-gray">
        {t('location.notSupported')}
      </div>
    );
  }

  const fmt = (n: number) => n.toFixed(6);

  return (
    <div className="space-y-3" data-testid="location-display">
      <button
        type="button"
        onClick={getLocation}
        disabled={status === 'locating'}
        className="rounded-lg bg-cos-blue px-4 py-2.5 text-body font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {status === 'locating' ? t('location.locating') : t('location.getLocation')}
      </button>

      {coords && (
        <div className="space-y-1 rounded-md border border-gray-200 bg-cos-white p-3 text-small text-cos-navy">
          <div className="font-medium">{t('location.currentLocation')}</div>
          {address && <div>{address}</div>}
          <div className="text-cos-gray">
            {t('location.coordinates')}: {fmt(coords.lat)}, {fmt(coords.lon)}
          </div>
          <div className="text-cos-gray">
            {t('location.accuracy')}: ±{Math.round(coords.accuracy)}m
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-small text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
