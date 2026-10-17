import { endOpenInvite } from "@/lib/social";
import { requireSocialId, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The host ends their invite early; it leaves the map and the group chat winds down. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return socialResponse(async () => ({
    item: await endOpenInvite(requireCredentials(request), requireSocialId(id, "Invite")),
  }));
}
