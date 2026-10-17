"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { X } from "lucide-react";
import type { BadgeDefinition } from "@/config/badges";

interface BadgeAwardOverlayProps {
  badge?: BadgeDefinition;
  onClose: () => void;
}

export default function BadgeAwardOverlay({ badge, onClose }: BadgeAwardOverlayProps) {
  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          className="badge-award-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            className="badge-award-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="badge-award-title"
            initial={{ opacity: 0, y: 28, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 210, damping: 20 }}
          >
            <button className="badge-award-close" type="button" aria-label="Close badge announcement" onClick={onClose}>
              <X size={19} />
            </button>
            <Image className="badge-award-icon" src={badge.iconPath} alt="" width={168} height={168} unoptimized />
            <p className="badge-award-eyebrow">NEW BADGE UNLOCKED</p>
            <h2 id="badge-award-title">CONGRATULATIONS!</h2>
            <p className="badge-award-copy">You are awarded the <strong>{badge.title}</strong> badge.</p>
            <button className="button button-primary badge-award-action" type="button" onClick={onClose}>
              SHOW IT OFF
            </button>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
