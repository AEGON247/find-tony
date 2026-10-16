import "server-only";
import type { Category, VibePlace } from "@/lib/types";
import { isSydneyCoordinate } from "@/lib/geo";

interface LumaEvent {
  api_id?: string;
  name?: string;
  url?: string;
  start_at?: string;
  end_at?: string;
  cover_url?: string;
  social_image_url?: string;
  visibility?: string;
  hide_rsvp?: boolean;
  coordinate?: { latitude?: number; longitude?: number } | null;
  geo_address_info?: { full_address?: string } | null;
}

interface LumaEntry {
  event?: LumaEvent;
  registration_availability?: string;
  ticket_info?: {
    is_free?: boolean;
    is_sold_out?: boolean;
    price?: { cents?: number; currency?: string } | null;
    spots_remaining?: number | null;
  };
}

interface LumaResponse {
  entries?: LumaEntry[];
}

interface LumaEventsResult {
  events: VibePlace[];
  warnings: string[];
}

const CACHE_DURATION_MS = 60 * 1000;
const STALE_CACHE_LIMIT_MS = 60 * 60 * 1000;
const LUMA_DISCOVERY_URL = "https://api.luma.com/discover/get-paginated-events?slug=sydney";
let cachedEvents: VibePlace[] | null = null;
let lastFetchTime = 0;
let inFlight: Promise<LumaEventsResult> | null = null;

function inferCategory(name: string): Category | null {
  const text = name.toLowerCase();
  if (/\b(hackathon|hack|coding|code|developer|dev|builder|build|startups?|founders?|ai|machine learning|data|technology|tech meetup|demo night|software|programming)\b/.test(text)) {
    return "HACKATHONS";
  }
  if (/\b(party|drinks|pub|bar|dj|music|club|dance|nightlife|gig|concert)\b/.test(text)) {
    return "PARTY";
  }
  if (/\b(study|cowork|co-work|wellness|meditation|yoga|walk|run|fitness|mindful|book club|quiet)\b/.test(text)) {
    return "CHILL";
  }
  if (/\b(food|dinner|brunch|lunch|pizza|cooking|tasting|restaurant|cafe|coffee|bakery|banh mi)\b/.test(text)) {
    return "FOODIE";
  }
  return null;
}

function mapEntry(entry: LumaEntry): VibePlace | null {
  const event = entry.event;
  const title = event?.name?.trim();
  const category = title ? inferCategory(title) : null;
  const latitude = event?.coordinate?.latitude;
  const longitude = event?.coordinate?.longitude;

  if (
    !event?.api_id ||
    !title ||
    !category ||
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !isSydneyCoordinate(latitude, longitude) ||
    (event.start_at && Number.isFinite(Date.parse(event.start_at)) && Date.parse(event.start_at) < Date.now()) ||
    (event.visibility && event.visibility !== "public")
  ) {
    return null;
  }

  const ticketInfo = entry.ticket_info;
  const registrationStatus = ticketInfo?.is_sold_out
    ? "Sold out"
    : entry.registration_availability === "open"
      ? "Registration open"
      : entry.registration_availability === "waitlist"
        ? "Waitlist available"
        : "Check Luma for registration status";
  const imageCandidate = event.cover_url ?? event.social_image_url;
  let imageUrl: string | undefined;
  if (imageCandidate) {
    try {
      const image = new URL(imageCandidate);
      if (image.protocol === "https:" || image.protocol === "http:") imageUrl = image.toString();
    } catch {
      imageUrl = undefined;
    }
  }

  return {
    id: `luma-${event.api_id}`,
    title,
    category,
    lat: latitude,
    lng: longitude,
    address: event.geo_address_info?.full_address || "Address not listed",
    details: "Live public event listing from Luma. Check the organizer's page for full event details.",
    placeType: "Public event",
    imageUrl,
    source: "Live Luma listing",
    link: event.url
      ? event.url.startsWith("https://lu.ma/")
        ? event.url
        : `https://lu.ma/${encodeURIComponent(event.url)}`
      : undefined,
    isLiveEvent: true,
    eventStart: event.start_at,
    eventEnd: event.end_at,
    isFree: ticketInfo?.is_free,
    eventDetails: {
      activeEvent: title,
      registrationStatus,
      ...(ticketInfo?.price?.cents !== undefined && ticketInfo.price.currency
        ? { deal: `${(ticketInfo.price.cents / 100).toFixed(2)} ${ticketInfo.price.currency.toUpperCase()}` }
        : {}),
      ...(ticketInfo?.spots_remaining !== undefined && ticketInfo.spots_remaining !== null
        ? { entry: `${ticketInfo.spots_remaining} spots remaining` }
        : {}),
    },
  };
}

function upcomingEvents(events: VibePlace[]) {
  const now = Date.now();
  return events.filter((event) =>
    !event.eventStart ||
    !Number.isFinite(Date.parse(event.eventStart)) ||
    Date.parse(event.eventStart) >= now,
  );
}

async function fetchLumaEvents(): Promise<LumaEventsResult> {
  const response = await fetch(LUMA_DISCOVERY_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "FindTony/1.0 (public Sydney event discovery)",
    },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Luma returned HTTP ${response.status}.`);

  const payload = await response.json() as LumaResponse;
  const events = (payload.entries ?? [])
    .map(mapEntry)
    .filter((event): event is VibePlace => event !== null);
  cachedEvents = events;
  lastFetchTime = Date.now();
  return { events, warnings: [] };
}

export function getSydneyLumaEvents(): Promise<LumaEventsResult> {
  if (cachedEvents !== null && Date.now() - lastFetchTime < CACHE_DURATION_MS) {
    return Promise.resolve({ events: upcomingEvents(cachedEvents), warnings: [] });
  }
  if (inFlight) return inFlight;

  inFlight = fetchLumaEvents()
    .catch((error: unknown) => {
      console.error("Luma discovery request failed.", error instanceof Error ? error.message : "Unknown error");
      const stale = cachedEvents !== null && Date.now() - lastFetchTime < STALE_CACHE_LIMIT_MS
        ? upcomingEvents(cachedEvents)
        : [];
      return {
        events: stale,
        warnings: [
          stale.length > 0
            ? "Luma is temporarily unavailable; showing recently cached public events."
            : "Luma is temporarily unavailable; community places remain available.",
        ],
      };
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
