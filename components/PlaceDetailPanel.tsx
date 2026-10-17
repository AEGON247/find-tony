"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { ArrowDown, ArrowUp, ArrowUpRight, Bookmark, ChevronLeft, ChevronRight, Clock3, Flag, Globe, MapPin, Navigation, Pencil, Share2, Ticket, UserPlus, X } from "lucide-react";
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, Bookmark, CalendarDays, ChevronLeft, ChevronRight, Clock3, Coffee, Flag, Globe, MapPin, Music2, Navigation, Pencil, Share2, Ticket, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { VibePlace } from "@/lib/types";

const SAVED_PLACES_KEY = "find-tony-saved-places-v1";
type DetailTab = "overview" | "reviews" | "about";

function formatEventTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Australia/Sydney",
    }).format(date);
}

function formatOpeningHours(value: string) {
  const days: Record<string, string> = {
    Mo: "Monday",
    Tu: "Tuesday",
    We: "Wednesday",
    Th: "Thursday",
    Fr: "Friday",
    Sa: "Saturday",
    Su: "Sunday",
  };
  return value
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\b/g, (_, first: string, last?: string) =>
      last ? `${days[first]} to ${days[last]}` : days[first],
    )
    .replace(/\b(\d{2}:\d{2})-(\d{2}:\d{2})\b/g, "$1 to $2")
    .replace(/^24\/7$/, "Open 24 hours every day");
}

