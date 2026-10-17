import { NextRequest, NextResponse } from "next/server";
import { distanceInMeters, isSydneyCoordinate } from "@/lib/geo";
import { getSydneyLumaEvents } from "@/lib/luma";
import { findNearbyEventbriteEvents } from "@/lib/eventbrite";
import { getNearbyOpenStreetMapPlaces } from "@/lib/openstreetmap";
import { readAlerts } from "@/lib/alerts";
import { readPlaceTags } from "@/lib/place-tags";
import { CATEGORIES, type Category, type VibePlace } from "@/lib/types";

export const dynamic = "force-dynamic";

const supportedRadii = new Set([1, 3, 5, 10]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const categoryValue = params.get("category") ?? "FOODIE";
  const latValue = params.get("lat");
  const lngValue = params.get("lng");
  const radiusValue = params.get("radius");

  if (!CATEGORIES.includes(categoryValue as Category)) {
    return NextResponse.json({ error: "Unknown vibe category." }, { status: 400 });
  }
  if ((latValue === null) !== (lngValue === null)) {
    return NextResponse.json({ error: "Latitude and longitude must be provided together." }, { status: 400 });
  }
  const lat = latValue === null ? undefined : Number(latValue);
  const lng = lngValue === null ? undefined : Number(lngValue);
  if (lat !== undefined && lng !== undefined && !isSydneyCoordinate(lat, lng)) {
    return NextResponse.json({ error: "Coordinates must be within Sydney bounds." }, { status: 400 });
  }
  const radiusKm = radiusValue === null ? 10 : Number(radiusValue);
  if (!supportedRadii.has(radiusKm)) {
    return NextResponse.json({ error: "Radius must be 1, 3, 5, or 10 km." }, { status: 400 });
  }

  let places: VibePlace[];
  const [alerts, live, eventbrite, osm, communityTags] = await Promise.all([
    readAlerts(),
    categoryValue === "EVENTS"
      ? getSydneyLumaEvents()
      : Promise.resolve({ events: [] as VibePlace[], warnings: [] as string[] }),
    categoryValue === "EVENTS" && lat !== undefined && lng !== undefined
      ? findNearbyEventbriteEvents(lat, lng, radiusKm)
      : Promise.resolve({ events: [] as VibePlace[], warning: undefined as string | undefined }),
    categoryValue !== "EVENTS" && lat !== undefined && lng !== undefined
      ? getNearbyOpenStreetMapPlaces(lat, lng, radiusKm, categoryValue as Category)
      : Promise.resolve({ places: [], warnings: [] }),
    readPlaceTags(),
  ]);
  places = [...alerts.filter((place) => place.category === categoryValue)];
  places = [...live.events.filter((place) => place.category === categoryValue), ...places];
  places = [...eventbrite.events, ...places];
  places = [...osm.places.filter((place) => place.category === categoryValue), ...places];
  const seenEventKeys = new Set<string>();
  places = places.filter((place) => {
    if (!place.isLiveEvent) return true;
    const eventKey = `${place.title.trim().toLocaleLowerCase("en-AU")}:${place.eventStart ?? ""}`;
    if (seenEventKeys.has(eventKey)) return false;
    seenEventKeys.add(eventKey);
    return true;
  });
  places = places.map((place) => {
    const sourceTags = [...new Set(place.tags ?? [])];
    const placeCommunityTags = communityTags[place.id] ?? [];
    return {
      ...place,
      sourceTags,
      communityTags: placeCommunityTags,
      tags: [...new Set([...sourceTags, ...placeCommunityTags])],
    };
  });
  let warnings = categoryValue === "EVENTS"
    ? [...live.warnings, ...(eventbrite.warning ? [eventbrite.warning] : [])]
    : [...osm.warnings];

  if (lat !== undefined && lng !== undefined) {
    places = places
      .map((place) => ({
        ...place,
        distanceMeters: Math.round(distanceInMeters(lat, lng, place.lat, place.lng)),
      }))
      .filter((place) => place.distanceMeters! <= radiusKm * 1000)
      .sort((left, right) => left.distanceMeters! - right.distanceMeters!);
  }

  if (categoryValue === "EVENTS" && places.length === 0) {
    warnings = warnings.length > 0
      ? warnings
      : [`No upcoming events were found within ${radiusKm} km. Try a larger search radius.`];
  }

  const source = categoryValue !== "EVENTS" && osm.warnings.some((warning) => /showing recently cached/i.test(warning))
    ? "stale_cache"
    : undefined;
  return NextResponse.json({ items: places, warnings, ...(source ? { source } : {}) });
}
