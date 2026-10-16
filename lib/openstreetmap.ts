import "server-only";
import { distanceInMeters, isSydneyCoordinate } from "@/lib/geo";
import type { Category, VibePlace } from "@/lib/types";

interface OverpassElement {
  type?: "node" | "way" | "relation";
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface NominatimPlace {
  place_id?: number;
  osm_type?: "node" | "way" | "relation";
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  class?: string;
  category?: string;
  type?: string;
  address?: Record<string, string | undefined>;
  extratags?: Record<string, string | undefined>;
}

interface PlacesResult {
  places: VibePlace[];
  warnings: string[];
}

interface CacheEntry extends PlacesResult {
  cachedAt: number;
}

const CACHE_DURATION_MS = 30 * 60 * 1000;
const FAILURE_CACHE_DURATION_MS = 15 * 1000;
const STALE_CACHE_DURATION_MS = 60 * 60 * 1000;
const OVERPASS_COOLDOWN_MS = 60 * 1000;
const OVERPASS_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 1_800;
const OVERPASS_TOTAL_TIMEOUT_MS = 2_400;
const NOMINATIM_TIMEOUT_MS = 3_000;
const NOMINATIM_MINIMUM_INTERVAL_MS = 1_100;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<PlacesResult>>();
const overpassCooldowns = new Map<string, number>();
let nextNominatimRequestAt = 0;
let nominatimQueue: Promise<void> = Promise.resolve();

async function waitForNominatimSlot() {
  const slot = nominatimQueue.then(async () => {
    const waitMs = Math.max(0, nextNominatimRequestAt - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextNominatimRequestAt = Date.now() + NOMINATIM_MINIMUM_INTERVAL_MS;
  });
  nominatimQueue = slot;
  await slot;
}

function mapElement(element: OverpassElement): VibePlace | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  const amenity = tags.amenity;
  const leisure = tags.leisure;
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;

  if (
    !name ||
    (!amenity && !leisure) ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !isSydneyCoordinate(lat, lng) ||
    typeof element.id !== "number" ||
    !element.type
  ) {
    return null;
  }

  const category: Category | undefined = ["bar", "pub", "nightclub"].includes(amenity ?? "")
    ? "PARTY"
    : ["restaurant", "cafe", "fast_food", "food_court"].includes(amenity ?? "")
      ? "FOODIE"
      : ["hackerspace", "events_venue"].includes(amenity ?? "")
        ? "HACKATHONS"
        : ["library", "coworking_space", "community_centre"].includes(amenity ?? "") || ["park", "garden"].includes(leisure ?? "")
          ? "CHILL"
          : undefined;
  if (!category) return null;
  const cuisine = tags.cuisine?.split(";").map((part) => part.trim()).filter(Boolean).join(", ");
  const amenityLabels: Record<string, string> = {
    bar: "Bar",
    cafe: "Cafe",
    community_centre: "Community centre",
    coworking_space: "Coworking space",
    events_venue: "Event venue",
    fast_food: "Fast-food restaurant",
    food_court: "Food court",
    hackerspace: "Hackerspace",
    library: "Library",
    nightclub: "Nightclub",
    pub: "Pub",
    restaurant: "Restaurant",
  };
  const placeType = amenity ? amenityLabels[amenity] : (leisure === "garden" ? "Garden" : "Park");
  const description = tags.description?.trim();
  const imageValue = tags.image;
  let imageUrl: string | undefined;
  if (imageValue) {
    try {
      const image = new URL(imageValue);
      if (image.protocol === "https:" || image.protocol === "http:") imageUrl = image.toString();
    } catch {
      imageUrl = undefined;
    }
  }
  const details = [
    description || `${placeType}${cuisine ? ` serving ${cuisine}` : ""}.`,
    tags.takeaway === "yes" ? "Takeaway available." : "",
    tags.outdoor_seating === "yes" ? "Outdoor seating." : "",
    ["yes", "no", "limited"].includes(tags.wheelchair ?? "")
      ? `Wheelchair access: ${tags.wheelchair}.`
      : "",
  ].filter(Boolean).join(" ");
  const address = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:suburb"] ?? tags["addr:city"],
  ].filter(Boolean).join(", ");
  const website = tags.website ?? tags["contact:website"];
  let link: string | undefined;
  if (website) {
    try {
      const url = new URL(website.startsWith("http") ? website : `https://${website}`);
      if (url.protocol === "https:" || url.protocol === "http:") link = url.toString();
    } catch {
      link = undefined;
    }
  }

  return {
    id: `osm-${element.type}-${element.id}`,
    title: name,
    category,
    lat,
    lng,
    address: address || "Address not listed",
    details,
    placeType,
    accessibility: tags.wheelchair === "yes"
      ? "Wheelchair accessible"
      : tags.wheelchair === "limited"
        ? "Limited wheelchair access"
        : tags.wheelchair === "no"
          ? "Not wheelchair accessible"
          : undefined,
    imageUrl,
    source: "Mapped place",
    link,
    eventDetails: {
      ...(tags.opening_hours ? { hours: tags.opening_hours } : {}),
      ...(tags.level ? { floor: `Level ${tags.level}` } : {}),
    },
    isMapPoi: true,
  };
}

