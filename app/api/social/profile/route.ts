import { saveSocialProfile } from "@/lib/social";
import { readJsonBody, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return socialResponse(async () => ({
    profile: await saveSocialProfile(requireCredentials(request), await readJsonBody(request)),
  }));
}