export default function PlaceDetailPanel({
  place,
  onClose,
  onNavigate,
  onNearby,
  onInvite,
  onTagAdded,
  onTagRemoved,
  onReport,
  userCoordinates,
  onCheckIn,
  checkedIn,
}: {
  place?: VibePlace;
  onClose: () => void;
  onNavigate: (place: VibePlace) => void;
  onNearby: (place: VibePlace) => void;
  onInvite: (place: VibePlace) => void;
  onTagAdded: (placeId: string, tags: string[], communityTags: string[]) => void;
  onTagRemoved: (placeId: string, tags: string[], communityTags: string[]) => void;
  onReport: (place: VibePlace, reason: "not_a_place" | "closed" | "incorrect") => Promise<void>;
  userCoordinates?: [number, number];
  onCheckIn: (place: VibePlace) => void;
  checkedIn: boolean;
}) {
  const [shareStatus, setShareStatus] = useState("");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>([]);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [tagError, setTagError] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [tagRemoving, setTagRemoving] = useState("");
  const [reportPromptOpen, setReportPromptOpen] = useState(false);
  const [reportReason, setReportReason] = useState<"not_a_place" | "closed" | "incorrect">("not_a_place");
  const [reportError, setReportError] = useState("");
  const [reporting, setReporting] = useState(false);
  const actionCarouselRef = useRef<HTMLDivElement>(null);
  const start = formatEventTime(place?.eventStart);
  const end = formatEventTime(place?.eventEnd);
  const imageUrls = place?.imageUrls?.length ? place.imageUrls : place?.imageUrl ? [place.imageUrl] : [];
  const [imageIndex, setImageIndex] = useState(0);
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const currentImageUrl = imageUrls[Math.min(imageIndex, Math.max(imageUrls.length - 1, 0))];
  const CategoryIcon = place?.category === "FOODIE"
    ? Coffee
    : place?.category === "PARTY"
      ? Music2
      : place?.category === "CHILL"
        ? BookOpen
        : CalendarDays;

  useEffect(() => {
    setActiveTab("overview");
    setShareStatus("");
    setTagEditorOpen(false);
    setTagError("");
    setReportPromptOpen(false);
    setReportError("");
    setImageIndex(0);
    setFailedImageUrls([]);
  }, [place?.id]);

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!place) return;
    const form = new FormData(event.currentTarget);
    const tag = String(form.get("place-tag") ?? "").trim().replace(/\s+/g, " ");
    if (tag.length < 2 || tag.length > 32) {
      setTagError("Enter a tag between 2 and 32 characters.");
      return;
    }
    setTagSaving(true);
    setTagError("");
    try {
      const response = await fetch("/api/place-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: place.id, tag }),
      });
      const result = await response.json() as { tags?: string[]; error?: string };
      if (!response.ok || !result.tags) throw new Error(result.error ?? "Could not add this tag.");
      const communityTags = result.tags;
      onTagAdded(
        place.id,
        [...new Set([...(place.sourceTags ?? place.tags ?? []), ...communityTags])],
        communityTags,
      );
      setTagEditorOpen(false);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "Could not add this tag.");
    } finally {
      setTagSaving(false);
    }
  }

  async function removeTag(tag: string) {
    if (!place) return;
    setTagRemoving(tag);
    setTagError("");
    try {
      const response = await fetch("/api/place-tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: place.id, tag }),
      });
      const result = await response.json() as { tags?: string[]; error?: string };
      if (!response.ok || !result.tags) throw new Error(result.error ?? "Could not remove this tag.");
      const sourceTags = place.sourceTags ?? [];
      onTagRemoved(place.id, [...new Set([...sourceTags, ...result.tags])], result.tags);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "Could not remove this tag.");
    } finally {
      setTagRemoving("");
    }
  }

  function scrollActions(direction: -1 | 1) {
    actionCarouselRef.current?.scrollBy({ left: direction * 210, behavior: "smooth" });
  }

  async function submitReport() {
    if (!place) return;
    setReporting(true);
    setReportError("");
    try {
      await onReport(place, reportReason);
      setReportPromptOpen(false);
      setShareStatus("REPORT SENT FOR REVIEW");
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Could not submit this report.");
    } finally {
      setReporting(false);
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_PLACES_KEY);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
        setSavedPlaceIds(parsed);
      }
    } catch (error) {
      console.error("Could not load saved places.", error);
    }
  }, []);

  function toggleSaved() {
    if (!place) return;
    const next = savedPlaceIds.includes(place.id)
      ? savedPlaceIds.filter((id) => id !== place.id)
      : [...savedPlaceIds, place.id];
    try {
      localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
      setSavedPlaceIds(next);
    } catch (error) {
      console.error("Could not save this place.", error);
      setShareStatus("COULD NOT SAVE PLACE");
    }
  }

  async function sharePlace() {
    if (!place) return;
    const url = new URL(window.location.href);
    url.searchParams.set("category", place.category);
    url.searchParams.set("placeId", place.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: place.title, url: url.toString() });
        setShareStatus("PLACE SHARED");
      } else {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("PLACE LINK COPIED");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Could not copy the place link.", error);
      setShareStatus("COULD NOT COPY PLACE LINK");
    }
  }

  return (
    <AnimatePresence>
      {place && (
        <motion.aside
          className={`place-detail-panel ${mobileExpanded ? "is-expanded" : ""}`}
          aria-label={`${place.title} details`}
          aria-labelledby="place-detail-title"
          initial={{ x: -24, y: 12, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          exit={{ x: -24, y: 12, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        >
          <button
            className="place-detail-expand"
            onClick={() => setMobileExpanded((expanded) => !expanded)}
            aria-label={mobileExpanded ? "Collapse place details" : "Expand place details"}
          >
            {mobileExpanded ? <ArrowDown size={17} /> : <ArrowUp size={17} />}
          </button>
          <div className={`place-detail-banner place-detail-banner--${place.category.toLowerCase()}`}>
            {currentImageUrl && !failedImageUrls.includes(currentImageUrl) ? (
              <Image
                className="place-detail-image"
                src={currentImageUrl}
                alt=""
                fill
                unoptimized
                sizes="(max-width: 560px) 100vw, 380px"
                onError={() => setFailedImageUrls((urls) => [...new Set([...urls, currentImageUrl])])}
              />
            ) : (
              <div className="place-detail-placeholder" aria-hidden="true">
                <CategoryIcon size={86} strokeWidth={1.2} />
              </div>
            )}
            {imageUrls.length > 1 && (
              <div className="place-detail-image-controls" aria-label="Venue photos">
                <button
                  type="button"
                  aria-label="Previous venue photo"
                  onClick={() => setImageIndex((index) => (index - 1 + imageUrls.length) % imageUrls.length)}
                ><ChevronLeft size={16} /></button>
                <span>{imageIndex + 1}/{imageUrls.length}</span>
                <button
                  type="button"
                  aria-label="Next venue photo"
                  onClick={() => setImageIndex((index) => (index + 1) % imageUrls.length)}
                ><ChevronRight size={16} /></button>
              </div>
            )}
            <button className="drawer-close" onClick={onClose} aria-label="Close place details"><X /></button>
            <p className="eyebrow">{`// ${place.category}${place.isLiveEvent ? " · LIVE EVENT" : ""}`}</p>
            <h2 id="place-detail-title">{place.title}</h2>
            {place.placeType && <p className="place-detail-type">{place.placeType}{place.accessibility ? ` · ${place.accessibility}` : ""}</p>}
            {place.rating !== undefined && (
              <p className="place-rating" aria-label={`Rated ${place.rating} out of 5`}>
                {place.rating.toFixed(1)} <span aria-hidden="true">★</span>
              </p>
            )}
          </div>
          <div className="place-action-carousel">
            <div className="place-action-carousel__header">
              <span>QUICK ACTIONS</span>
              <div>
                <button aria-label="Scroll actions left" onClick={() => scrollActions(-1)}><ChevronLeft size={15} /></button>
                <button aria-label="Scroll actions right" onClick={() => scrollActions(1)}><ChevronRight size={15} /></button>
              </div>
            </div>
            <div className="place-detail-actions" ref={actionCarouselRef} aria-label="Place actions">
              <button className="place-detail-action place-detail-action--invite" onClick={() => onInvite(place)}>
                <UserPlus size={17} /><span>RSVP / INVITE</span>
              </button>
              <button className="place-detail-action place-detail-action--route" onClick={() => onNavigate(place)}>
                <Navigation size={17} /><span>IN-APP ROUTE</span>
              </button>
              <a
                className="place-detail-action place-detail-action--website"
                href={`https://www.google.com/maps/dir/?api=1&${userCoordinates ? `origin=${userCoordinates[0]},${userCoordinates[1]}&` : ""}destination=${place.lat},${place.lng}&travelmode=walking`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation size={17} /><span>WALK IN MAPS<ArrowUpRight size={12} /></span>
              </a>
              <button className={`place-detail-action place-detail-action--save ${savedPlaceIds.includes(place.id) ? "is-saved" : ""}`} onClick={toggleSaved}>
                <Bookmark size={17} fill={savedPlaceIds.includes(place.id) ? "currentColor" : "none"} />
                <span>{savedPlaceIds.includes(place.id) ? "SAVED" : "SAVE"}</span>
              </button>
              {place.link && (
                <a className="place-detail-action place-detail-action--website" href={place.link} target="_blank" rel="noreferrer">
                  <Globe size={17} /><span>{place.isLiveEvent ? "REGISTER" : "WEBSITE"}<ArrowUpRight size={12} /></span>
                </a>
              )}
              <button className="place-detail-action place-detail-action--share" onClick={sharePlace}>
                <Share2 size={17} /><span>SHARE</span>
              </button>
            </div>
          </div>
          <nav className="place-detail-tabs" aria-label="Place information">
            {(["overview", "reviews", "about"] as const).map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "is-active" : ""}
                aria-current={activeTab === tab ? "page" : undefined}
                onClick={() => setActiveTab(tab)}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </nav>
          <div className="place-detail-content">
            {shareStatus && <p className="share-status" role="status">{shareStatus}</p>}
            <div className="place-tags" aria-label="Place tags">
              {(place.tags ?? []).map((tag) => (
                <span className="place-tag-item" key={tag}>
                  <span className="place-tag">{tag}</span>
                  {place.communityTags?.some((communityTag) => communityTag.toLocaleLowerCase("en-AU") === tag.toLocaleLowerCase("en-AU")) && (
                    <button
                      className="place-tag-remove"
                      aria-label={`Cancel ${tag} tag`}
                      title={`Remove shared ${tag} tag`}
                      disabled={tagRemoving === tag}
                      onClick={() => void removeTag(tag)}
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
              <button
                className="place-tag-edit"
                aria-label="Add a tag"
                title="Add a community tag"
                onClick={() => { setTagEditorOpen((open) => !open); setTagError(""); }}
              >
                <Pencil size={13} />
              </button>
            </div>
            {!tagEditorOpen && tagError && <p className="place-tag-delete-error" role="alert">{tagError}</p>}
            {tagEditorOpen && (
              <form className="place-tag-editor" onSubmit={addTag}>
                <label htmlFor="place-tag-input">ADD A SHARED TAG</label>
                <div>
                  <input id="place-tag-input" name="place-tag" maxLength={32} minLength={2} required placeholder="Case competition" />
                  <button className="button button-primary" disabled={tagSaving}>{tagSaving ? "SAVING..." : "ADD TAG"}</button>
                </div>
                {tagError && <p className="form-error" role="alert">{tagError}</p>}
              </form>
            )}
            {place.isLiveEvent && (
              <section className="place-detail-fact place-event-tags">
                <Ticket size={16} />
                <div>
                  <h3>EVENT TYPE</h3>
                  <p>{(place.tags?.length ? place.tags : ["Community event"]).join(" · ")}</p>
                </div>
              </section>
            )}
            {activeTab === "overview" && (
              <>
                <p className="place-address"><MapPin size={15} />{place.address}</p>
                {place.distanceMeters !== undefined && (
                  <p className="distance-label">{place.distanceMeters < 1000
                    ? `${place.distanceMeters} METRES AWAY`
                    : `${(place.distanceMeters / 1000).toFixed(1)} KM AWAY`}</p>
                )}
                <section className="place-detail-section">
                  <h3>OVERVIEW</h3>
                  <p>{place.details || "No additional place details are available."}</p>
                </section>
                {place.eventDetails?.hours && (
                  <section className="place-detail-fact">
                    <Clock3 size={16} />
                    <div><h3>OPENING HOURS</h3><p>{formatOpeningHours(place.eventDetails.hours)}</p></div>
                  </section>
                )}
                {place.isLiveEvent && (
                  <section className="place-detail-fact">
                    <Ticket size={16} />
                    <div>
                      <h3>EVENT INFORMATION</h3>
                      {place.eventDetails?.registrationStatus && <p>{place.eventDetails.registrationStatus}</p>}
                      {(start || end) && <p>{start}{end ? ` — ${end}` : ""}</p>}
                      {place.isFree !== undefined && <p>{place.isFree ? "Free registration" : "Tickets may be paid"}</p>}
                      {place.eventDetails?.deal && <p>{place.eventDetails.deal}</p>}
                      {place.eventDetails?.entry && <p>{place.eventDetails.entry}</p>}
                    </div>
                  </section>
                )}
                {place.eventDetails?.floor && (
                  <section className="place-detail-fact">
                    <MapPin size={16} />
                    <div><h3>LOCATION DETAILS</h3><p>{place.eventDetails.floor}</p></div>
                  </section>
                )}
                {place.accessibility && (
                  <section className="place-detail-fact">
                    <MapPin size={16} />
                    <div><h3>ACCESSIBILITY</h3><p>{place.accessibility}</p></div>
                  </section>
                )}
              </>
            )}
            {activeTab === "reviews" && (
              <section className="place-detail-section">
                <h3>REVIEWS</h3>
                <p>{place.rating !== undefined
                  ? `Community rating: ${place.rating.toFixed(1)} out of 5.`
                  : "No verified community reviews are available for this place."}</p>
              </section>
            )}
            {activeTab === "about" && (
              <section className="place-detail-section">
                <h3>ABOUT</h3>
                <p>{place.details || "No additional place details are available."}</p>
                {place.placeType && <p>Place type: {place.placeType}.</p>}
                <p>Information source: {place.source}.</p>
              </section>
            )}
            <button className="place-report-trigger" onClick={() => setReportPromptOpen((open) => !open)}>
              <Flag size={13} /> REPORT NOT A SPOT
            </button>
            {reportPromptOpen && (
              <section className="place-report-prompt" aria-label="Report this place">
                <h3>IS THIS PLACE FAKE, CLOSED, OR INCORRECT?</h3>
                {([
                  ["not_a_place", "This is not a real place"],
                  ["closed", "This place is closed"],
                  ["incorrect", "The details are incorrect"],
                ] as const).map(([value, label]) => (
                  <label key={value}>
                    <input type="radio" name="report-reason" checked={reportReason === value} onChange={() => setReportReason(value)} />
                    {label}
                  </label>
                ))}
                {reportError && <p className="form-error" role="alert">{reportError}</p>}
                <button className="button button-primary" disabled={reporting} onClick={submitReport}>
                  {reporting ? "SENDING REPORT..." : "SUBMIT REPORT"}
                </button>
              </section>
            )}
            {place.distanceMeters !== undefined && place.distanceMeters <= 50 && (
              <button
                className="button button-checkin"
                onClick={() => onCheckIn(place)}
                disabled={checkedIn}
              >
                {checkedIn ? "CHECKED IN TODAY" : "CHECK IN HERE"}
              </button>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
