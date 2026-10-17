import { NextRequest, NextResponse } from "next/server";
import { addPlaceTag, removePlaceTag } from "@/lib/place-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readTagInput(body: unknown) {
  if (!body || typeof body !== "object") {
    return { error: "A JSON tag body is required." };
  }
  const input = body as Record<string, unknown>;
  const placeId = typeof input.placeId === "string" ? input.placeId.trim() : "";
  const tag = typeof input.tag === "string" ? input.tag.trim().replace(/\s+/g, " ") : "";
  if (!/^(alert|luma|osm|nominatim|foursquare|eventbrite)-[a-zA-Z0-9._:-]{1,180}$/.test(placeId)) {
    return { error: "A valid place ID is required." };
  }
  if (tag.length < 2 || tag.length > 32 || /[<>]/.test(tag)) {
    return { error: "Tags must be 2 to 32 plain-text characters." };
  }
  return { placeId, tag };
}

async function updateTag(request: NextRequest, operation: typeof addPlaceTag | typeof removePlaceTag) {
  const body: unknown = await request.json().catch(() => null);
  const input = readTagInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  try {
    const tags = await operation(input.placeId, input.tag);
    return NextResponse.json({ placeId: input.placeId, tags }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("at most 12")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Community place tag could not be persisted.", error);
    return NextResponse.json({ error: "The tag could not be saved. Try again shortly." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return updateTag(request, addPlaceTag);
}

export async function DELETE(request: NextRequest) {
  return updateTag(request, removePlaceTag);
}
