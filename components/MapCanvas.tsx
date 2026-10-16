"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import { MapPin, Minus, Plus } from "lucide-react";
import type { Category, VibePlace, VibesResponse } from "@/lib/types";
import { useVibe } from "@/context/VibeContext";
import { distanceInMeters } from "@/lib/geo";

const VIBE_COLORS: Record<Category, string> = {
  FOODIE: "#ec4899",
  PARTY: "#8b5cf6",
  HACKATHONS: "#06b6d4",
  CHILL: "#b7f36b",
};
const VIBE_SYMBOLS: Record<Category, string> = {
  FOODIE: '<path d="M8 3v8m-3-8v5a3 3 0 0 0 6 0V3M8 11v10m9-18v18m0-18c-3 3-3 8 0 10"/>',
  PARTY: '<path d="M12 3v12.5a3.5 3.5 0 1 1-2-3.16V6l10-2v9.5a3.5 3.5 0 1 1-2-3.16V3z"/>',
  HACKATHONS: '<rect x="3" y="5" width="18" height="13" rx="1"/><path d="M8 21h8m-4-3v3m-5-9h2l2-3 2 6 2-3h2"/>',
  CHILL: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5zM4 6h14m-9 4h7m-7 4h7"/>',
};

function pinIcon(category: Category, isSelected: boolean, isPoi: boolean, isNearby: boolean) {
  return L.divIcon({
    className: `place-marker ${isPoi ? "place-marker--poi" : ""} ${isSelected ? "place-marker--selected" : ""} ${isNearby ? "place-marker--nearby" : ""}`,
    html: `<span class="place-marker__shape" style="--marker-color:${VIBE_COLORS[category]}"><svg viewBox="0 0 24 24" aria-hidden="true">${VIBE_SYMBOLS[category]}</svg></span>`,
    iconSize: isPoi ? [36, 42] : [42, 48],
    iconAnchor: isPoi ? [18, 36] : [21, 42],
  });
}

function avatarIcon(heading: number) {
  return L.divIcon({
    className: "map-avatar",
    html: `<svg viewBox="0 0 48 52" aria-hidden="true"><circle class="map-avatar__halo" cx="24" cy="27" r="17"/><path class="map-avatar__arrow" transform="rotate(${heading} 24 27)" d="M24 4 41 43 24 34 7 43Z"/></svg>`,
    iconSize: [48, 52],
    iconAnchor: [24, 27],
  });
}

