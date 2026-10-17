import type { NextRequest } from "next/server";
import { getChat, sendChatMessage } from "@/lib/social";
import { readJsonBody, requireSocialId, socialResponse } from "@/lib/social-http";
import { requireCredentials } from "@/lib/social-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return socialResponse(() => getChat(
    requireCredentials(request),
    requireSocialId(id, "Chat"),
    request.nextUrl.searchParams.get("after") ?? undefined,
  ));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return socialResponse(async () => {
    const body = await readJsonBody(request);
    return {
      item: await sendChatMessage(
        requireCredentials(request),
        requireSocialId(id, "Chat"),
        typeof body.text === "string" ? body.text : "",
      ),
    };
  }, 201);
}
