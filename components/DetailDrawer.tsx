"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Clock3, MapPin, Ticket, X } from "lucide-react";
import type { VibePlace } from "@/lib/types";

function formatEventTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function DetailDrawer({ place, onClose, origin }: {
  place?: VibePlace;
  onClose: () => void;
  origin: [number, number];
}) {
  const directions = place
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin[0]},${origin[1]}&destination=${place.lat},${place.lng}`
    : "#";
  const start = formatEventTime(place?.eventStart);
  const end = formatEventTime(place?.eventEnd);

  return (
    <AnimatePresence>
      {place && (
        <motion.aside
          className="detail-drawer"
          aria-label={`${place.title} details`}
          initial={{ y: 36, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 36, opacity: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 25 }}
        >
          <button className="drawer-close" onClick={onClose} aria-label="Close place details"><X /></button>
          <p className="eyebrow">// {place.category}{place.isLiveEvent ? " · LIVE EVENT" : ""}</p>
          <h2>{place.title}</h2>
          <p className="place-address"><MapPin size={14} />{place.address}</p>
          <p className="detail-copy">{place.details || "More details are not available yet."}</p>

          {place.eventDetails?.activeEvent && !place.isLiveEvent && (
            <section className="event-info">
              <span className="event-info__label">COMMUNITY PROGRAM</span>
              <strong>{place.eventDetails.activeEvent}</strong>
              <p>Event details may change; confirm the current listing with the organizer.</p>
            </section>
          )}
          {place.isLiveEvent && (
            <section className="event-info">
              <span className="event-info__label">EVENTBRITE / LIVE LISTING</span>
              {place.eventDetails?.registrationStatus && <strong>{place.eventDetails.registrationStatus}</strong>}
              {(start || end) && <p><Clock3 size={14} />{start}{end ? ` — ${end}` : ""}</p>}
              {place.isFree !== undefined && <p>{place.isFree ? "Free registration" : "Tickets may be paid"}</p>}
            </section>
          )}
          {place.eventDetails?.deal && <p className="event-fact"><Ticket size={15} />{place.eventDetails.deal}</p>}
          {place.eventDetails?.hours && <p className="event-fact"><Clock3 size={15} />{place.eventDetails.hours}</p>}
          {place.distanceMeters !== undefined && (
            <p className="distance-label">{place.distanceMeters < 1000
              ? `${place.distanceMeters} M AWAY`
              : `${(place.distanceMeters / 1000).toFixed(1)} KM AWAY`}</p>
          )}
          <div className="detail-actions">
            {place.link && <a className="button button-info" href={place.link} target="_blank" rel="noreferrer">REGISTER / INFO <ArrowUpRight size={15} /></a>}
            <a className="button button-primary" href={directions} target="_blank" rel="noreferrer">NAVIGATE NOW <ArrowUpRight size={15} /></a>
          </div>
          <p className="place-source">{place.source}</p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
