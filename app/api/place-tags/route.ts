import { NextRequest, NextResponse } from "next/server";
import { addPlaceTag } from "@/lib/place-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON tag body is required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const placeId = typeof input.placeId === "string" ? input.placeId.trim() : "";
  const tag = typeof input.tag === "string" ? input.tag.trim().replace(/\s+/g, " ") : "";
  if (!/^(alert|luma|osm|nominatim|foursquare|eventbrite)-[a-zA-Z0-9._:-]{1,180}$/.test(placeId)) {
    return NextResponse.json({ error: "A valid place ID is required." }, { status: 400 });
  }
  if (tag.length < 2 || tag.length > 32 || /[<>]/.test(tag)) {
    return NextResponse.json({ error: "Tags must be 2 to 32 plain-text characters." }, { status: 400 });
  }

  try {
    const tags = await addPlaceTag(placeId, tag);
    return NextResponse.json({ placeId, tags }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("at most 12")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Community place tag could not be persisted.", error);
    return NextResponse.json({ error: "The tag could not be saved. Try again shortly." }, { status: 500 });
  }
}
