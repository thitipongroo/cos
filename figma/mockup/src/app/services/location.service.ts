// Location Service
// Handles geolocation, geofencing, and location tracking

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  address?: string;
}

export interface Geofence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters
  enabled: boolean;
}

class LocationService {
  private watchId: number | null = null;
  private geofences: Geofence[] = [];
  private currentLocation: Location | null = null;
  private listeners: Array<(location: Location) => void> = [];
  private geofenceListeners: Array<(geofence: Geofence, inside: boolean) => void> = [];

  constructor() {
    this.loadGeofences();
  }

  // Check if geolocation is supported
  isSupported(): boolean {
    return "geolocation" in navigator;
  }

  // Get current location (one-time)
  async getCurrentLocation(): Promise<Location> {
    if (!this.isSupported()) {
      throw new Error("Geolocation not supported");
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location: Location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };

          // Try to get address
          try {
            location.address = await this.reverseGeocode(location.latitude, location.longitude);
          } catch {
            // Address lookup failed, but location is still valid
          }

          this.currentLocation = location;
          resolve(location);
        },
        (error) => {
          reject(new Error(this.getErrorMessage(error)));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }

  // Start watching location
  startWatching(): void {
    if (!this.isSupported() || this.watchId !== null) {
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const location: Location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };

        // Try to get address
        try {
          location.address = await this.reverseGeocode(location.latitude, location.longitude);
        } catch {
          // Address lookup failed
        }

        this.currentLocation = location;
        this.notifyLocationListeners(location);
        this.checkGeofences(location);
      },
      (error) => {
        console.error("Location watch error:", this.getErrorMessage(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }

  // Stop watching location
  stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  // Get last known location
  getLastKnownLocation(): Location | null {
    return this.currentLocation;
  }

  // Reverse geocode (lat/lng to address)
  private async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    // Using OpenStreetMap Nominatim API (free, no API key required)
    // In production, use Google Maps API or similar
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        {
          headers: {
            "User-Agent": "FieldOpsApp/1.0",
          },
        }
      );

      if (!response.ok) throw new Error("Geocoding failed");

      const data = await response.json();
      return data.display_name || "Unknown location";
    } catch {
      return "Unknown location";
    }
  }

  // Add geofence
  addGeofence(geofence: Omit<Geofence, "id">): string {
    const id = `geofence-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newGeofence: Geofence = { ...geofence, id };

    this.geofences.push(newGeofence);
    this.saveGeofences();

    return id;
  }

  // Remove geofence
  removeGeofence(id: string): void {
    this.geofences = this.geofences.filter((g) => g.id !== id);
    this.saveGeofences();
  }

  // Get all geofences
  getGeofences(): Geofence[] {
    return [...this.geofences];
  }

  // Enable/disable geofence
  toggleGeofence(id: string, enabled: boolean): void {
    const geofence = this.geofences.find((g) => g.id === id);
    if (geofence) {
      geofence.enabled = enabled;
      this.saveGeofences();
    }
  }

  // Check if location is within geofence
  private isInsideGeofence(location: Location, geofence: Geofence): boolean {
    const distance = this.calculateDistance(
      location.latitude,
      location.longitude,
      geofence.latitude,
      geofence.longitude
    );

    return distance <= geofence.radius;
  }

  // Calculate distance between two points (Haversine formula)
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Check all geofences
  private checkGeofences(location: Location): void {
    this.geofences.forEach((geofence) => {
      if (!geofence.enabled) return;

      const inside = this.isInsideGeofence(location, geofence);
      this.notifyGeofenceListeners(geofence, inside);
    });
  }

  // Subscribe to location updates
  subscribeToLocation(listener: (location: Location) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // Subscribe to geofence events
  subscribeToGeofence(
    listener: (geofence: Geofence, inside: boolean) => void
  ): () => void {
    this.geofenceListeners.push(listener);
    return () => {
      this.geofenceListeners = this.geofenceListeners.filter((l) => l !== listener);
    };
  }

  // Private methods
  private notifyLocationListeners(location: Location): void {
    this.listeners.forEach((listener) => listener(location));
  }

  private notifyGeofenceListeners(geofence: Geofence, inside: boolean): void {
    this.geofenceListeners.forEach((listener) => listener(geofence, inside));
  }

  private loadGeofences(): void {
    const stored = localStorage.getItem("geofences");
    if (stored) {
      try {
        this.geofences = JSON.parse(stored);
      } catch {
        this.geofences = [];
      }
    }
  }

  private saveGeofences(): void {
    localStorage.setItem("geofences", JSON.stringify(this.geofences));
  }

  private getErrorMessage(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return "Location permission denied";
      case error.POSITION_UNAVAILABLE:
        return "Location unavailable";
      case error.TIMEOUT:
        return "Location request timed out";
      default:
        return "Unknown location error";
    }
  }
}

export const locationService = new LocationService();

// React hook
import { useState, useEffect } from "react";

export function useLocation() {
  const [location, setLocation] = useState<Location | null>(locationService.getLastKnownLocation());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getCurrentLocation = async () => {
    setLoading(true);
    setError(null);

    try {
      const loc = await locationService.getCurrentLocation();
      setLocation(loc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Location error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = locationService.subscribeToLocation(setLocation);
    return unsubscribe;
  }, []);

  return {
    location,
    error,
    loading,
    isSupported: locationService.isSupported(),
    getCurrentLocation,
    startWatching: () => locationService.startWatching(),
    stopWatching: () => locationService.stopWatching(),
  };
}
