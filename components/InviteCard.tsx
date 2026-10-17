"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { CalendarPlus, Check, Clock3, MapPin, Navigation, Users, X } from "lucide-react";
import { INVITE_VIBES, formatInviteTime, type Invite } from "@/lib/invite-vibes";

type InviteResponse = "accept" | "decline";

const RESPONSES_KEY = "find-tony-invite-responses-v1";
const PROFILE_KEY = "find-tony-profile-v1";
const SWIPE_DISTANCE = 120;
const SWIPE_VELOCITY = 600;
const PAST_GRACE_MS = 3 * 60 * 60 * 1000;

function readStoredResponses(): Record<string, InviteResponse> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RESPONSES_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, InviteResponse> : {};
  } catch {
    return {};
  }
}

function calendarFile(invite: Invite) {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(invite.startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const escape = (value: string) => value.replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\n/g, "\\n");
  const vibe = INVITE_VIBES[invite.vibe];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Find Tony//Invite//EN",
    "BEGIN:VEVENT",
    `UID:${invite.id}@find-tony`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`${vibe.label} at ${invite.place.title}`)}`,
    `LOCATION:${escape(invite.place.address || invite.place.title)}`,
    `DESCRIPTION:${escape(invite.message || vibe.tagline)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export default function InviteCard({ invite: initialInvite }: { invite: Invite }) {
  const [invite, setInvite] = useState(initialInvite);
  const [response, setResponse] = useState<InviteResponse>();
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [isPast] = useState(() => Date.parse(initialInvite.startsAt) < Date.now() - PAST_GRACE_MS);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const goingOpacity = useTransform(x, [30, SWIPE_DISTANCE], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_DISTANCE, -30], [1, 0]);

  const vibe = INVITE_VIBES[invite.vibe];
  const when = formatInviteTime(invite.startsAt);

  useEffect(() => {
    // Restore an earlier answer and the visitor's Find Tony alias, if this browser has them.
    const stored = readStoredResponses()[invite.id];
    if (stored) setResponse(stored);
    try {
      const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}") as { alias?: unknown };
      if (typeof profile.alias === "string") setName(profile.alias);
    } catch {
      // A missing or malformed profile just means no default name.
    }
  }, [invite.id]);

  async function decide(choice: InviteResponse) {
    if (sending || response || isPast) return;
    setSending(true);
    setError("");
    await animate(x, choice === "accept" ? 640 : -640, { duration: 0.28, ease: "easeIn" });
    try {
      const result = await fetch(`/api/invites/${invite.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: choice, name }),
      });
      const body = await result.json() as { item?: Invite; error?: string };
      if (!result.ok || !body.item) throw new Error(body.error ?? "Your response could not be saved.");
      setInvite(body.item);
      setResponse(choice);
      try {
        localStorage.setItem(RESPONSES_KEY, JSON.stringify({ ...readStoredResponses(), [invite.id]: choice }));
      } catch {
        console.warn("Could not remember this invite response locally.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your response could not be saved.");
      void animate(x, 0, { type: "spring", stiffness: 320, damping: 26 });
    } finally {
      setSending(false);
    }
  }

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) void decide("accept");
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) void decide("decline");
    else void animate(x, 0, { type: "spring", stiffness: 320, damping: 26 });
  }

  function downloadCalendar() {
    const url = URL.createObjectURL(new Blob([calendarFile(invite)], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `find-tony-${invite.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${invite.place.lat},${invite.place.lng}`;
  const openInAppUrl = `/?category=${invite.place.category}&placeId=${encodeURIComponent(invite.place.id)}`;
  const goingLabel = invite.going.length === 0
    ? "Be the first to say yes"
    : `${invite.going.slice(-3).join(", ")}${invite.going.length > 3 ? ` +${invite.going.length - 3}` : ""} going`;

  if (response) {
    return (
      <section className={`invite-result invite-result--${response}`} style={{ "--vibe-color": vibe.color } as React.CSSProperties}>
        <p className="eyebrow">FIND TONY // INVITE</p>
        <h1>{response === "accept" ? "YOU'RE IN!" : "MAYBE NEXT TIME"}</h1>
        <p className="invite-result__summary">
          {vibe.label} at <strong>{invite.place.title}</strong>, {when.day} · {when.time}
        </p>
        {response === "accept" ? (
          <>
            <p className="invite-result__going"><Users size={15} aria-hidden="true" /> {goingLabel}</p>
            <div className="invite-result__actions">
              <button className="button button-primary" onClick={downloadCalendar}><CalendarPlus size={15} aria-hidden="true" /> ADD TO CALENDAR</button>
              <a className="button button-info" href={directionsUrl} target="_blank" rel="noopener noreferrer"><Navigation size={15} aria-hidden="true" /> DIRECTIONS</a>
              <Link className="button" href={openInAppUrl}><MapPin size={15} aria-hidden="true" /> OPEN IN FIND TONY</Link>
            </div>
          </>
        ) : (
          <div className="invite-result__actions">
            <Link className="button button-primary" href="/">FIND YOUR OWN SPOT →</Link>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="invite-stack">
      <p className="invite-stack__hint">
        {isPast ? "THIS ONE ALREADY HAPPENED" : sending ? "SAVING YOUR ANSWER..." : "SWIPE RIGHT IF YOU'RE IN · LEFT IF YOU CAN'T"}
      </p>
      <motion.article
        className="invite-card"
        style={{ x, rotate, "--vibe-color": vibe.color, "--vibe-accent": vibe.accent } as unknown as React.CSSProperties}
        drag={isPast || sending ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={handleDragEnd}
        tabIndex={0}
        aria-label={`Invite: ${vibe.label} at ${invite.place.title}. Use the right arrow key to accept or the left arrow key to decline.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") void decide("accept");
          if (event.key === "ArrowLeft") void decide("decline");
        }}
        initial={{ scale: 0.92, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <motion.span className="invite-card__stamp invite-card__stamp--going" style={{ opacity: goingOpacity }}>GOING</motion.span>
        <motion.span className="invite-card__stamp invite-card__stamp--nope" style={{ opacity: nopeOpacity }}>NOPE</motion.span>
        <header className="invite-card__banner">
          <span className="invite-card__badge">YOU&apos;RE INVITED</span>
          <p className="eyebrow">{invite.hostName ? `${invite.hostName.toUpperCase()} SAYS` : "A FRIEND SAYS"}</p>
          <h1>{vibe.label}</h1>
          <p className="invite-card__message">{invite.message ? `“${invite.message}”` : vibe.tagline}</p>
        </header>
        <dl className="invite-card__details">
          <div><dt><Clock3 size={15} aria-hidden="true" /> WHEN</dt><dd>{when.day} · {when.time}</dd></div>
          <div><dt><MapPin size={15} aria-hidden="true" /> WHERE</dt><dd><strong>{invite.place.title}</strong>{invite.place.address && invite.place.address !== "Address not listed" ? <span>{invite.place.address}</span> : null}</dd></div>
          <div><dt><Users size={15} aria-hidden="true" /> WHO</dt><dd>{goingLabel}</dd></div>
        </dl>
        <a className="invite-card__map-link" href={directionsUrl} target="_blank" rel="noopener noreferrer" onPointerDownCapture={(event) => event.stopPropagation()}>
          <Navigation size={13} aria-hidden="true" /> VIEW ON MAP
        </a>
      </motion.article>
      {!isPast && (
        <>
          <label className="invite-stack__name">
            <span>GOING AS</span>
            <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="Your name (optional)" />
          </label>
          <div className="invite-stack__buttons">
            <button className="invite-swipe-button invite-swipe-button--nope" onClick={() => void decide("decline")} disabled={sending} aria-label="Decline invite"><X size={28} /></button>
            <button className="invite-swipe-button invite-swipe-button--going" onClick={() => void decide("accept")} disabled={sending} aria-label="Accept invite"><Check size={28} /></button>
          </div>
        </>
      )}
      {isPast && <Link className="button button-primary" href="/">FIND SOMETHING ON NOW →</Link>}
      {error && <p className="form-error invite-stack__error" role="alert">{error}</p>}
    </div>
  );
}
