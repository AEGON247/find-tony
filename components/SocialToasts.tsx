"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Sparkles, X } from "lucide-react";
import { useSocial } from "@/context/SocialContext";

export default function SocialToasts() {
  const { toasts, dismissToast, openChat } = useSocial();
  return (
    <div className="social-toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className="social-toast"
            initial={{ y: -24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>{toast.text}</span>
            {toast.chatId && (
              <button className="social-toast__open" onClick={() => { openChat(toast.chatId!); dismissToast(toast.id); }}>
                <MessageCircle size={13} aria-hidden="true" /> CHAT
              </button>
            )}
            <button className="social-toast__close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification"><X size={14} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
