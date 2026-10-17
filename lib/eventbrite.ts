import "server-only";
import type { VibePlace } from "@/lib/types";
import { inferEventTags } from "@/lib/event-tags";
import { isSydneyCoordinate } from "@/lib/geo";

interface EventbriteText {
  text?: string | null;
}

interface EventbriteVenue {
  name?: string;
  address?: { localized_address_display?: string };
  latitude?: string;
  longitude?: string;
}

interface EventbriteEvent {
  id: string;
  name?: EventbriteText;
  description?: EventbriteText;
  url?: string;
  start?: { local?: string };
  end?: { local?: string };
  venue?: EventbriteVenue;
  is_free?: boolean;
  ticket_availability?: { has_available_tickets?: boolean };
}

interface EventbriteSearchResponse {
  events?: EventbriteEvent[];
}

export async function findNearbyEventbriteEvents(
  latitude: number,
  longitude: number,
  radiusKm: number,
): Promise<{ events: VibePlace[]; warning?: string }> {
  const token = process.env.EVENTBRITE_API_KEY?.trim();
  if (!token) return { events: [] };

  const url = new URL("https://www.eventbriteapi.com/v3/events/search/");
  url.searchParams.set("location.latitude", String(latitude));
  url.searchParams.set("location.longitude", String(longitude));
  url.searchParams.set("location.within", `${radiusKm}km`);
  url.searchParams.set("sort_by", "date");
  url.searchParams.set("page_size", "50");
  url.searchParams.set("expand", "venue,ticket_availability");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Eventbrite request failed.", error instanceof Error ? error.message : "Unknown error");
    return { events: [], warning: "Eventbrite event listings could not be reached." };
  }

  if (!response.ok) {
    console.error(`Eventbrite returned HTTP ${response.status}.`);
    return {
      events: [],
      warning: response.status === 401 || response.status === 403
        ? "Eventbrite rejected the configured API key."
        : "Eventbrite event listings are temporarily unavailable.",
    };
  }

  const result = await response.json() as EventbriteSearchResponse;
  const events = (result.events ?? []).flatMap((event): VibePlace[] => {
    const lat = Number(event.venue?.latitude);
    const lng = Number(event.venue?.longitude);
    const title = event.name?.text?.trim();
    if (!event.id || !title || !isSydneyCoordinate(lat, lng)) return [];

    return [{
      id: `eventbrite-${event.id}`,
      title,
      category: "EVENTS",
      tags: inferEventTags(title),
      lat,
      lng,
      address: event.venue?.address?.localized_address_display ?? event.venue?.name ?? "Address not listed",
      details: event.description?.text?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500)
        ?? "Live Sydney event listing from Eventbrite.",
      source: "Live Eventbrite listing",
      link: event.url,
      isLiveEvent: true,
      eventStart: event.start?.local,
      eventEnd: event.end?.local,
      isFree: event.is_free,
      eventDetails: {
        activeEvent: title,
        registrationStatus: event.ticket_availability?.has_available_tickets === false
          ? "Registration may be closed"
          : "Tickets listed on Eventbrite",
      },
    }];
  });

  return { events };
}
