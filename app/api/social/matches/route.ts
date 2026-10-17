import type { NextRequest } from "next/server";
import { listMatches, respondToMatch } from "@/lib/social";
import { coordinatesFrom, radiusFrom, readJsonBody, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";
import { DEVICE_ID_PATTERN } from "@/lib/social-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return socialResponse(async () => ({
    items: await listMatches(requireCredentials(request), coordinatesFrom(searchParams, true), radiusFrom(searchParams)),
  }));
}

/** Connect or pass on someone. A chat opens only when both people connect. */
export async function POST(request: Request) {
  return socialResponse(async () => {
    const body = await readJsonBody(request);
    const userId = typeof body.userId === "string" && DEVICE_ID_PATTERN.test(body.userId) ? body.userId : "";
    const action = body.action === "connect" ? "connect" : "pass";
    return respondToMatch(requireCredentials(request), userId, action);
  });
}