function isCategoryAmenity(amenity: string | undefined, category: Category) {
  const categoryTypes: Record<Category, string[]> = {
    FOODIE: ["restaurant", "cafe", "fast_food", "food_court"],
    PARTY: ["bar", "pub", "nightclub"],
    HACKATHONS: ["hackerspace", "events_venue"],
    CHILL: ["library", "coworking_space", "community_centre", "park", "garden"],
  };
  return categoryTypes[category].includes(amenity ?? "");
}

function mapNominatimResult(
  item: NominatimPlace,
  category: Category,
  latitude: number,
  longitude: number,
): VibePlace | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  const amenity = item.type;
  const name = item.name?.trim() || item.display_name?.split(",")[0]?.trim();
  if (
    !name ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !isSydneyCoordinate(lat, lng) ||
    !(
      ((item.category ?? item.class) === "amenity" && isCategoryAmenity(amenity, category)) ||
      (category === "CHILL" && (item.category ?? item.class) === "leisure" && ["park", "garden"].includes(amenity ?? ""))
    )
  ) {
    return null;
  }

  const address = item.address;
  const street = [address?.house_number, address?.road].filter(Boolean).join(" ");
  const locality = address?.suburb ?? address?.city ?? address?.town;
  const formattedAddress = [street, locality].filter(Boolean).join(", ");
  const amenityLabels: Record<string, string> = {
    bar: "Bar",
    cafe: "Cafe",
    community_centre: "Community centre",
    coworking_space: "Coworking space",
    events_venue: "Event venue",
    fast_food: "Fast-food restaurant",
    food_court: "Food court",
    hackerspace: "Hackerspace",
    library: "Library",
    nightclub: "Nightclub",
    pub: "Pub",
    restaurant: "Restaurant",
    park: "Park",
    garden: "Garden",
  };
  const cuisine = item.extratags?.cuisine;
  const description = item.extratags?.description?.trim();
  const websiteValue = item.extratags?.website;
  let link: string | undefined;
  if (websiteValue) {
    try {
      const website = new URL(websiteValue.startsWith("http") ? websiteValue : `https://${websiteValue}`);
      if (website.protocol === "https:" || website.protocol === "http:") link = website.toString();
    } catch {
      link = undefined;
    }
  }
  const details = [
    description || `${amenityLabels[amenity ?? ""] ?? "Place"}${cuisine ? ` serving ${cuisine}` : ""}.`,
    item.extratags?.takeaway === "yes" ? "Takeaway available." : "",
    item.extratags?.outdoor_seating === "yes" ? "Outdoor seating." : "",
  ].filter(Boolean).join(" ");
  const imageValue = item.extratags?.image;
  let imageUrl: string | undefined;
  if (imageValue) {
    try {
      const image = new URL(imageValue);
      if (image.protocol === "https:" || image.protocol === "http:") imageUrl = image.toString();
    } catch {
      imageUrl = undefined;
    }
  }
  return {
    id: `nominatim-${item.place_id ?? `${lat}-${lng}`}`,
    title: name,
    category,
    lat,
    lng,
    address: formattedAddress || item.display_name || "Address not listed",
    details,
    placeType: amenityLabels[amenity ?? ""] ?? "Place",
    accessibility: item.extratags?.wheelchair === "yes"
      ? "Wheelchair accessible"
      : item.extratags?.wheelchair === "limited"
        ? "Limited wheelchair access"
        : item.extratags?.wheelchair === "no"
          ? "Not wheelchair accessible"
          : undefined,
    imageUrl,
    source: "Mapped place",
    link,
    eventDetails: {
      ...(item.extratags?.opening_hours ? { hours: item.extratags.opening_hours } : {}),
      ...(item.extratags?.level ? { floor: `Level ${item.extratags.level}` } : {}),
    },
    isMapPoi: true,
    distanceMeters: Math.round(distanceInMeters(latitude, longitude, lat, lng)),
  };
}

