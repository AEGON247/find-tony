import type { NextRequest } from "next/server";
import { syncSocial } from "@/lib/social";
import { coordinatesFrom, socialResponse } from "@/lib/social-http";
import { credentialsFrom } from "@/lib/social-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return socialResponse(() => syncSocial(credentialsFrom(request), coordinatesFrom(request.nextUrl.searchParams)));
}
