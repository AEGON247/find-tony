import { NextRequest, NextResponse } from "next/server";
import { distanceInMeters, isSydneyCoordinate } from "@/lib/geo";
import { getSydneyLumaEvents } from "@/lib/luma";
import { getNearbyOpenStreetMapPlaces } from "@/lib/openstreetmap";
import { readAlerts } from "@/lib/alerts";
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

  let places: VibePlace[] = (await readAlerts()).filter((place) => place.category === categoryValue);
  const [live, osm] = await Promise.all([
    getSydneyLumaEvents(),
    lat !== undefined && lng !== undefined
      ? getNearbyOpenStreetMapPlaces(lat, lng, radiusKm, categoryValue as Category)
      : Promise.resolve({ places: [], warnings: [] }),
  ]);
  places = [...live.events.filter((place) => place.category === categoryValue), ...places];
  places = [...osm.places.filter((place) => place.category === categoryValue), ...places];
  let warnings = [...live.warnings, ...osm.warnings];

  if (lat !== undefined && lng !== undefined) {
    places = places
      .map((place) => ({
        ...place,
        distanceMeters: Math.round(distanceInMeters(lat, lng, place.lat, place.lng)),
      }))
      .filter((place) => place.distanceMeters! <= radiusKm * 1000)
      .sort((left, right) => left.distanceMeters! - right.distanceMeters!);
  }

  if (categoryValue === "HACKATHONS") {
    warnings = places.length > 0
      ? live.warnings
      : live.warnings.length > 0
        ? live.warnings
        : [`No upcoming technology events were found within ${radiusKm} km. Try a larger search radius.`];
  }

  return NextResponse.json({ items: places, warnings });
}
