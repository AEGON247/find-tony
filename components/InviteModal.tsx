"use client";

import { useState } from "react";
import { Check, Copy, Instagram, Mail, MapPin, MessageCircle, Share2, X } from "lucide-react";
import { useVibe } from "@/context/VibeContext";
import {
  INVITE_VIBE_IDS,
  INVITE_VIBES,
  defaultVibeFor,
  formatInviteTime,
  type Invite,
  type InviteVibeId,
} from "@/lib/invite-vibes";
import type { VibePlace } from "@/lib/types";

function toLocalInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStartTime() {
  const date = new Date();
  date.setHours(date.getHours() + 2, 0, 0, 0);
  return toLocalInputValue(date);
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function InviteModal({ place, onClose }: { place: VibePlace; onClose: () => void }) {
  const { profile } = useVibe();
  const [vibe, setVibe] = useState<InviteVibeId>(() => defaultVibeFor(place.category));
  const [startsAt, setStartsAt] = useState(defaultStartTime);
  const [message, setMessage] = useState("");
  const [hostName, setHostName] = useState(profile.alias);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState<Invite>();
  const [status, setStatus] = useState("");

  const orderedVibes = [
    ...INVITE_VIBE_IDS.filter((id) => INVITE_VIBES[id].category === place.category),
    ...INVITE_VIBE_IDS.filter((id) => INVITE_VIBES[id].category !== place.category),
  ];
  const inviteUrl = invite ? `${window.location.origin}/invite/${invite.id}` : "";
  const shareText = invite
    ? `${INVITE_VIBES[invite.vibe].label} at ${invite.place.title}, ${formatInviteTime(invite.startsAt).day} ${formatInviteTime(invite.startsAt).time}.${invite.message ? ` "${invite.message}"` : ""} Swipe right if you're in:`
    : "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place: {
            id: place.id,
            title: place.title,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            category: place.category,
          },
          startsAt: new Date(startsAt).toISOString(),
          message,
          vibe,
          hostName,
        }),
      });
      const result = await response.json() as { item?: Invite; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error ?? "The invite could not be created.");
      setInvite(result.item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The invite could not be created.");
    } finally {
      setSaving(false);
    }
  }

  function flash(text: string) {
    setStatus(text);
    window.setTimeout(() => setStatus((current) => (current === text ? "" : current)), 4000);
  }

  async function copyLink(followUp?: string) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copied = true;
    } catch {
      // The async clipboard API is blocked in some embedded browsers and
      // unfocused tabs; fall back to selecting the link field and copying it.
      const field = document.getElementById("invite-link") as HTMLInputElement | null;
      field?.focus();
      field?.select();
      copied = document.execCommand("copy");
    }
    flash(copied ? followUp ?? "LINK COPIED" : "COPY FAILED. SELECT THE LINK AND COPY IT.");
    return copied;
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: "Find Tony invite", text: shareText, url: inviteUrl });
      return true;
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return true;
      return false;
    }
  }

  async function shareInstagram() {
    // Instagram has no web share link, so phones use the system share sheet
    // (which lists Instagram) and desktops paste the link into a DM.
    if (isMobileDevice() && typeof navigator.share === "function" && await nativeShare()) return;
    if (await copyLink("LINK COPIED. PASTE IT INTO YOUR INSTAGRAM DM.")) {
      window.open("https://www.instagram.com/direct/inbox/", "_blank", "noopener,noreferrer");
    }
  }

  async function shareMessenger() {
    if (isMobileDevice()) {
      window.location.href = `fb-messenger://share/?link=${encodeURIComponent(inviteUrl)}`;
      return;
    }
    if (await copyLink("LINK COPIED. PASTE IT INTO MESSENGER.")) {
      window.open("https://www.messenger.com/", "_blank", "noopener,noreferrer");
    }
  }

  function shareEmail() {
    const subject = `You're invited: ${INVITE_VIBES[vibe].label} at ${place.title}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${shareText}\n\n${inviteUrl}`)}`;
  }

  const selectedVibe = INVITE_VIBES[vibe];

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-drawer invite-drawer" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <button className="drawer-close" onClick={onClose} aria-label="Close invite"><X /></button>
        <p className="eyebrow">RSVP // INVITE FRIENDS</p>
        <h2 id="invite-title">{invite ? "INVITE READY" : "ROUND UP THE CREW"}</h2>
        <div className="invite-place-chip">
          <MapPin size={15} aria-hidden="true" />
          <span><strong>{place.title}</strong>{place.address && place.address !== "Address not listed" ? ` · ${place.address}` : ""}</span>
        </div>

        {!invite ? (
          <form className="profile-form" onSubmit={submit}>
            <fieldset>
              <legend>PICK A VIBE</legend>
              <div className="invite-vibe-grid" role="radiogroup" aria-label="Invite vibe">
                {orderedVibes.map((id) => {
                  const item = INVITE_VIBES[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={vibe === id}
                      className={`invite-vibe ${vibe === id ? "is-active" : ""}`}
                      style={{ "--vibe-color": item.color } as React.CSSProperties}
                      onClick={() => setVibe(id)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.tagline}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label htmlFor="invite-time">WHEN</label>
            <input
              id="invite-time"
              type="datetime-local"
              required
              min={toLocalInputValue(new Date())}
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
            <label htmlFor="invite-message">MESSAGE <span>(OPTIONAL)</span></label>
            <textarea
              id="invite-message"
              maxLength={200}
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={selectedVibe.tagline}
            />
            <label htmlFor="invite-host">YOUR NAME <span>(SHOWN ON THE INVITE)</span></label>
            <input id="invite-host" maxLength={40} value={hostName} onChange={(event) => setHostName(event.target.value)} placeholder="Tony" />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary profile-save" disabled={saving} type="submit">
              {saving ? "CREATING..." : "CREATE INVITE"} <span aria-hidden="true">→</span>
            </button>
          </form>
        ) : (
          <div className="invite-share">
            <div className="invite-preview" style={{ "--vibe-color": INVITE_VIBES[invite.vibe].color } as React.CSSProperties}>
              <span className="invite-preview__badge">YOU&apos;RE INVITED</span>
              <strong>{INVITE_VIBES[invite.vibe].label}</strong>
              {invite.message && <p>“{invite.message}”</p>}
              <span>{formatInviteTime(invite.startsAt).day} · {formatInviteTime(invite.startsAt).time}</span>
            </div>
            <label className="invite-link-label" htmlFor="invite-link">INVITE LINK</label>
            <div className="invite-link-row">
              <input id="invite-link" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
              <button className="button button-primary" onClick={() => void copyLink()}>
                <Copy size={15} aria-hidden="true" /> COPY
              </button>
            </div>
            <div className="invite-share-grid">
              <button className="invite-share-option invite-share-option--instagram" onClick={() => void shareInstagram()}>
                <Instagram size={20} aria-hidden="true" /><span>INSTAGRAM</span>
              </button>
              <button className="invite-share-option invite-share-option--messenger" onClick={() => void shareMessenger()}>
                <MessageCircle size={20} aria-hidden="true" /><span>MESSENGER</span>
              </button>
              <button className="invite-share-option invite-share-option--email" onClick={shareEmail}>
                <Mail size={20} aria-hidden="true" /><span>EMAIL</span>
              </button>
              {typeof navigator.share === "function" && (
                <button className="invite-share-option" onClick={() => void nativeShare()}>
                  <Share2 size={20} aria-hidden="true" /><span>MORE</span>
                </button>
              )}
            </div>
            <p className="drawer-copy">Friends who open the link get a card to swipe right (going) or left (can&apos;t make it).</p>
            <a className="button button-info" href={`/invite/${invite.id}`} target="_blank" rel="noreferrer">
              <Check size={15} aria-hidden="true" /> PREVIEW WHAT FRIENDS SEE
            </a>
            {status && <p className="invite-status" role="status">{status}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
