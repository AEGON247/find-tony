import { rsvpOpenInvite } from "@/lib/social";
import { requireSocialId, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only a "yes" reaches the server. Saying no just hides the pin on that
// device, so hosts never learn who passed.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return socialResponse(async () => ({
    item: await rsvpOpenInvite(requireCredentials(request), requireSocialId(id, "Invite"), true),
  }));
}

/** Withdraw an earlier yes. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return socialResponse(async () => ({
    item: await rsvpOpenInvite(requireCredentials(request), requireSocialId(id, "Invite"), false),
  }));
}
