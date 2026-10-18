"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import { ArrowRight, MapPin, Minus, Plus, Radar, X, Zap } from "lucide-react";
import type { Category, VibePlace, VibesResponse } from "@/lib/types";
import { useVibe } from "@/context/VibeContext";
import { distanceInMeters } from "@/lib/geo";
import { getDeviceHeading, subscribeDeviceHeading } from "@/lib/device-heading";
import { INVITE_VIBES, type InviteVibeId } from "@/lib/invite-vibes";
import type { OpenInviteView } from "@/lib/social-types";
import MapLoader from "@/components/MapLoader";

const VIBE_COLORS: Record<Category, string> = {
  FOODIE: "#ec4899",
  PARTY: "#8b5cf6",
  EVENTS: "#06b6d4",
  CHILL: "#b7f36b",
};
const VIBE_SYMBOLS: Record<Category, string> = {
  FOODIE: '<path d="M8 3v8m-3-8v5a3 3 0 0 0 6 0V3M8 11v10m9-18v18m0-18c-3 3-3 8 0 10"/>',
  PARTY: '<path d="M12 3v12.5a3.5 3.5 0 1 1-2-3.16V6l10-2v9.5a3.5 3.5 0 1 1-2-3.16V3z"/>',
  EVENTS: '<rect x="3" y="5" width="18" height="13" rx="1"/><path d="M8 21h8m-4-3v3m-5-9h2l2-3 2 6 2-3h2"/>',
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

const OPEN_INVITE_SYMBOL = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>';
const DROP_STAGGER_MS = 140;
const DROP_ANIMATION_MS = 1600;

interface OpenInviteIconOptions {
  vibe: InviteVibeId;
  createdAt: string;
  expiresAt: string;
  goingCount: number;
  isMine: boolean;
  amGoing: boolean;
  isSelected: boolean;
  dropping: boolean;
  dropDelayMs: number;
}

function hasPlaceTag(place: VibePlace, target: "smoking" | "alcohol") {
  const words: string[] = [
    place.category,
    place.placeType ?? "",
    ...(place.tags ?? []),
    ...(place.sourceTags ?? []),
    ...(place.communityTags ?? []),
  ].join(" ").toLowerCase().replace(/[_-]+/g, " ").match(/[a-z0-9]+/g) ?? [];
  if (target === "smoking") return words.includes("smoking") || (words.includes("cigar") && words.includes("bar"));
  return words.includes("alcohol") || words.includes("bar") || words.includes("pub");
}

// Only fixed vibe labels and numbers go into this HTML, never user-written text.
function openInviteIcon(options: OpenInviteIconOptions) {
  const vibe = INVITE_VIBES[options.vibe];
  const lifeSeconds = Math.max(1, (Date.parse(options.expiresAt) - Date.parse(options.createdAt)) / 1000);
  const elapsedSeconds = Math.max(0, (Date.now() - Date.parse(options.createdAt)) / 1000);
  const classes = [
    "open-invite-marker",
    options.dropping ? "is-dropping" : "",
    options.isSelected ? "is-selected" : "",
    options.isMine ? "is-mine" : "",
    options.amGoing ? "is-going" : "",
  ].filter(Boolean).join(" ");
  const count = options.goingCount > 0 ? `<span class="open-invite-pin__count">${options.goingCount}</span>` : "";
  const label = options.isMine ? "YOUR INVITE" : options.amGoing ? "YOU'RE IN" : vibe.label.toUpperCase();
  return L.divIcon({
    className: classes,
    html: `<span class="open-invite-pin" style="--invite-color:${vibe.color};--invite-life:${lifeSeconds}s;--invite-elapsed:-${elapsedSeconds}s;--drop-delay:${options.dropDelayMs}ms">`
      + '<span class="open-invite-pin__ping"></span><span class="open-invite-pin__ping open-invite-pin__ping--late"></span>'
      + '<span class="open-invite-pin__body">'
      + '<span class="open-invite-pin__bubble">'
      + '<svg class="open-invite-pin__timer" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" pathLength="100"/></svg>'
      + `<svg class="open-invite-pin__icon" viewBox="0 0 24 24" aria-hidden="true">${OPEN_INVITE_SYMBOL}</svg>`
      + `</span>${count}<span class="open-invite-pin__label">${label}</span>`
      + "</span></span>",
    iconSize: [56, 76],
    iconAnchor: [28, 55],
  });
}

function OpenInviteMarker({
  invite,
  selected,
  dropDelayMs,
  onSelect,
}: {
  invite: OpenInviteView;
  selected: boolean;
  dropDelayMs: number;
  onSelect: (invite: OpenInviteView) => void;
}) {
  // New pins drop in once (like cars appearing in a ride-share app); later icon
  // swaps for selection or RSVP counts must not replay the drop.
  const [dropping, setDropping] = useState(true);
  const { vibe, createdAt, expiresAt, goingCount, isMine, amGoing } = invite;

  useEffect(() => {
    const timer = window.setTimeout(() => setDropping(false), DROP_ANIMATION_MS + dropDelayMs);
    return () => window.clearTimeout(timer);
  }, [dropDelayMs]);

  const icon = useMemo(() => openInviteIcon({
    vibe, createdAt, expiresAt, goingCount, isMine, amGoing, isSelected: selected, dropping, dropDelayMs,
  }), [amGoing, createdAt, dropDelayMs, dropping, expiresAt, goingCount, isMine, selected, vibe]);

  return (
    <Marker
      position={[invite.place.lat, invite.place.lng]}
      icon={icon}
      title={`Open invite: ${INVITE_VIBES[vibe].label} at ${invite.place.title}`}
      zIndexOffset={selected ? 1200 : 800}
      eventHandlers={{ click: () => onSelect(invite) }}
    />
  );
}

function avatarIcon() {
  return L.divIcon({
    className: "map-avatar",
    html: `<svg viewBox="0 0 48 52" aria-hidden="true"><circle class="map-avatar__halo" cx="24" cy="27" r="17"/><path class="map-avatar__arrow" d="M24 4 41 43 24 34 7 43Z"/></svg>`,
    iconSize: [48, 52],
    iconAnchor: [24, 27],
  });
}

function UserLocationMarker({ coordinates }: { coordinates: [number, number] }) {
  const heading = useSyncExternalStore(subscribeDeviceHeading, getDeviceHeading, () => 0);
  const markerRef = useRef<L.Marker | null>(null);
  const icon = useMemo(() => avatarIcon(), []);

  useEffect(() => {
    markerRef.current?.getElement()?.style.setProperty("--map-avatar-heading", `${heading}deg`);
  }, [heading]);

  return <Marker ref={markerRef} position={coordinates} icon={icon} keyboard={false} zIndexOffset={1000} />;
}

function MapControls({
  coordinates,
}: {
  coordinates: [number, number];
}) {
  const map = useMap();
  return (
    <div className="map-controls">
      <button aria-label="Zoom in" onClick={() => map.zoomIn()}><Plus size={18} /></button>
      <button aria-label="Zoom out" onClick={() => map.zoomOut()}><Minus size={18} /></button>
      <button className="map-controls__locate" aria-label="Center on my location" onClick={() => {
        map.setView(coordinates, 17, { animate: true });
      }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>
      </button>
    </div>
  );
}

function EmptyRadarPrompt({
  category,
  radiusKm,
  center,
  message,
  onExpand,
}: {
  category: Category;
  radiusKm: number;
  center: [number, number];
  message: string;
  onExpand: () => void;
}) {
  const map = useMap();
  const [dismissed, setDismissed] = useState(false);
  const isAtMaximum = radiusKm >= 10;
  if (dismissed) return null;
  return (
    <section className="empty-radar-prompt" aria-live="polite" aria-label="No nearby places">
      <button className="empty-radar-close" aria-label="Dismiss no places message" onClick={() => setDismissed(true)}>
        <X size={15} />
      </button>
      <div className="empty-radar-badge"><Radar size={15} /> SIGNAL OUT OF RANGE</div>
      <h2>{category === "EVENTS" ? "NO EVENTS IN THIS ZONE" : "NO VIBES DETECTED IN THIS ZONE!"}</h2>
      <p>{message || `No ${category.toLowerCase()} places were found within ${radiusKm} km. Widen your scan to check nearby areas.`}</p>
      <button
        className="empty-radar-action"
        onClick={() => {
          onExpand();
          map.flyTo(center, 13, { animate: true, duration: 0.8 });
        }}
      >
        <span>{isAtMaximum ? "SCAN AGAIN" : "EXPAND RADAR TO 10 KM"}</span>
        {isAtMaximum ? <ArrowRight size={17} /> : <Zap size={17} fill="currentColor" />}
      </button>
    </section>
  );
}

function MapFocus({
  coordinates,
  selected,
  focusPoint,
  navigating,
}: {
  coordinates: [number, number];
  selected?: VibePlace;
  focusPoint?: [number, number];
  navigating: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!navigating && focusPoint) {
      // The open-invite card covers the lower half of the map, so centre slightly
      // south of the pin to keep it visible above the card.
      const shifted = map.project(focusPoint, 17).add([0, map.getSize().y * 0.25]);
      map.setView(map.unproject(shifted, 17), 17, { animate: true });
      return;
    }
    const center = navigating ? coordinates : selected ? [selected.lat, selected.lng] as [number, number] : coordinates;
    map.setView(center, 17, { animate: true });
  }, [coordinates, focusPoint, map, navigating, selected]);
  return null;
}

