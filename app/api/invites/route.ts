import { NextRequest, NextResponse } from "next/server";
import { isSydneyCoordinate } from "@/lib/geo";
import { createInviteId, saveInvite } from "@/lib/invites";
import { INVITE_VIBE_IDS, type Invite, type InviteVibeId } from "@/lib/invite-vibes";
import { CATEGORIES, type Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DAYS_AHEAD = 90;

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON invite body is required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const place = input.place as Record<string, unknown> | undefined;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const hostName = typeof input.hostName === "string" ? input.hostName.trim() : "";
  const startsAt = typeof input.startsAt === "string" ? Date.parse(input.startsAt) : NaN;

  if (
    !place ||
    typeof place.id !== "string" || place.id.length > 200 ||
    typeof place.title !== "string" || !place.title.trim() || place.title.length > 120 ||
    typeof place.lat !== "number" || typeof place.lng !== "number" ||
    !isSydneyCoordinate(place.lat, place.lng) ||
    typeof place.category !== "string" || !CATEGORIES.includes(place.category as Category)
  ) {
    return NextResponse.json({ error: "Pick a Sydney place from the map." }, { status: 400 });
  }
  if (typeof input.vibe !== "string" || !INVITE_VIBE_IDS.includes(input.vibe as InviteVibeId)) {
    return NextResponse.json({ error: "Choose a vibe for the invite." }, { status: 400 });
  }
  if (!Number.isFinite(startsAt) || startsAt < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ error: "Pick a time in the future." }, { status: 400 });
  }
  if (startsAt > Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: `Invites can be up to ${MAX_DAYS_AHEAD} days ahead.` }, { status: 400 });
  }
  if (message.length > 200) {
    return NextResponse.json({ error: "Message must be 200 characters or fewer." }, { status: 400 });
  }
  if (hostName.length > 40) {
    return NextResponse.json({ error: "Name must be 40 characters or fewer." }, { status: 400 });
  }

  const invite: Invite = {
    id: createInviteId(),
    place: {
      id: place.id,
      title: place.title.trim(),
      address: typeof place.address === "string" ? place.address.slice(0, 200) : "",
      lat: place.lat,
      lng: place.lng,
      category: place.category as Category,
    },
    startsAt: new Date(startsAt).toISOString(),
    message,
    vibe: input.vibe as InviteVibeId,
    hostName,
    createdAt: new Date().toISOString(),
    going: [],
    declinedCount: 0,
  };
  try {
    await saveInvite(invite);
  } catch (error) {
    console.error("Invite could not be persisted.", error);
    return NextResponse.json({ error: "The invite could not be saved. Try again shortly." }, { status: 500 });
  }
  return NextResponse.json({ item: invite }, { status: 201 });
}
