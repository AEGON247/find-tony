"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Category, UserProfile } from "@/lib/types";
import { distanceInMeters, isSydneyCoordinate } from "@/lib/geo";
import { startDeviceHeadingTracking } from "@/lib/device-heading";

const PROFILE_KEY = "find-tony-profile-v1";
const PROFILE_EVENT = "find-tony-profile-change";
const PREFERENCES_KEY = "find-tony-map-preferences-v1";
const PREFERENCES_EVENT = "find-tony-map-preferences-change";

export interface MapPreferences {
  hideSmokingSpots: boolean;
  hideAlcoholSpots: boolean;
}

const DEFAULT_PREFERENCES: MapPreferences = {
  hideSmokingSpots: false,
  hideAlcoholSpots: false,
};

export const DEFAULT_PROFILE: UserProfile = {
  alias: "",
  primaryVibe: "FOODIE",
  radiusKm: 3,
};

const VALID_CATEGORIES = ["FOODIE", "PARTY", "EVENTS", "CHILL"];

interface VibeContextValue {
  profile: UserProfile;
  updateProfile: (profile: UserProfile) => void;
  preferences: MapPreferences;
  updatePreferences: (preferences: MapPreferences) => void;
  coordinates?: [number, number];
  placesCoordinates?: [number, number];
  locationLabel: string;
  locationStatus: "idle" | "locating" | "device" | "error";
  requestLocation: () => void;
  requestHeading: () => Promise<void>;
}

const VibeContext = createContext<VibeContextValue | null>(null);

function subscribeProfile(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(PROFILE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PROFILE_EVENT, callback);
  };
}

function getProfileSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PROFILE_KEY);
  } catch (error) {
    console.error("Could not read the saved profile.", error);
    return null;
  }
}

function parseProfile(serialized: string | null): UserProfile {
  if (!serialized) return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(serialized) as {
      alias?: unknown;
      primaryVibe?: unknown;
      radiusKm?: unknown;
    };
    return {
      alias: typeof parsed.alias === "string" ? parsed.alias : DEFAULT_PROFILE.alias,
      primaryVibe: typeof parsed.primaryVibe === "string" && VALID_CATEGORIES.includes(parsed.primaryVibe)
        ? parsed.primaryVibe as Category
        : parsed.primaryVibe === "HACKATHONS"
          ? "EVENTS"
          : DEFAULT_PROFILE.primaryVibe,
      radiusKm: [1, 3, 5, 10].includes(Number(parsed.radiusKm)) ? Number(parsed.radiusKm) : DEFAULT_PROFILE.radiusKm,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function readPreferences(): MapPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFERENCES;
    const value = parsed as Record<string, unknown>;
    return {
      hideSmokingSpots: value.hideSmokingSpots === true,
      hideAlcoholSpots: value.hideAlcoholSpots === true,
    };
  } catch (error) {
    console.error("Could not read saved map preferences.", error);
    return DEFAULT_PREFERENCES;
  }
}

export function VibeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const serializedProfile = useSyncExternalStore(subscribeProfile, getProfileSnapshot, () => null);
  const profile = useMemo(() => parseProfile(serializedProfile), [serializedProfile]);
  const [deviceCoordinates, setDeviceCoordinates] = useState<[number, number]>();
  const [placesCoordinates, setPlacesCoordinates] = useState<[number, number]>();
  const [locationStatus, setLocationStatus] = useState<"idle" | "locating" | "device" | "error">("idle");
  const [preferences, setPreferences] = useState<MapPreferences>(DEFAULT_PREFERENCES);
  const watchId = useRef<number | undefined>(undefined);
  const lastKnownCoordinates = useRef<[number, number] | undefined>(undefined);

  useEffect(() => {
    setPreferences(readPreferences());
    const syncPreferences = () => setPreferences(readPreferences());
    window.addEventListener("storage", syncPreferences);
    window.addEventListener(PREFERENCES_EVENT, syncPreferences);
    return () => {
      window.removeEventListener("storage", syncPreferences);
      window.removeEventListener(PREFERENCES_EVENT, syncPreferences);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (watchId.current !== undefined) navigator.geolocation?.clearWatch(watchId.current);
    };
  }, []);

  const coordinates = deviceCoordinates;
  const locationLabel = locationStatus === "device"
    ? "CURRENT LOCATION"
    : locationStatus === "locating"
      ? "LOCATING..."
      : locationStatus === "error"
        ? "LOCATION UNAVAILABLE"
        : "LOCATION REQUIRED";

  const updateProfile = useCallback((nextProfile: UserProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    window.dispatchEvent(new Event(PROFILE_EVENT));
  }, []);

  const updatePreferences = useCallback((nextPreferences: MapPreferences) => {
    setPreferences(nextPreferences);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(nextPreferences));
      window.dispatchEvent(new Event(PREFERENCES_EVENT));
    } catch (error) {
      console.error("Could not save map preferences.", error);
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (watchId.current !== undefined) navigator.geolocation?.clearWatch(watchId.current);
    // Development-only testing aid: /?mockLocation=-33.8981,151.1795 pretends to be at that Sydney spot,
    // so two browser windows can act as two nearby people. Ignored in production builds.
    const mockLocation = process.env.NODE_ENV === "development"
      ? new URLSearchParams(window.location.search).get("mockLocation")
      : null;
    if (mockLocation) {
      const [lat, lng] = mockLocation.split(",").map(Number);
      if (isSydneyCoordinate(lat, lng)) {
        lastKnownCoordinates.current = [lat, lng];
        setPlacesCoordinates([lat, lng]);
        setDeviceCoordinates([lat, lng]);
        setLocationStatus("device");
        return;
      }
    }
    if (!navigator.geolocation) {
      setDeviceCoordinates(undefined);
      setLocationStatus("error");
      return;
    }
    setLocationStatus("locating");
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!isSydneyCoordinate(coords.latitude, coords.longitude)) {
          setDeviceCoordinates(undefined);
          setLocationStatus("error");
          return;
        }
        const nextCoordinates: [number, number] = [coords.latitude, coords.longitude];
        if (
          !lastKnownCoordinates.current ||
          distanceInMeters(
            lastKnownCoordinates.current[0],
            lastKnownCoordinates.current[1],
            nextCoordinates[0],
            nextCoordinates[1],
          ) >= 500
        ) {
          lastKnownCoordinates.current = nextCoordinates;
          setPlacesCoordinates(nextCoordinates);
        }
        setDeviceCoordinates(nextCoordinates);
        setLocationStatus("device");
      },
      () => {
        if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = undefined;
        setDeviceCoordinates(undefined);
        lastKnownCoordinates.current = undefined;
        setLocationStatus("error");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, []);

  const requestHeading = useCallback(async () => {
    if (!("DeviceOrientationEvent" in window)) return;
    const Orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    try {
      if (Orientation.requestPermission && await Orientation.requestPermission() !== "granted") return;
      startDeviceHeadingTracking();
    } catch (error) {
      console.warn("Device orientation permission was not granted.", error);
    }
  }, []);

  const value = useMemo(() => ({
    profile, updateProfile, preferences, updatePreferences, coordinates, placesCoordinates, locationLabel, locationStatus, requestLocation, requestHeading,
  }), [profile, updateProfile, preferences, updatePreferences, coordinates, placesCoordinates, locationLabel, locationStatus, requestLocation, requestHeading]);

  return <VibeContext.Provider value={value}>{children}</VibeContext.Provider>;
}

export function useVibe() {
  const value = useContext(VibeContext);
  if (!value) throw new Error("useVibe must be used within VibeProvider.");
  return value;
}
