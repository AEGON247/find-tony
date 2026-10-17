import { markNotificationsRead } from "@/lib/social";
import { readJsonBody, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return socialResponse(async () => {
    const body = await readJsonBody(request);
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 100)
      : "all";
    return markNotificationsRead(requireCredentials(request), ids);
  });
}