interface MapCanvasProps {
  category: Category;
  selected?: VibePlace;
  navigationTarget?: VibePlace;
  onExpandRadar: () => void;
  reportedPlaceIds: string[];
  onSelect: (place: VibePlace) => void;
  onPlacesLoaded: (places: VibePlace[]) => void;
  onWarnings: (warnings: string[]) => void;
  refresh: number;
  openInvites: OpenInviteView[];
  selectedOpenInviteId?: string;
  onSelectOpenInvite: (invite: OpenInviteView) => void;
}

function MapWithLocation({
  category, selected, navigationTarget, onExpandRadar, reportedPlaceIds, onSelect, onPlacesLoaded, onWarnings, refresh,
  openInvites, selectedOpenInviteId, onSelectOpenInvite,
  coordinates,
}: MapCanvasProps & { coordinates: [number, number] }) {
  const { profile, preferences, placesCoordinates } = useVibe();
  const selectedOpenInvite = openInvites.find((invite) => invite.id === selectedOpenInviteId);
  const focusLat = selectedOpenInvite?.place.lat;
  const focusLng = selectedOpenInvite?.place.lng;
  const focusPoint = useMemo<[number, number] | undefined>(
    () => focusLat !== undefined && focusLng !== undefined ? [focusLat, focusLng] : undefined,
    [focusLat, focusLng],
  );
  const queryCenter = placesCoordinates ?? coordinates;
  const [result, setResult] = useState<{
    key: string;
    places: VibePlace[];
    warnings: string[];
    error: string;
  }>({ key: "", places: [], warnings: [], error: "" });
  const [now, setNow] = useState(() => Date.now());
  const vibratedPlaces = useRef(new Set<string>());
  const query = useMemo(() => new URLSearchParams({
    category,
    lat: String(queryCenter[0]),
    lng: String(queryCenter[1]),
    radius: String(profile.radiusKm),
  }).toString(), [category, profile.radiusKm, queryCenter]);
  const queryKey = `${query}&refresh=${refresh}`;
  const loading = result.key !== queryKey;
  const places = useMemo(
    () => result.places.filter((place) =>
      !reportedPlaceIds.includes(place.id) &&
      (!place.expiresAt || Date.parse(place.expiresAt) > now) &&
      !(preferences.hideSmokingSpots && hasPlaceTag(place, "smoking")) &&
      !(preferences.hideAlcoholSpots && hasPlaceTag(place, "alcohol")),
    ),
    [now, preferences.hideAlcoholSpots, preferences.hideSmokingSpots, reportedPlaceIds, result.places],
  );
  const error = result.key === queryKey ? result.error : "";
  const warnings = result.key === queryKey ? result.warnings : [];

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
        const unreportedPlaces = visiblePlaces.filter((place) => !reportedPlaceIds.includes(place.id));
        const warnings = body.offline
          ? ["Offline mode: showing cached places; live events and map tiles need an internet connection."]
          : body.warnings;
        setResult({ key: queryKey, places: unreportedPlaces, warnings, error: "" });
        onWarnings(warnings);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        const message = reason instanceof Error ? reason.message : "Could not load places.";
        setResult((current) => ({ ...current, key: queryKey, error: message }));
      });
    return () => controller.abort();
  }, [category, onWarnings, profile.radiusKm, query, queryCenter, queryKey, reportedPlaceIds]);

  useEffect(() => {
    if (!result.places.some((place) => place.expiresAt && Date.parse(place.expiresAt) > Date.now())) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      setResult((current) => {
        const activePlaces = current.places.filter((place) => !place.expiresAt || Date.parse(place.expiresAt) > timestamp);
        return activePlaces.length === current.places.length
          ? current
          : { ...current, places: activePlaces };
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [result.places]);

  useEffect(() => onPlacesLoaded(places), [onPlacesLoaded, places]);

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
        <MapFocus coordinates={coordinates} selected={selected} focusPoint={focusPoint} navigating={Boolean(navigationTarget)} />
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
        <UserLocationMarker coordinates={coordinates} />
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
        {openInvites.map((invite, index) => (
          <OpenInviteMarker
            key={invite.id}
            invite={invite}
            selected={invite.id === selectedOpenInviteId}
            dropDelayMs={Math.min(index, 8) * DROP_STAGGER_MS}
            onSelect={onSelectOpenInvite}
          />
        ))}
        {route && <Polyline positions={route} pathOptions={{ color: "#06b6d4", weight: 4, opacity: 0.95, dashArray: "7 10", className: "navigation-vector" }} />}
        <MapControls coordinates={coordinates} />
        {!loading && !error && places.length === 0 && (
          <EmptyRadarPrompt
            category={category}
            radiusKm={profile.radiusKm}
            center={queryCenter}
            message={warnings.join(" ")}
            onExpand={onExpandRadar}
          />
        )}
      </MapContainer>
      <div className="map-halftone" aria-hidden="true" />
      <div className="map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>
      {loading && <div className="map-status"><MapLoader compact label="SCANNING YOUR RADIUS..." /></div>}
      {error && <div className="map-warning" role="alert">{error}</div>}
    </div>
  );
}

export default function MapCanvas(props: MapCanvasProps) {
  const { coordinates, locationStatus, requestLocation } = useVibe();
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
  return <MapWithLocation {...props} coordinates={coordinates} />;
}
