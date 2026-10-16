"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

const signals = [
  { label: "FOODIE", color: "#ec4899", icon: "F" },
  { label: "PARTY", color: "#8b5cf6", icon: "P" },
  { label: "HACKATHONS", color: "#06b6d4", icon: "H" },
  { label: "CHILL", color: "#b7f36b", icon: "C" },
];
const messages = ["TUNING IN...", "LOCATING SYDNEY SIGNALS...", "RADAR READY"];

export default function SplashScreen({ onStart }: { onStart: () => void }) {
  const [signalIndex, setSignalIndex] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const signalTimer = window.setInterval(() => setSignalIndex((value) => (value + 1) % signals.length), 720);
    const messageTimer = window.setInterval(() => setMessageIndex((value) => Math.min(value + 1, messages.length - 1)), 1500);
    return () => {
      window.clearInterval(signalTimer);
      window.clearInterval(messageTimer);
    };
  }, []);

  const signal = signals[signalIndex];
  return (
    <motion.div className="splash-screen" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.45 }}>
      <div className="splash-dots" />
      <motion.section className="splash-panel" initial={{ y: 24, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 140, damping: 16 }}>
        <p className="eyebrow">SYDNEY / FIELD GUIDE 01</p>
        <h1 className="splash-title">FIND<br /><span>TONY</span></h1>
        <p className="splash-copy">Find your people. Find your place.<br />Get out there.</p>
        <div className="kinetic-row">
          <AnimatePresence mode="wait">
            <motion.div
              key={signal.label}
              className="kinetic-badge"
              style={{ backgroundColor: signal.color }}
              initial={{ rotate: -18, scale: 0.55, y: 16 }}
              animate={{ rotate: 0, scale: 1, y: 0 }}
              exit={{ rotate: 20, scale: 0.6, y: -14 }}
              transition={{ type: "spring", stiffness: 260, damping: 14 }}
            >
              <span>{signal.icon}</span>
            </motion.div>
          </AnimatePresence>
          <div>
            <span className="eyebrow">SIGNAL DETECTED</span>
            <AnimatePresence mode="wait">
              <motion.strong key={signal.label} className="kinetic-label" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                {signal.label}
              </motion.strong>
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={messageIndex} className="splash-status" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <Zap size={13} fill="currentColor" /> {messages[messageIndex]}
          </motion.p>
        </AnimatePresence>
        <button className="button button-primary initialize-button" onClick={onStart}>
          FIND YOUR SPOT <span aria-hidden="true">→</span>
        </button>
        <p className="splash-footnote">A student-built map of the city in motion.</p>
      </motion.section>
    </motion.div>
  );
}
