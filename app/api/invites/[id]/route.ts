import { NextResponse } from "next/server";
import { getInvite } from "@/lib/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const invite = await getInvite((await params).id);
  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  return NextResponse.json({ item: invite });
}
