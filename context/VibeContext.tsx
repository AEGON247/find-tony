"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Category, UserProfile } from "@/lib/types";
import { distanceInMeters, isSydneyCoordinate } from "@/lib/geo";
import { startDeviceHeadingTracking } from "@/lib/device-heading";

const PROFILE_KEY = "find-tony-profile-v1";
const PROFILE_EVENT = "find-tony-profile-change";

export const DEFAULT_PROFILE: UserProfile = {
  alias: "",
  primaryVibe: "FOODIE",
  radiusKm: 3,
};

const VALID_CATEGORIES = ["FOODIE", "PARTY", "EVENTS", "CHILL"];

interface VibeContextValue {
  profile: UserProfile;
  updateProfile: (profile: UserProfile) => void;
  coordinates?: [number, number];
  placesCoordinates?: [number, number];
  locationLabel: string;
  locationStatus: "idle" | "locating" | "device" | "error";
  requestLocation: () => void;
  requestHeading: () => Promise<void>;
}

const VibeContext = createContext<VibeContextValue | null>(null);

function subscribeProfile(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PROFILE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PROFILE_EVENT, callback);
  };
}

function getProfileSnapshot() {
  return localStorage.getItem(PROFILE_KEY);
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

export function VibeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const serializedProfile = useSyncExternalStore(subscribeProfile, getProfileSnapshot, () => null);
  const profile = useMemo(() => parseProfile(serializedProfile), [serializedProfile]);
  const [deviceCoordinates, setDeviceCoordinates] = useState<[number, number]>();
  const [placesCoordinates, setPlacesCoordinates] = useState<[number, number]>();
  const [locationStatus, setLocationStatus] = useState<"idle" | "locating" | "device" | "error">("idle");
  const watchId = useRef<number | undefined>(undefined);
  const lastKnownCoordinates = useRef<[number, number] | undefined>(undefined);

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

  const requestLocation = useCallback(() => {
    if (watchId.current !== undefined) navigator.geolocation?.clearWatch(watchId.current);
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
    profile, updateProfile, coordinates, placesCoordinates, locationLabel, locationStatus, requestLocation, requestHeading,
  }), [profile, updateProfile, coordinates, placesCoordinates, locationLabel, locationStatus, requestLocation, requestHeading]);

  return <VibeContext.Provider value={value}>{children}</VibeContext.Provider>;
}

export function useVibe() {
  const value = useContext(VibeContext);
  if (!value) throw new Error("useVibe must be used within VibeProvider.");
  return value;
}
