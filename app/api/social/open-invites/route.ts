import type { NextRequest } from "next/server";
import { createOpenInvite, listOpenInvites } from "@/lib/social";
import { coordinatesFrom, radiusFrom, readJsonBody, socialResponse } from "@/lib/social-http";
import { credentialsFrom, requireCredentials } from "@/lib/social-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return socialResponse(async () => ({
    items: await listOpenInvites(credentialsFrom(request), coordinatesFrom(searchParams, true), radiusFrom(searchParams)),
  }));
}

export async function POST(request: Request) {
  return socialResponse(async () => ({
    item: await createOpenInvite(requireCredentials(request), await readJsonBody(request)),
  }), 201);
}
