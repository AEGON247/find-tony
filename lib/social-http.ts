import "server-only";
import { NextResponse } from "next/server";
import { isSydneyCoordinate } from "@/lib/geo";
import { SOCIAL_ID_PATTERN } from "@/lib/social-types";
import { SocialError } from "@/lib/social-store";

export async function socialResponse(handler: () => Promise<unknown>, status = 200) {
  try {
    return NextResponse.json(await handler(), { status });
  } catch (error) {
    if (error instanceof SocialError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Social request failed.", error);
    return NextResponse.json({ error: "Something went wrong. Try again shortly." }, { status: 500 });
  }
}

export async function readJsonBody(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw new SocialError(400, "A JSON body is required.");
  return body as Record<string, unknown>;
}

export function requireSocialId(id: string, label = "Item") {
  if (!SOCIAL_ID_PATTERN.test(id)) throw new SocialError(404, `${label} not found.`);
  return id;
}

export function coordinatesFrom(searchParams: URLSearchParams, required: true): { lat: number; lng: number };
export function coordinatesFrom(searchParams: URLSearchParams, required?: false): { lat: number; lng: number } | undefined;
export function coordinatesFrom(searchParams: URLSearchParams, required = false) {
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (searchParams.has("lat") && searchParams.has("lng") && isSydneyCoordinate(lat, lng)) return { lat, lng };
  if (required) throw new SocialError(400, "A Sydney location is required.");
  return undefined;
}

export function radiusFrom(searchParams: URLSearchParams) {
  const radius = Number(searchParams.get("radius"));
  return Number.isFinite(radius) ? Math.min(Math.max(radius, 1), 10) : 3;
}
