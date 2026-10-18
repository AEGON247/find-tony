"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useVibe } from "@/context/VibeContext";
import { CATEGORIES, type Category, type VibePlace } from "@/lib/types";

export default function AlertModal({
  open,
  category,
  onClose,
  onCreated,
}: {
  open: boolean;
  category: Category;
  onClose: () => void;
  onCreated: (place: VibePlace) => void;
}) {
  const { coordinates } = useVibe();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftCategory, setDraftCategory] = useState(category);
  const [temporary, setTemporary] = useState(false);

  useEffect(() => setDraftCategory(category), [category]);

  if (!open) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const hours = Number(form.get("expiry-hours") ?? 0);
    const minutes = Number(form.get("expiry-minutes") ?? 0);
    const durationSeconds = (hours * 60 + minutes) * 60;
    if (temporary && (!Number.isInteger(hours) || hours < 0 || hours > 24 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 || durationSeconds <= 0 || durationSeconds > 24 * 60 * 60)) {
      setError("Choose an expiry between 1 minute and 24 hours.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          category: form.get("category"),
          details: form.get("details"),
          eventTag: form.get("eventTag"),
          temporary,
          expiresAt: temporary ? new Date(Date.now() + durationSeconds * 1000).toISOString() : null,
          lat: coordinates?.[0],
          lng: coordinates?.[1],
        }),
      });
      const result = await response.json() as { item?: VibePlace; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error ?? "Alert could not be published.");
      onCreated(result.item);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Alert could not be published.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-drawer alert-drawer" role="dialog" aria-modal="true" aria-labelledby="alert-title">
        <button className="drawer-close" onClick={onClose} aria-label="Close alert form"><X /></button>
        <p className="eyebrow">COMMUNITY SIGNAL</p>
        <h2 id="alert-title">DROP A SPOT</h2>
        <p className="drawer-copy">This pin uses your current location and is saved with Find Tony's community places.</p>
        <form className="profile-form" onSubmit={submit}>
          <label htmlFor="alert-name">PLACE OR ALERT NAME</label>
          <input id="alert-name" name="title" required minLength={3} maxLength={80} placeholder="Free pizza at the quad" />
          <label htmlFor="alert-category">VIBE</label>
          <select id="alert-category" name="category" value={draftCategory} onChange={(event) => setDraftCategory(event.target.value as Category)}>
            {CATEGORIES.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          {draftCategory === "EVENTS" && (
            <>
              <label htmlFor="alert-event-tag">EVENT TYPE</label>
              <select id="alert-event-tag" name="eventTag" defaultValue="Community event">
                <option>Hackathon</option>
                <option>Case competition</option>
                <option>Startup event</option>
                <option>Technology meetup</option>
                <option>Workshop</option>
                <option>Conference</option>
                <option>Career fair</option>
                <option>Social event</option>
                <option>Community event</option>
              </select>
            </>
          )}
          <label htmlFor="alert-details">DETAILS <span>(OPTIONAL)</span></label>
          <textarea id="alert-details" name="details" maxLength={280} rows={4} placeholder="What should people know?" />
          <label className="preference-toggle alert-temporary-toggle">
            <span><strong>TEMPORARY SPOT</strong><small>Automatically remove this pin after it expires.</small></span>
            <input type="checkbox" checked={temporary} onChange={(event) => setTemporary(event.target.checked)} />
          </label>
          {temporary && (
            <fieldset className="alert-expiry-fields">
              <legend>REMOVE PIN AFTER</legend>
              <label htmlFor="expiry-hours">HOURS</label>
              <input id="expiry-hours" name="expiry-hours" type="number" min="0" max="24" defaultValue="2" required />
              <label htmlFor="expiry-minutes">MINUTES</label>
              <input id="expiry-minutes" name="expiry-minutes" type="number" min="0" max="59" defaultValue="0" required />
            </fieldset>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary profile-save" disabled={saving} type="submit">
            {saving ? "PUBLISHING..." : "PUBLISH SPOT"} <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </div>
  );
}
