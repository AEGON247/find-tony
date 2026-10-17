import { NextRequest, NextResponse } from "next/server";
import { respondToInvite } from "@/lib/invites";
import { INVITE_ID_PATTERN } from "@/lib/invite-vibes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!INVITE_ID_PATTERN.test(id)) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const response = body?.response;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (response !== "accept" && response !== "decline") {
    return NextResponse.json({ error: "Response must be accept or decline." }, { status: 400 });
  }
  if (name.length > 40) {
    return NextResponse.json({ error: "Name must be 40 characters or fewer." }, { status: 400 });
  }
  try {
    const invite = await respondToInvite(id, response, name);
    if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    return NextResponse.json({ item: invite });
  } catch (error) {
    console.error("Invite response could not be saved.", error);
    return NextResponse.json({ error: "Your response could not be saved. Try again shortly." }, { status: 500 });
  }
}
