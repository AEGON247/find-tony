"use client";

import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useSocial } from "@/context/SocialContext";
import { useVibe } from "@/context/VibeContext";
import { INVITE_VIBE_IDS, INVITE_VIBES, defaultVibeFor, type InviteVibeId } from "@/lib/invite-vibes";
import { MAX_SOCIAL_VIBES } from "@/lib/social-types";

export default function SocialProfileModal() {
  const { profile: vibeProfile } = useVibe();
  const { profile, saveProfile, closeProfileSetup } = useSocial();
  const [alias, setAlias] = useState(profile?.alias ?? vibeProfile.alias.replace(/^@/, ""));
  const [vibes, setVibes] = useState<InviteVibeId[]>(profile?.vibes ?? [defaultVibeFor(vibeProfile.primaryVibe)]);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [discoverable, setDiscoverable] = useState(profile?.discoverable ?? true);
  const [adultConfirmed, setAdultConfirmed] = useState(Boolean(profile));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleVibe(id: InviteVibeId) {
    setVibes((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length >= MAX_SOCIAL_VIBES ? current : [...current, id]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await saveProfile({ alias, vibes, bio, discoverable, adultConfirmed });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop social-profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProfileSetup(); }}>
      <section className="profile-drawer" role="dialog" aria-modal="true" aria-labelledby="social-profile-title">
        <button className="drawer-close" onClick={closeProfileSetup} aria-label="Close social profile"><X /></button>
        <p className="eyebrow">OPEN INVITES // MEET PEOPLE</p>
        <h2 id="social-profile-title">{profile ? "SOCIAL PROFILE" : "GO SOCIAL"}</h2>
        <p className="drawer-copy">
          This is how people see you when you RSVP, chat or match. No sign-up. Your profile is tied to this browser.
        </p>
        <form className="profile-form" onSubmit={submit}>
          <label htmlFor="social-alias">HANDLE</label>
          <input id="social-alias" required minLength={2} maxLength={32} value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="tony_from_newtown" />

          <fieldset>
            <legend>YOUR VIBES <span>(PICK UP TO {MAX_SOCIAL_VIBES})</span></legend>
            <div className="social-vibe-picker">
              {INVITE_VIBE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={vibes.includes(id)}
                  className={`social-vibe-chip ${vibes.includes(id) ? "is-active" : ""}`}
                  style={{ "--vibe-color": INVITE_VIBES[id].color } as React.CSSProperties}
                  onClick={() => toggleVibe(id)}
                >
                  {INVITE_VIBES[id].label}
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="social-bio">ONE-LINER <span>(OPTIONAL)</span></label>
          <textarea id="social-bio" maxLength={140} rows={2} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="New to Sydney, always down for dumplings." />

          <label className="social-check">
            <input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} />
            <span><strong>Show me in Meet.</strong> People nearby with shared vibes can find me. They only see a rough distance (to the nearest km).</span>
          </label>
          <label className="social-check">
            <input type="checkbox" required checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} />
            <span><strong>I&apos;m 18 or older.</strong> Open invites and matching are for adults only.</span>
          </label>
          <p className="social-safety-note"><ShieldCheck size={14} aria-hidden="true" /> Your exact location is never shown to anyone. Meet in public places.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary profile-save" disabled={saving || vibes.length === 0} type="submit">
            {saving ? "SAVING..." : profile ? "SAVE PROFILE" : "LET'S GO"} <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </div>
  );
}
