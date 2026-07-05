import { MapPin, Navigation, Loader } from "lucide-react";
import { useLocation } from "../../services/location.service";

interface LocationDisplayProps {
  autoStart?: boolean;
  showAddress?: boolean;
}

export function LocationDisplay({ autoStart = false, showAddress = true }: LocationDisplayProps) {
  const { location, error, loading, isSupported, getCurrentLocation, startWatching, stopWatching } = useLocation();

  const formatCoordinates = (lat: number, lng: number) => {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  if (!isSupported) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-sm text-[var(--mobile-text-secondary)] text-center">
          Location services not available
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Location Info */}
      {location && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-700">
            <MapPin className="w-4 h-4" />
            <span className="font-medium">Current Location</span>
          </div>

          {showAddress && location.address && (
            <p className="text-sm text-[var(--mobile-text-primary)]">{location.address}</p>
          )}

          <div className="text-xs text-[var(--mobile-text-secondary)] space-y-1">
            <p>Coordinates: {formatCoordinates(location.latitude, location.longitude)}</p>
            <p>Accuracy: ±{Math.round(location.accuracy)}m</p>
            <p>
              Updated: {new Date(location.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={getCurrentLocation}
          disabled={loading}
          className="flex-1 min-h-[var(--touch-min)] px-4 py-3 bg-[var(--mobile-primary)] text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 active:bg-blue-700 transition-colors"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Getting Location...
            </>
          ) : (
            <>
              <Navigation className="w-5 h-5" />
              Get Location
            </>
          )}
        </button>

        {autoStart && (
          <button
            onClick={startWatching}
            className="px-4 py-3 border-2 border-[var(--mobile-primary)] text-[var(--mobile-primary)] rounded-xl font-medium active:bg-blue-50"
          >
            Track
          </button>
        )}
      </div>
    </div>
  );
}
