import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import InviteCard from "@/components/InviteCard";
import { getInvite } from "@/lib/invites";
import { INVITE_VIBES, formatInviteTime } from "@/lib/invite-vibes";

export const dynamic = "force-dynamic";

async function siteOrigin() {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return new URL(configured);
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return new URL(`${protocol}://${host}`);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const invite = await getInvite((await params).id);
  const metadataBase = await siteOrigin();
  if (!invite) return { metadataBase, title: "Invite not found // Find Tony" };
  const vibe = INVITE_VIBES[invite.vibe];
  const when = formatInviteTime(invite.startsAt);
  const title = `${invite.hostName || "A friend"} invited you: ${vibe.label} at ${invite.place.title}`;
  const description = `${when.day}, ${when.time}${invite.message ? ` · “${invite.message}”` : ` · ${vibe.tagline}`}`;
  return {
    metadataBase,
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "Find Tony" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const invite = await getInvite((await params).id);
  if (!invite) {
    return (
      <main className="invite-page">
        <section className="invite-missing">
          <p className="eyebrow">FIND TONY // INVITE</p>
          <h1>INVITE NOT FOUND</h1>
          <p>This link may be mistyped or the invite was removed.</p>
          <Link className="button button-primary" href="/">OPEN FIND TONY →</Link>
        </section>
      </main>
    );
  }
  return (
    <main className="invite-page">
      <InviteCard invite={invite} />
    </main>
  );
}
