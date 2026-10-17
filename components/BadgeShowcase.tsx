"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef, useState } from "react";
import type { BadgeProgress } from "@/config/badges";

export default function BadgeShowcase({ badges }: { badges: BadgeProgress[] }) {
  const carousel = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<BadgeProgress>();

  function scroll(direction: -1 | 1) {
    carousel.current?.scrollBy({ left: direction * 220, behavior: "smooth" });
  }

  return (
    <section className="badge-showcase" aria-labelledby="badge-showcase-title">
      <div className="badge-showcase__header">
        <div>
          <p className="eyebrow">FIELD ACHIEVEMENTS</p>
          <h3 id="badge-showcase-title">BADGE CASE <span>{badges.length}</span></h3>
        </div>
        {badges.length > 1 && (
          <div className="badge-showcase__controls">
            <button type="button" aria-label="Scroll badges left" onClick={() => scroll(-1)}><ChevronLeft size={16} /></button>
            <button type="button" aria-label="Scroll badges right" onClick={() => scroll(1)}><ChevronRight size={16} /></button>
          </div>
        )}
      </div>
      {badges.length === 0 ? (
        <p className="badge-showcase__empty">No badges yet. Complete a side quest to earn your first.</p>
      ) : (
        <div className="badge-showcase__carousel" ref={carousel} aria-label="Earned badges">
          {badges.map(({ definition, progress }) => (
            <button
              className="badge-card"
              type="button"
              key={definition.id}
              onClick={() => setSelected({
                definition,
                progress,
                unlocked: true,
                progressLabel: `${progress}/${definition.questTarget} progress`,
              })}
              aria-label={`${definition.title}, earned. View quest details.`}
            >
              <span className="badge-card__icon">
                <Image src={definition.iconPath} alt="" fill unoptimized sizes="68px" />
              </span>
              <span className="badge-card__title">{definition.title}</span>
              <span className="badge-card__earned"><Check size={12} /> EARNED</span>
            </button>
          ))}
        </div>
      )}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="badge-detail-overlay"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelected(undefined);
            }}
          >
            <motion.section
              className="badge-detail-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="badge-detail-title"
              initial={{ y: 18, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 12, scale: 0.98 }}
            >
              <button className="badge-detail-close" type="button" aria-label="Close badge details" onClick={() => setSelected(undefined)}>
                <X size={18} />
              </button>
              <Image className="badge-detail-icon" src={selected.definition.iconPath} alt="" width={120} height={120} unoptimized />
              <p className="eyebrow">SIDE QUEST COMPLETE</p>
              <h3 id="badge-detail-title">{selected.definition.title}</h3>
              <p>{selected.definition.description}</p>
              <div className="badge-detail-progress">
                <span>{selected.progress}/{selected.definition.questTarget} PROGRESS</span>
                <span>BADGE EARNED</span>
              </div>
              <button className="button button-primary badge-detail-action" type="button" onClick={() => setSelected(undefined)}>
                NICE ONE
              </button>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
