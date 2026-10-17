import { ImageResponse } from "next/og";
import { getInvite } from "@/lib/invites";
import { INVITE_VIBES, formatInviteTime } from "@/lib/invite-vibes";

export const runtime = "nodejs";
export const alt = "Find Tony invite";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ImageFont = { name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" };
let fontsRequest: Promise<ImageFont[]> | null = null;

async function loadGoogleFont(family: string, weight: 400 | 800): Promise<ImageFont> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`, {
    signal: AbortSignal.timeout(3_000),
  }).then((response) => response.text());
  const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error(`No TTF source for ${family}.`);
  const data = await fetch(url, { signal: AbortSignal.timeout(3_000) }).then((response) => response.arrayBuffer());
  return { name: family, data, weight, style: "normal" };
}

// The image renderer only bundles a regular-weight font, so the app's display and
// heavy body fonts are fetched once per server process. Previews still render
// with the default font if Google Fonts is unreachable.
function loadFonts() {
  fontsRequest ??= Promise.all([loadGoogleFont("Bangers", 400), loadGoogleFont("Inter", 800)])
    .catch((error: unknown) => {
      console.warn("Invite preview fonts unavailable; using the default font.", error instanceof Error ? error.message : error);
      fontsRequest = null;
      return [];
    });
  return fontsRequest;
}

export default async function InviteImage({ params }: { params: Promise<{ id: string }> }) {
  const [invite, fonts] = await Promise.all([getInvite((await params).id), loadFonts()]);
  const display = fonts.length > 0 ? "Bangers" : "sans-serif";
  const vibe = invite ? INVITE_VIBES[invite.vibe] : undefined;
  const when = invite ? formatInviteTime(invite.startsAt) : undefined;
  const color = vibe?.color ?? "#8b5cf6";
  const accent = vibe?.accent ?? "#facc15";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 44,
          background: color,
          backgroundImage: "radial-gradient(rgba(10,10,12,0.22) 2px, transparent 2px)",
          backgroundSize: "22px 22px",
          fontFamily: fonts.length > 0 ? "Inter" : "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "40px 48px",
            background: "#fff",
            border: "6px solid #0a0a0c",
            boxShadow: "16px 16px 0 #0a0a0c",
            color: "#0a0a0c",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: display, fontSize: 40, letterSpacing: 1 }}>
              <div style={{ display: "flex", width: 54, height: 54, alignItems: "center", justifyContent: "center", background: "#facc15", border: "4px solid #0a0a0c", fontSize: 38 }}>T</div>
              FIND TONY
            </div>
            <div style={{ display: "flex", padding: "8px 18px", background: accent, border: "4px solid #0a0a0c", fontSize: 26, fontWeight: 800, letterSpacing: 2 }}>
              YOU&apos;RE INVITED
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontFamily: display, fontSize: 116, lineHeight: 0.9, textTransform: "uppercase", color, textShadow: "5px 5px 0 #0a0a0c" }}>
              {vibe?.label ?? "Invite"}
            </div>
            {invite?.message ? (
              <div style={{ display: "flex", alignSelf: "flex-start", maxWidth: 980, padding: "14px 22px", background: "#f3f1f5", border: "4px solid #0a0a0c", fontSize: 34, fontWeight: 600, lineHeight: 1.2 }}>
                “{invite.message.length > 110 ? `${invite.message.slice(0, 107)}...` : invite.message}”
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color: "#4b4654" }}>{vibe?.tagline ?? "This invite has expired."}</div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", fontSize: 30, fontWeight: 800 }}>
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
              <div style={{ display: "flex", fontSize: 40 }}>{invite?.place.title ?? "Sydney"}</div>
              {invite?.hostName && <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: "#4b4654" }}>from {invite.hostName}</div>}
            </div>
            {when && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "10px 18px", background: "#0a0a0c", color: "#fff" }}>
                <div style={{ display: "flex", fontSize: 24, color: accent }}>{when.day.toUpperCase()}</div>
                <div style={{ display: "flex", fontSize: 40 }}>{when.time.toUpperCase()}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
