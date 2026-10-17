import { blockUser } from "@/lib/social";
import { readJsonBody, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";
import { DEVICE_ID_PATTERN } from "@/lib/social-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return socialResponse(async () => {
    const body = await readJsonBody(request);
    const userId = typeof body.userId === "string" && DEVICE_ID_PATTERN.test(body.userId) ? body.userId : "";
    return blockUser(requireCredentials(request), userId);
  });
}
