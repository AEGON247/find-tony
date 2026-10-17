import { NextRequest, NextResponse } from "next/server";
import { getFoursquareApiKey } from "@/lib/openstreetmap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FoursquarePhoto {
  prefix?: string;
  suffix?: string;
}

interface PhotoCacheEntry {
  photos: string[];
  cachedAt: number;
}

const PHOTO_CACHE_TTL_MS = 10 * 60 * 1000;
const PHOTO_CACHE_LIMIT = 200;
const photoCache = new Map<string, PhotoCacheEntry>();
const photoRequests = new Map<string, Promise<string[]>>();

async function loadPhotos(placeId: string, apiKey: string): Promise<string[]> {
  const cached = photoCache.get(placeId);
  if (cached && Date.now() - cached.cachedAt < PHOTO_CACHE_TTL_MS) return cached.photos;

  const pending = photoRequests.get(placeId);
  if (pending) return pending;

  const request = (async () => {
    const response = await fetch(
      `https://places-api.foursquare.com/places/${encodeURIComponent(placeId)}/photos?limit=3`,
      {
        headers: {
          Accept: "application/json",
          Authorization: apiKey,
          "X-Places-Api-Version": "2025-06-17",
        },
        signal: AbortSignal.timeout(2_500),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      console.warn(`[Foursquare Photos] Request failed with HTTP ${response.status}; using the category artwork.`);
      photoCache.set(placeId, { photos: [], cachedAt: Date.now() });
      return [];
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("Foursquare Photos returned an invalid response.");
    const photos = payload.flatMap((item: FoursquarePhoto) => {
      if (typeof item.prefix !== "string" || typeof item.suffix !== "string") return [];
      try {
        const url = new URL(`${item.prefix}300x300${item.suffix}`);
        return url.protocol === "https:" ? [url.toString()] : [];
      } catch {
        return [];
      }
    });
    if (photoCache.size >= PHOTO_CACHE_LIMIT) {
      const oldest = photoCache.keys().next();
      if (!oldest.done) photoCache.delete(oldest.value);
    }
    photoCache.set(placeId, { photos, cachedAt: Date.now() });
    return photos;
  })().finally(() => photoRequests.delete(placeId));

  photoRequests.set(placeId, request);
  return request;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ placeId: string }> },
) {
  void request;
  const { placeId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(placeId)) {
    return NextResponse.json({ error: "A valid Foursquare place ID is required." }, { status: 400 });
  }

  const apiKey = getFoursquareApiKey();
  if (!apiKey) {
    console.warn("[Foursquare Photos] No server-side Foursquare key is configured; using the category artwork.");
    return NextResponse.json({ photos: [] });
  }

  try {
    return NextResponse.json({ photos: await loadPhotos(placeId, apiKey) });
  } catch (error) {
    console.error("Foursquare venue photos could not be loaded.", error);
    return NextResponse.json({ photos: [] });
  }
}