async function fetchFromOverpass(
  lat: number,
  lng: number,
  radiusKm: number,
  category: Category,
): Promise<VibePlace[]> {
  const radiusMeters = Math.round(radiusKm * 1000);
  const around = `(around:${radiusMeters},${lat},${lng})`;
  const tagQuery: Record<Category, string> = {
    FOODIE: `nwr["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"]${around};`,
    PARTY: `nwr["amenity"~"^(bar|pub|nightclub)$"]["name"]${around};`,
    HACKATHONS: `nwr["amenity"~"^(hackerspace|events_venue)$"]["name"]${around};`,
    CHILL: `nwr["amenity"~"^(library|coworking_space|community_centre)$"]["name"]${around};nwr["leisure"~"^(park|garden)$"]["name"]${around};`,
  };
  const query = `[out:json][timeout:8];(${tagQuery[category]});out center 100;`;
  const failures: string[] = [];
  const deadline = Date.now() + OVERPASS_TOTAL_TIMEOUT_MS;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const cooldownUntil = overpassCooldowns.get(endpoint) ?? 0;
    if (cooldownUntil > Date.now()) continue;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": "FindTony/1.0 (public Sydney place discovery)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(Math.min(OVERPASS_TIMEOUT_MS, remainingMs)),
        cache: "no-store",
      });
      if (!response.ok) {
        failures.push(`${new URL(endpoint).hostname}: HTTP ${response.status}`);
        if (response.status === 429 || response.status >= 500) {
          overpassCooldowns.set(endpoint, Date.now() + OVERPASS_COOLDOWN_MS);
        }
        continue;
      }
      overpassCooldowns.delete(endpoint);
      const payload = await response.json() as OverpassResponse;
      const places = (payload.elements ?? [])
        .map(mapElement)
        .filter((place): place is VibePlace => place !== null);
      if (places.length > 0) return places;
    } catch (error: unknown) {
      failures.push(`${new URL(endpoint).hostname}: ${error instanceof Error ? error.message : "request failed"}`);
      overpassCooldowns.set(endpoint, Date.now() + OVERPASS_COOLDOWN_MS);
    }
  }
  if (failures.length > 0) {
    console.warn("Overpass endpoints failed or returned no nearby named places.", failures);
  }
  return [];
}

async function fetchFromNominatim(
  lat: number,
  lng: number,
  radiusKm: number,
  category: Category,
): Promise<VibePlace[]> {
  await waitForNominatimSlot();

  const latitudeRadiusDegrees = radiusKm / 111;
  const longitudeRadiusDegrees = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const params = new URLSearchParams({
    format: "jsonv2",
    q: {
      FOODIE: "cafe",
      PARTY: "bar",
      HACKATHONS: "hackerspace",
      CHILL: "library",
    }[category],
    viewbox: [
      lng - longitudeRadiusDegrees,
      lat + latitudeRadiusDegrees,
      lng + longitudeRadiusDegrees,
      lat - latitudeRadiusDegrees,
    ].join(","),
    bounded: "1",
    addressdetails: "1",
    extratags: "1",
    limit: "30",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "FindTony/1.0 (Sydney campus places discovery)",
    },
    signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}.`);
  const results = await response.json() as NominatimPlace[];
  return results
    .map((item) => mapNominatimResult(item, category, lat, lng))
    .filter((place): place is VibePlace => place !== null);
}

async function fetchPlaces(
  lat: number,
  lng: number,
  radiusKm: number,
  category: Category,
): Promise<PlacesResult> {
  const overpassPlaces = await fetchFromOverpass(lat, lng, radiusKm, category);
  if (overpassPlaces.length > 0) return { places: overpassPlaces, warnings: [] };

  try {
    const nominatimPlaces = await fetchFromNominatim(lat, lng, radiusKm, category);
    if (nominatimPlaces.length > 0) return { places: nominatimPlaces, warnings: [] };
  } catch (error: unknown) {
    console.error("Nominatim nearby places request failed.", error instanceof Error ? error.message : "Unknown error");
  }
  return {
    places: [],
    warnings: ["Live map places are temporarily unavailable; saved community places remain available."],
  };
}

export function getNearbyOpenStreetMapPlaces(
  latitude: number,
  longitude: number,
  radiusKm: number,
  category: Category,
): Promise<PlacesResult> {
  const lat = Number(latitude.toFixed(3));
  const lng = Number(longitude.toFixed(3));
  const key = `${lat},${lng},${radiusKm},${category}`;
  const entry = cache.get(key);

  const cacheDuration = entry?.warnings.length ? FAILURE_CACHE_DURATION_MS : CACHE_DURATION_MS;
  if (entry && Date.now() - entry.cachedAt < cacheDuration) {
    return Promise.resolve({ places: entry.places, warnings: entry.warnings });
  }
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = fetchPlaces(lat, lng, radiusKm, category)
    .then((result) => {
      if (
        result.warnings.length > 0 &&
        entry &&
        Date.now() - entry.cachedAt < STALE_CACHE_DURATION_MS
      ) {
        const staleResult = {
          places: entry.places,
          warnings: ["Live map places are temporarily unavailable; showing recently cached spots."],
        };
        cache.set(key, { ...staleResult, cachedAt: Date.now() });
        return staleResult;
      }
      if (cache.size >= 100) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(key, { ...result, cachedAt: Date.now() });
      return result;
    })
    .catch((error: unknown) => {
      console.error("OpenStreetMap nearby places request failed.", error instanceof Error ? error.message : "Unknown error");
      const stale = entry && Date.now() - entry.cachedAt < STALE_CACHE_DURATION_MS
        ? entry.places
        : [];
      const failureResult = {
        places: stale,
        warnings: [
          stale.length > 0
            ? "OpenStreetMap places are temporarily unavailable; showing recently cached spots."
            : "Nearby map places are temporarily unavailable; saved community places remain available.",
        ],
      };
      cache.set(key, { ...failureResult, cachedAt: Date.now() });
      return failureResult;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}
