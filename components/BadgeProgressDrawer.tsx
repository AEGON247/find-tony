"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { Check, X } from "lucide-react";
import { useEffect } from "react";
import type { BadgeProgress } from "@/config/badges";

interface BadgeProgressDrawerProps {
  open: boolean;
  badges: BadgeProgress[];
  onClose: () => void;
}

export default function BadgeProgressDrawer({ open, badges, onClose }: BadgeProgressDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="badge-progress-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.aside
            className="badge-progress-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="badge-progress-title"
            aria-describedby="badge-progress-intro"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
          >
            <button className="badge-progress-close" type="button" aria-label="Close badge progress" onClick={onClose}>
              <X size={19} />
            </button>
            <p className="eyebrow">YOUR FIELD GUIDE</p>
            <h2 id="badge-progress-title">BADGE QUESTS</h2>
            <p className="badge-progress-intro" id="badge-progress-intro">
              Every badge shows what counts, how close you are, and any alternate way to earn it.
            </p>
            <div className="badge-progress-list">
              {badges.map(({ definition, progress, unlocked, progressLabel }) => {
                const percentage = Math.min(100, Math.round((progress / definition.questTarget) * 100));
                return (
                  <article className={`badge-progress-card${unlocked ? " is-earned" : ""}`} key={definition.id}>
                    <Image
                      className="badge-progress-icon"
                      src={definition.iconPath}
                      alt=""
                      width={72}
                      height={72}
                      unoptimized
                    />
                    <div className="badge-progress-content">
                      <div className="badge-progress-heading">
                        <div>
                          <span className="badge-progress-category">{definition.category}</span>
                          <h3>{definition.title}</h3>
                        </div>
                        {unlocked && <span className="badge-progress-earned"><Check size={12} /> EARNED</span>}
                      </div>
                      <p className="badge-progress-task">{definition.description}</p>
                      <div className="badge-progress-meter" aria-label={`${definition.title} progress`}>
                        <div
                          className="badge-progress-meter__fill"
                          role="progressbar"
                          aria-label={`${definition.title} completion`}
                          aria-valuemin={0}
                          aria-valuemax={definition.questTarget}
                          aria-valuenow={progress}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="badge-progress-label">
                        {progressLabel}
                        {!unlocked && percentage === 100 && <span> · AWARD PENDING</span>}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
