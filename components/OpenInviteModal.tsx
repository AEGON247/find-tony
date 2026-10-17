"use client";

import { useState } from "react";
import { MapPin, Radio, X } from "lucide-react";
import { useSocial } from "@/context/SocialContext";
import { INVITE_VIBE_IDS, INVITE_VIBES, defaultVibeFor, type InviteVibeId } from "@/lib/invite-vibes";
import { OPEN_INVITE_DURATIONS, OPEN_INVITE_SPOTS, type OpenInviteView } from "@/lib/social-types";
import type { VibePlace } from "@/lib/types";

const MESSAGE_IDEAS: Record<string, string> = {
  FOODIE: "Grabbing food here now, anyone keen to join?",
  PARTY: "Heading here for drinks right now, anyone wanna join?",
  EVENTS: "Going to this now, don't make me go alone!",
  CHILL: "Chilling here for a bit, come hang.",
};

function durationLabel(minutes: number) {
  return `${minutes / 60} HR${minutes > 60 ? "S" : ""}`;
}

export default function OpenInviteModal({
  place,
  onClose,
  onCreated,
}: {
  place: VibePlace;
  onClose: () => void;
  onCreated: (invite: OpenInviteView) => void;
}) {
  const { createOpenInvite } = useSocial();
  const [vibe, setVibe] = useState<InviteVibeId>(() => defaultVibeFor(place.category));
  // Start with a real, editable message; most hosts won't type one, and a blank
  // invite leaves guests guessing what the plan is.
  const [message, setMessage] = useState(MESSAGE_IDEAS[place.category]);
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [spots, setSpots] = useState<number>(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const orderedVibes = [
    ...INVITE_VIBE_IDS.filter((id) => INVITE_VIBES[id].category === place.category),
    ...INVITE_VIBE_IDS.filter((id) => INVITE_VIBES[id].category !== place.category),
  ];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const invite = await createOpenInvite({
        place: {
          id: place.id,
          title: place.title,
          address: place.address,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
        },
        vibe,
        message,
        durationMinutes,
        spots,
      });
      onCreated(invite);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The invite could not be broadcast.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-drawer invite-drawer open-invite-drawer" role="dialog" aria-modal="true" aria-labelledby="open-invite-title">
        <button className="drawer-close" onClick={onClose} aria-label="Close open invite"><X /></button>
        <p className="eyebrow">OPEN INVITE // ANYONE NEARBY</p>
        <h2 id="open-invite-title">WHO&apos;S KEEN?</h2>
        <div className="invite-place-chip">
          <MapPin size={15} aria-hidden="true" />
          <span><strong>{place.title}</strong>{place.address && place.address !== "Address not listed" ? ` · ${place.address}` : ""}</span>
        </div>
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
          <label htmlFor="open-invite-message">WHAT&apos;S THE PLAN?</label>
          <textarea
            id="open-invite-message"
            maxLength={160}
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={MESSAGE_IDEAS[place.category]}
          />
          <fieldset>
            <legend>LIVE ON THE MAP FOR</legend>
            <div className="radius-options radius-options--three">
              {OPEN_INVITE_DURATIONS.map((minutes) => (
                <label key={minutes} className={durationMinutes === minutes ? "radius-option is-selected" : "radius-option"}>
                  <input type="radio" name="duration" checked={durationMinutes === minutes} onChange={() => setDurationMinutes(minutes)} />
                  {durationLabel(minutes)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>SPOTS OPEN</legend>
            <div className="radius-options">
              {OPEN_INVITE_SPOTS.map((count) => (
                <label key={count} className={spots === count ? "radius-option is-selected" : "radius-option"}>
                  <input type="radio" name="spots" checked={spots === count} onChange={() => setSpots(count)} />
                  {count === 0 ? "ANY" : count}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="drawer-copy open-invite-note">
            Everyone on Find Tony within their search radius sees this pin until it expires. Only people who say yes are
            shared with you. Passes stay private. Meet in public and trust your gut.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary profile-save" disabled={saving} type="submit">
            <Radio size={15} aria-hidden="true" /> {saving ? "BROADCASTING..." : "BROADCAST INVITE"}
          </button>
        </form>
      </section>
    </div>
  );
}