function MapControls({
  coordinates,
  onResetSearchCenter,
}: {
  coordinates: [number, number];
  onResetSearchCenter: () => void;
}) {
  const map = useMap();
  return (
    <div className="map-controls">
      <button aria-label="Zoom in" onClick={() => map.zoomIn()}><Plus size={18} /></button>
      <button aria-label="Zoom out" onClick={() => map.zoomOut()}><Minus size={18} /></button>
      <button className="map-controls__locate" aria-label="Center on my location" onClick={() => {
        onResetSearchCenter();
        map.setView(coordinates, 17, { animate: true });
      }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>
      </button>
    </div>
  );
}

function MapFocus({ coordinates, selected }: { coordinates: [number, number]; selected?: VibePlace }) {
  const map = useMap();
  useEffect(() => {
    map.setView(selected ? [selected.lat, selected.lng] : coordinates, selected ? 17 : 16.5, { animate: true });
  }, [coordinates, map, selected]);
  return null;
}

interface MapCanvasProps {
  category: Category;
  selected?: VibePlace;
  navigationTarget?: VibePlace;
  searchCenter?: [number, number];
  onResetSearchCenter: () => void;
  onSelect: (place: VibePlace) => void;
  onPlacesLoaded: (places: VibePlace[]) => void;
  onWarnings: (warnings: string[]) => void;
  refresh: number;
}

function MapWithLocation({
  category, selected, navigationTarget, searchCenter, onResetSearchCenter, onSelect, onPlacesLoaded, onWarnings, refresh,
  coordinates,
  heading,
}: MapCanvasProps & { coordinates: [number, number]; heading: number }) {
  const { profile } = useVibe();
  const queryCenter = searchCenter ?? coordinates;
  const [result, setResult] = useState<{
    key: string;
    places: VibePlace[];
    warnings: string[];
    error: string;
  }>({ key: "", places: [], warnings: [], error: "" });
  const vibratedPlaces = useRef(new Set<string>());
  const query = useMemo(() => new URLSearchParams({
    category,
    lat: String(queryCenter[0]),
    lng: String(queryCenter[1]),
    radius: String(profile.radiusKm),
  }).toString(), [category, profile.radiusKm, queryCenter]);
  const queryKey = `${query}&refresh=${refresh}`;
  const loading = result.key !== queryKey;
  const places = useMemo(() => loading ? [] : result.places, [loading, result.places]);
  const error = loading ? "" : result.error;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/vibes?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as VibesResponse & { error?: string; offline?: boolean };
        if (!response.ok) throw new Error(body.error ?? `Could not load places (${response.status}).`);
        return body;
      })
      .then((body) => {
        const visiblePlaces = body.offline
          ? body.items
            .map((place) => ({
              ...place,
              distanceMeters: Math.round(distanceInMeters(queryCenter[0], queryCenter[1], place.lat, place.lng)),
            }))
            .filter((place) => place.distanceMeters! <= profile.radiusKm * 1000)
          : body.items;
        const warnings = body.offline
          ? ["Offline mode: showing cached places; live events and map tiles need an internet connection."]
          : body.warnings;
        setResult({ key: queryKey, places: visiblePlaces, warnings, error: "" });
        onPlacesLoaded(visiblePlaces);
        onWarnings(warnings);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        const message = reason instanceof Error ? reason.message : "Could not load places.";
        setResult({ key: queryKey, places: [], warnings: [], error: message });
      });
    return () => controller.abort();
  }, [category, onPlacesLoaded, onWarnings, profile.radiusKm, query, queryCenter, queryKey]);

  useEffect(() => {
    for (const place of places) {
      if (place.distanceMeters !== undefined && place.distanceMeters <= 50) {
        if (!vibratedPlaces.current.has(place.id)) {
          vibratedPlaces.current.add(place.id);
          if ("vibrate" in navigator) navigator.vibrate?.([100, 50, 100]);
        }
      } else if (place.distanceMeters === undefined || place.distanceMeters > 80) {
        vibratedPlaces.current.delete(place.id);
      }
    }
  }, [places]);

  const route = useMemo(() => navigationTarget ? [
    coordinates,
    [navigationTarget.lat, navigationTarget.lng] as [number, number],
  ] : undefined, [coordinates, navigationTarget]);

  return (
    <div className="map-shell">
      <MapContainer
        center={coordinates}
        zoom={16.5}
        zoomSnap={0.5}
        zoomControl={false}
        attributionControl={false}
        className="map-canvas"
        preferCanvas
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapFocus coordinates={coordinates} selected={selected} />
        <Circle center={coordinates} radius={profile.radiusKm * 1000} pathOptions={{ color: "#8b5cf6", weight: 1, opacity: 0.5, fillOpacity: 0.04 }} />
        {[30, 60, 90].map((radius, index) => (
          <Circle
            key={radius}
            center={coordinates}
            radius={radius}
            className={`radar-ring radar-ring--${index + 1}`}
            pathOptions={{ color: "#06b6d4", weight: 2, opacity: 0.65 - index * 0.12, fillOpacity: 0 }}
          />
        ))}
        <Marker position={coordinates} icon={avatarIcon(heading)} keyboard={false} zIndexOffset={1000} />
        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.lat, place.lng]}
            icon={pinIcon(
              place.category,
              selected?.id === place.id,
              Boolean(place.isMapPoi),
              place.distanceMeters !== undefined && place.distanceMeters <= 50,
            )}
            title={place.title}
            eventHandlers={{ click: () => onSelect(place) }}
          />
        ))}
        {route && <Polyline positions={route} pathOptions={{ color: "#06b6d4", weight: 4, opacity: 0.95, dashArray: "7 10", className: "navigation-vector" }} />}
        <MapControls coordinates={coordinates} onResetSearchCenter={onResetSearchCenter} />
      </MapContainer>
      <div className="map-halftone" aria-hidden="true" />
      <div className="map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>
      {loading && <div className="map-status" role="status">SCANNING YOUR RADIUS...</div>}
      {error && <div className="map-warning" role="alert">{error}</div>}
    </div>
  );
}

export default function MapCanvas(props: MapCanvasProps) {
  const { coordinates, heading, locationStatus, requestLocation } = useVibe();
  if (!coordinates) {
    return (
      <div className="map-location-required">
        <MapPin size={30} aria-hidden="true" />
        <h2>{locationStatus === "locating" ? "FINDING YOUR LOCATION" : "LOCATION ACCESS REQUIRED"}</h2>
        <p>Nearby search sends your coordinates to Find Tony and public map services. Location history is not stored.</p>
        <button className="button button-primary" onClick={requestLocation}>
          {locationStatus === "locating" ? "LOCATING..." : "ENABLE LOCATION"}
        </button>
      </div>
    );
  }
  return <MapWithLocation {...props} coordinates={coordinates} heading={heading} />;
}
