import { reportUser } from "@/lib/social";
import { readJsonBody, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Saves a report about a person for team review in DATA_DIR/social.json. */
export async function POST(request: Request) {
  return socialResponse(async () => reportUser(requireCredentials(request), await readJsonBody(request)), 201);
}
