"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { UserRound, X } from "lucide-react";
import { useState } from "react";
import { useVibe } from "@/context/VibeContext";
import BadgeShowcase from "@/components/BadgeShowcase";
import type { BadgeProgress } from "@/config/badges";
import { CATEGORIES, type Category } from "@/lib/types";

const radiusOptions = [1, 3, 5, 10];
const avatarOptions = ["spidey.png", "koala.png", "guitar.png", "football.png", "dog.png", "crown.png", "cat.png", "cap-shield.png"];

export default function ProfileModal({
  onClose,
  badges,
}: {
  onClose: () => void;
  badges: BadgeProgress[];
}) {
  const { profile, updateProfile, preferences, updatePreferences } = useVibe();
  const [draft, setDraft] = useState(profile);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateProfile({ ...draft, alias: draft.alias.trim() || "" });
    onClose();
  };

  return (
      <motion.div
        className="modal-backdrop"
        onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
          <motion.section
            className="profile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <button className="drawer-close" onClick={onClose} aria-label="Close profile"><X /></button>
            <p className="eyebrow">YOUR RADAR / YOUR RULES</p>
            <h2 id="profile-title">VIBE PROFILE</h2>
            <p className="drawer-copy">Choose a default vibe and search radius. Your profile stays on this device.</p>
            <BadgeShowcase badges={badges.filter((badge) => badge.unlocked)} />
            <form onSubmit={save} className="profile-form">
              <div className="profile-avatar-controls">
                <div className="profile-avatar-selector">
                  <button
                    className="profile-avatar-preview"
                    type="button"
                    aria-label="Choose profile avatar"
                    aria-haspopup="listbox"
                    aria-expanded={avatarPickerOpen}
                    onClick={() => setAvatarPickerOpen((open) => !open)}
                  >
                    {draft.avatar
                      ? <Image src={`/avatars/${draft.avatar}`} alt="Current avatar" width={64} height={64} unoptimized />
                      : <span className="profile-avatar-none"><UserRound size={26} /></span>}
                  </button>
                  {avatarPickerOpen && (
                    <div className="profile-avatar-picker" role="listbox" aria-label="Choose an avatar">
                      <button
                        type="button"
                        role="option"
                        aria-selected={draft.avatar === null}
                        className={`profile-avatar-option profile-avatar-option--none${draft.avatar === null ? " is-selected" : ""}`}
                        onClick={() => {
                          setDraft({ ...draft, avatar: null, useAvatarAsPointer: false });
                          setAvatarPickerOpen(false);
                        }}
                      >
                        <span aria-hidden="true">⊘</span>
                        <small>None</small>
                      </button>
                      {avatarOptions.map((avatar) => (
                        <button
                          key={avatar}
                          type="button"
                          role="option"
                          aria-label={avatar.replace(".png", "").replace("-", " ")}
                          aria-selected={draft.avatar === avatar}
                          className={`profile-avatar-option${draft.avatar === avatar ? " is-selected" : ""}`}
                          onClick={() => {
                            setDraft({ ...draft, avatar });
                            setAvatarPickerOpen(false);
                          }}
                        >
                          <Image src={`/avatars/${avatar}`} alt="" width={48} height={48} unoptimized />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <label className="preference-toggle profile-pointer-toggle">
                  <span><strong>USE AS POINTER?</strong><small>Use this avatar for your map location marker.</small></span>
                  <input
                    type="checkbox"
                    checked={draft.useAvatarAsPointer}
                    disabled={!draft.avatar}
                    onChange={(event) => setDraft({ ...draft, useAvatarAsPointer: event.target.checked })}
                  />
                </label>
              </div>
              <fieldset className="profile-preferences">
              <legend>MAP FILTERS</legend>
              <label className="preference-toggle">
                <span><strong>HIDE SMOKING SPOTS</strong><small>Hide places tagged for smoking or cigars.</small></span>
                <input
                  type="checkbox"
                  checked={preferences.hideSmokingSpots}
                  onChange={(event) => updatePreferences({ ...preferences, hideSmokingSpots: event.target.checked })}
                />
              </label>
              <label className="preference-toggle">
                <span><strong>HIDE ALCOHOL SPOTS</strong><small>Hide places tagged as bars, pubs, or alcohol venues.</small></span>
                <input
                  type="checkbox"
                  checked={preferences.hideAlcoholSpots}
                  onChange={(event) => updatePreferences({ ...preferences, hideAlcoholSpots: event.target.checked })}
                />
              </label>
            </fieldset>
              <label htmlFor="alias">YOUR HANDLE</label>
              <input id="alias" maxLength={32} value={draft.alias} onChange={(event) => setDraft({ ...draft, alias: event.target.value })} placeholder="@sydney_hacker" />

              <label htmlFor="primary-vibe">PRIMARY VIBE</label>
              <select id="primary-vibe" value={draft.primaryVibe} onChange={(event) => setDraft({ ...draft, primaryVibe: event.target.value as Category })}>
                {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>

              <fieldset>
                <legend>MAX SEARCH RADIUS</legend>
                <div className="radius-options">
                  {radiusOptions.map((radius) => (
                    <label key={radius} className={draft.radiusKm === radius ? "radius-option is-selected" : "radius-option"}>
                      <input type="radio" name="radius" value={radius} checked={draft.radiusKm === radius} onChange={() => setDraft({ ...draft, radiusKm: radius })} />
                      {radius} KM
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="button button-primary profile-save" type="submit">SAVE PROFILE <span aria-hidden="true">→</span></button>
            </form>
          </motion.section>
      </motion.div>
  );
}
