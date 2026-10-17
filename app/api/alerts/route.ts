import { NextRequest, NextResponse } from "next/server";
import { isSydneyCoordinate } from "@/lib/geo";
import { saveAlert } from "@/lib/alerts";
import { CATEGORIES, type Category, type VibePlace } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON alert body is required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const category = input.category;
  const lat = input.lat;
  const lng = input.lng;
  const details = input.details;
  const tags = input.tags;
  const eventTag = input.eventTag;
  if (title.length < 3 || title.length > 80) {
    return NextResponse.json({ error: "Title must be between 3 and 80 characters." }, { status: 400 });
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: "Choose a valid vibe category." }, { status: 400 });
  }
  if (typeof lat !== "number" || typeof lng !== "number" || !isSydneyCoordinate(lat, lng)) {
    return NextResponse.json({ error: "Alert coordinates must be within Sydney bounds." }, { status: 400 });
  }
  if (details !== undefined && (typeof details !== "string" || details.length > 280)) {
    return NextResponse.json({ error: "Details must be 280 characters or fewer." }, { status: 400 });
  }
  if (
    tags !== undefined &&
    (!Array.isArray(tags) ||
      tags.length > 5 ||
      tags.some((tag) => typeof tag !== "string" || tag.trim().length < 2 || tag.trim().length > 32))
  ) {
    return NextResponse.json({ error: "Provide up to five tags, each 2 to 32 characters long." }, { status: 400 });
  }
  if (eventTag !== undefined && (
    typeof eventTag !== "string" ||
    eventTag.trim().length < 2 ||
    eventTag.trim().length > 32
  )) {
    return NextResponse.json({ error: "Event type must be between 2 and 32 characters." }, { status: 400 });
  }
  if (eventTag !== undefined && category !== "EVENTS") {
    return NextResponse.json({ error: "Event tags can only be used with the EVENTS category." }, { status: 400 });
  }

  const alert: VibePlace = {
    id: `alert-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    title,
    category: category as Category,
    lat,
    lng,
    address: "Community-submitted location",
    details: typeof details === "string" ? details.trim() : "",
    source: "Community alert",
    ...((eventTag || Array.isArray(tags))
      ? {
        tags: [...new Set([
          ...(typeof eventTag === "string" ? [eventTag.trim()] : []),
          ...(Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()) : []),
        ])],
      }
      : {}),
  };
  try {
    await saveAlert(alert);
  } catch (error) {
    console.error("Community alert could not be persisted.", error);
    return NextResponse.json({ error: "The alert could not be saved. Try again shortly." }, { status: 500 });
  }
  return NextResponse.json({ item: alert }, { status: 201 });
}
