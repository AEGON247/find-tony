import { openDirectChat } from "@/lib/social";
import { readJsonBody, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";
import { DEVICE_ID_PATTERN } from "@/lib/social-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens (or reuses) a 1:1 chat with someone you matched with or share an invite with. */
export async function POST(request: Request) {
  return socialResponse(async () => {
    const body = await readJsonBody(request);
    const userId = typeof body.userId === "string" && DEVICE_ID_PATTERN.test(body.userId) ? body.userId : "";
    return openDirectChat(requireCredentials(request), userId);
  });
}
