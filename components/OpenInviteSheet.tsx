"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock3, Flag, MapPin, MessageCircle, Navigation, UserRound, Users, X } from "lucide-react";
import { useSocial } from "@/context/SocialContext";
import { useVibe } from "@/context/VibeContext";
import { distanceInMeters } from "@/lib/geo";
import { INVITE_VIBES } from "@/lib/invite-vibes";
import type { OpenInviteView } from "@/lib/social-types";

function timeLeft(expiresAt: string, now: number) {
  const minutes = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 60_000));
  if (minutes < 1) return "ENDING NOW";
  if (minutes < 60) return `${minutes} MIN LEFT`;
  const hours = Math.floor(minutes / 60);
  return `${hours}H ${String(minutes % 60).padStart(2, "0")}M LEFT`;
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} M AWAY` : `${(meters / 1000).toFixed(1)} KM AWAY`;
}

export default function OpenInviteSheet({
  invite,
  onClose,
}: {
  invite: OpenInviteView;
  onClose: () => void;
}) {
  const { coordinates } = useVibe();
  const { requireProfile, rsvp, leaveInvite, endInvite, hideInvite, openChat, blockUser, reportUser } = useSocial();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [reporting, setReporting] = useState(false);
  const vibe = INVITE_VIBES[invite.vibe];
  const spotsLeft = invite.spots > 0 ? Math.max(0, invite.spots - invite.goingCount) : undefined;
  const isFull = spotsLeft === 0 && !invite.amGoing && !invite.isMine;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function sayYes() {
    requireProfile(() => {
      void run(async () => {
        const updated = await rsvp(invite.id);
        if (updated.chatId) openChat(updated.chatId);
      });
    });
  }

  function notForMe() {
    hideInvite(invite.id);
    onClose();
  }

  function report(reason: string) {
    requireProfile(() => {
      void run(async () => {
        await reportUser(invite.hostId, reason);
        await blockUser(invite.hostId);
        hideInvite(invite.id);
        onClose();
      });
    });
  }

  const directionsUrl = `https://www.google.com/maps/dir/?api=1${coordinates ? `&origin=${coordinates[0]},${coordinates[1]}` : ""}&destination=${invite.place.lat},${invite.place.lng}&travelmode=walking`;
  const goingSummary = invite.goingCount === 0
    ? "NO ONE YET. BE THE FIRST"
    : `${invite.goingCount} GOING${spotsLeft !== undefined ? ` · ${spotsLeft} SPOT${spotsLeft === 1 ? "" : "S"} LEFT` : ""}`;

  return (
    <motion.section
      className="open-invite-sheet"
      style={{ "--vibe-color": vibe.color, "--vibe-accent": vibe.accent } as React.CSSProperties}
      role="dialog"
      aria-labelledby="open-invite-sheet-title"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <button className="open-invite-sheet__close" onClick={onClose} aria-label="Close invite"><X size={16} /></button>
      <header className="open-invite-sheet__banner">
        <span className="open-invite-sheet__live"><span aria-hidden="true" /> OPEN INVITE · {timeLeft(invite.expiresAt, now)}</span>
        <p className="eyebrow">{invite.isMine ? "YOUR BROADCAST" : `${invite.hostAlias.toUpperCase()} SAYS`}</p>
        <h2 id="open-invite-sheet-title">{vibe.label}</h2>
        <p className="open-invite-sheet__message">{invite.message ? `“${invite.message}”` : vibe.tagline}</p>
      </header>
      <dl className="open-invite-sheet__details">
        {!invite.isMine && (
          <div>
            <dt><UserRound size={14} aria-hidden="true" /> HOST</dt>
            <dd>
              <strong>{invite.hostAlias}</strong>
              {invite.hostBio && <span>“{invite.hostBio}”</span>}
              {invite.hostVibes.length > 0 && (
                <span className="open-invite-sheet__host-vibes">
                  {invite.hostVibes.map((hostVibe) => (
                    <span key={hostVibe} className="social-vibe-chip" style={{ "--vibe-color": INVITE_VIBES[hostVibe].color } as React.CSSProperties}>
                      {INVITE_VIBES[hostVibe].label}
                    </span>
                  ))}
                </span>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt><MapPin size={14} aria-hidden="true" /> WHERE</dt>
          <dd>
            <strong>{invite.place.title}</strong>
            {coordinates && <span>{formatDistance(distanceInMeters(coordinates[0], coordinates[1], invite.place.lat, invite.place.lng))}</span>}
          </dd>
        </div>
        <div>
          <dt><Users size={14} aria-hidden="true" /> WHO</dt>
          <dd>
            <strong>{goingSummary}</strong>
            {invite.going && invite.going.length > 0 && <span>{invite.going.map((person) => person.alias).join(", ")}</span>}
          </dd>
        </div>
      </dl>

      {invite.isMine ? (
        <div className="open-invite-sheet__actions">
          <button className="button button-primary" disabled={busy || !invite.chatId} onClick={() => invite.chatId && openChat(invite.chatId)}>
            <MessageCircle size={15} aria-hidden="true" /> GROUP CHAT
          </button>
          {confirmEnd ? (
            <button className="button open-invite-sheet__end" disabled={busy} onClick={() => void run(async () => { await endInvite(invite.id); onClose(); })}>
              YES, END IT
            </button>
          ) : (
            <button className="button" disabled={busy} onClick={() => setConfirmEnd(true)}>END INVITE</button>
          )}
        </div>
      ) : invite.amGoing ? (
        <>
          <p className="open-invite-sheet__status"><Check size={15} aria-hidden="true" /> YOU&apos;RE IN. {invite.hostAlias.toUpperCase()} HAS BEEN NOTIFIED.</p>
          <div className="open-invite-sheet__actions">
            <button className="button button-primary" disabled={busy || !invite.chatId} onClick={() => invite.chatId && openChat(invite.chatId)}>
              <MessageCircle size={15} aria-hidden="true" /> GROUP CHAT
            </button>
            <a className="button button-info" href={directionsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation size={15} aria-hidden="true" /> DIRECTIONS
            </a>
            <button className="button" disabled={busy} onClick={() => void run(() => leaveInvite(invite.id))}>CAN&apos;T MAKE IT</button>
          </div>
        </>
      ) : (
        <div className="open-invite-sheet__actions open-invite-sheet__actions--rsvp">
          <button className="open-invite-sheet__no" disabled={busy} onClick={notForMe}>
            <X size={18} aria-hidden="true" /> NOT FOR ME
          </button>
          <button className="open-invite-sheet__yes" disabled={busy || isFull} onClick={sayYes}>
            <Check size={18} aria-hidden="true" /> {isFull ? "FULL" : busy ? "SENDING..." : "I'M IN"}
          </button>
        </div>
      )}

      {!invite.isMine && !invite.amGoing && (
        <p className="open-invite-sheet__fineprint">
          <Clock3 size={12} aria-hidden="true" /> Saying no is private: {invite.hostAlias} only hears about yeses.
        </p>
      )}
      {!invite.isMine && (
        <div className="open-invite-sheet__safety">
          {reporting ? (
            <>
              <span>REPORT &amp; BLOCK FOR</span>
              {["harassment", "spam", "unsafe"].map((reason) => (
                <button key={reason} disabled={busy} onClick={() => report(reason)}>{reason.toUpperCase()}</button>
              ))}
              <button onClick={() => setReporting(false)}>CANCEL</button>
            </>
          ) : (
            <button onClick={() => setReporting(true)}><Flag size={12} aria-hidden="true" /> REPORT THIS INVITE</button>
          )}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </motion.section>
  );
}
