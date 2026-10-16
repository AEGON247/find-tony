"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { ArrowDown, ArrowUp, ArrowUpRight, Bookmark, Clock3, Globe, MapPin, Navigation, Share2, Ticket, X } from "lucide-react";
import { useEffect, useState } from "react";
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
  onCheckIn,
  checkedIn,
}: {
  place?: VibePlace;
  onClose: () => void;
  onNavigate: (place: VibePlace) => void;
  onNearby: (place: VibePlace) => void;
  onCheckIn: (place: VibePlace) => void;
  checkedIn: boolean;
}) {
  const [shareStatus, setShareStatus] = useState("");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>([]);
  const start = formatEventTime(place?.eventStart);
  const end = formatEventTime(place?.eventEnd);

  useEffect(() => {
    setActiveTab("overview");
    setShareStatus("");
  }, [place?.id]);

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
            {place.imageUrl && (
              <Image
                className="place-detail-image"
                src={place.imageUrl}
                alt=""
                fill
                unoptimized
                sizes="(max-width: 560px) 100vw, 380px"
              />
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
          <div className="place-detail-actions">
            <button className="place-detail-action place-detail-action--route" onClick={() => onNavigate(place)}>
              <Navigation size={17} /><span>DIRECTIONS</span>
            </button>
            <button className={`place-detail-action place-detail-action--save ${savedPlaceIds.includes(place.id) ? "is-saved" : ""}`} onClick={toggleSaved}>
              <Bookmark size={17} fill={savedPlaceIds.includes(place.id) ? "currentColor" : "none"} />
              <span>{savedPlaceIds.includes(place.id) ? "SAVED" : "SAVE"}</span>
            </button>
            <button className="place-detail-action place-detail-action--nearby" onClick={() => onNearby(place)}>
              <MapPin size={17} /><span>NEARBY</span>
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
