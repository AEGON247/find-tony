"use client";

import { useCallback, useEffect, useState } from "react";
import { animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Check, MapPin, MessageCircle, RefreshCw, Sparkles, X } from "lucide-react";
import { useSocial } from "@/context/SocialContext";
import { useVibe } from "@/context/VibeContext";
import { socialFetch } from "@/lib/social-client";
import { INVITE_VIBES } from "@/lib/invite-vibes";
import type { MatchCandidate } from "@/lib/social-types";

const SWIPE_DISTANCE = 110;

export default function MeetPanel() {
  const { coordinates, placesCoordinates, profile: vibeProfile } = useVibe();
  const { profile, editProfile, openChat, refresh, notify } = useSocial();
  const center = placesCoordinates ?? coordinates;
  const [candidates, setCandidates] = useState<MatchCandidate[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<{ alias: string; chatId: string }>();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-12, 12]);
  const connectOpacity = useTransform(x, [30, SWIPE_DISTANCE], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_DISTANCE, -30], [1, 0]);

  const load = useCallback(async () => {
    if (!center) return;
    setError("");
    setCandidates(undefined);
    try {
      const result = await socialFetch<{ items: MatchCandidate[] }>(
        `/api/social/matches?lat=${center[0]}&lng=${center[1]}&radius=${vibeProfile.radiusKm}`,
      );
      setCandidates(result.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load people nearby.");
      setCandidates([]);
    }
  }, [center, vibeProfile.radiusKm]);

  useEffect(() => {
    void load();
  }, [load, profile?.discoverable]);

  const current = candidates?.[0];

  async function decide(action: "connect" | "pass") {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    if (action === "connect") {
      setCandidates((items) => items?.filter((item) => item.id !== current.id));
      notify(`Connection request sent to ${current.alias}.`);
    }
    await animate(x, action === "connect" ? 560 : -560, { duration: 0.25, ease: "easeIn" });
    try {
      const result = await socialFetch<{ matched: boolean; chatId?: string }>("/api/social/matches", {
        method: "POST",
        json: { userId: current.id, action },
      });
      if (result.matched && result.chatId) {
        setMatch({ alias: current.alias, chatId: result.chatId });
        refresh();
      }
      if (action === "pass") setCandidates((items) => items?.slice(1));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That didn't go through.");
      if (action === "connect") {
        setCandidates((items) => [current, ...(items ?? []).filter((item) => item.id !== current.id)]);
        notify(`Could not connect with ${current.alias}. The profile was restored.`);
      }
    } finally {
      x.set(0);
      setBusy(false);
    }
  }

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.x > SWIPE_DISTANCE) void decide("connect");
    else if (info.offset.x < -SWIPE_DISTANCE) void decide("pass");
    else void animate(x, 0, { type: "spring", stiffness: 320, damping: 26 });
  }

  if (match) {
    return (
      <div className="meet-match" role="status">
        <Sparkles size={34} aria-hidden="true" />
        <p className="eyebrow">MUTUAL CONNECT</p>
        <h3>IT&apos;S A VIBE!</h3>
        <p>You and <strong>{match.alias}</strong> both connected. Your chat is open.</p>
        <div className="meet-match__actions">
          <button className="button button-primary" onClick={() => openChat(match.chatId)}>
            <MessageCircle size={15} aria-hidden="true" /> SAY HI
          </button>
          <button className="button" onClick={() => setMatch(undefined)}>KEEP BROWSING</button>
        </div>
      </div>
    );
  }

  if (!center) {
    return <p className="meet-empty">Turn on location to meet people nearby.</p>;
  }

  if (profile && !profile.discoverable) {
    return (
      <div className="meet-empty">
        <h3>YOU&apos;RE HIDDEN</h3>
        <p>Meet works both ways: turn on <strong>Show me in Meet</strong> to see people nearby who share your vibes.</p>
        <button className="button button-primary" onClick={editProfile}>EDIT SOCIAL PROFILE</button>
      </div>
    );
  }

  return (
    <div className="meet-panel">
      <p className="meet-panel__intro">
        People within {vibeProfile.radiusKm} km who share at least one of your vibes. A chat opens only when you both tap connect.
      </p>
      {candidates === undefined && <p className="meet-empty">SCANNING FOR YOUR PEOPLE...</p>}
      {candidates && !current && (
        <div className="meet-empty">
          <h3>NO NEW MATCHES NEARBY</h3>
          <p>Try again later, add more vibes to your profile, or widen your radius in your vibe profile.</p>
          <button className="button" onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" /> SCAN AGAIN</button>
        </div>
      )}
      {current && (
        <>
          <motion.article
            key={current.id}
            className="meet-card"
            style={{ x, rotate, "--vibe-color": INVITE_VIBES[current.sharedVibes[0]].color } as unknown as React.CSSProperties}
            drag={busy ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={handleDragEnd}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            tabIndex={0}
            aria-label={`${current.alias}. Press the right arrow key to connect or the left arrow key to pass.`}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") void decide("connect");
              if (event.key === "ArrowLeft") void decide("pass");
            }}
          >
            <motion.span className="invite-card__stamp invite-card__stamp--going" style={{ opacity: connectOpacity }}>VIBE</motion.span>
            <motion.span className="invite-card__stamp invite-card__stamp--nope" style={{ opacity: passOpacity }}>PASS</motion.span>
            <header className="meet-card__banner">
              <span className="meet-card__avatar" aria-hidden="true">{current.alias.slice(0, 1).toUpperCase()}</span>
              <div>
                <h3>{current.alias}</h3>
                <span><MapPin size={12} aria-hidden="true" /> ~{current.distanceKm} KM AWAY</span>
              </div>
            </header>
            {current.bio && <p className="meet-card__bio">“{current.bio}”</p>}
            <div className="meet-card__vibes">
              <span className="meet-card__label">SHARED VIBES</span>
              <div>
                {current.sharedVibes.map((vibe) => (
                  <span key={vibe} className="social-vibe-chip is-active" style={{ "--vibe-color": INVITE_VIBES[vibe].color } as React.CSSProperties}>
                    {INVITE_VIBES[vibe].label}
                  </span>
                ))}
              </div>
              {current.vibes.length > current.sharedVibes.length && (
                <>
                  <span className="meet-card__label">ALSO INTO</span>
                  <div>
                    {current.vibes.filter((vibe) => !current.sharedVibes.includes(vibe)).map((vibe) => (
                      <span key={vibe} className="social-vibe-chip">{INVITE_VIBES[vibe].label}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.article>
          <div className="invite-stack__buttons">
            <button className="invite-swipe-button invite-swipe-button--nope" onClick={() => void decide("pass")} disabled={busy} aria-label={`Pass on ${current.alias}`}><X size={26} /></button>
            <button className="invite-swipe-button invite-swipe-button--going" onClick={() => void decide("connect")} disabled={busy} aria-label={`Connect with ${current.alias}`}><Check size={26} /></button>
          </div>
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
