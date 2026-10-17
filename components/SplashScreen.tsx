"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface SplashScreenProps {
  onStart: () => void;
}

export default function SplashScreen({ onStart }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sliderRef = useRef<HTMLButtonElement>(null);
  const pointerStart = useRef<{ id: number; x: number; offset: number; type: string } | undefined>(undefined);
  const revealTimer = useRef<number | undefined>(undefined);
  const launchTimer = useRef<number | undefined>(undefined);
  const [videoFinished, setVideoFinished] = useState(false);
  const [slideOffset, setSlideOffset] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const revealLaunch = () => {
      if (revealTimer.current !== undefined) window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(() => setVideoFinished(true), 1000);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
      revealLaunch();
    } else {
      void video.play().catch(revealLaunch);
    }

    return () => {
      if (revealTimer.current !== undefined) window.clearTimeout(revealTimer.current);
      if (launchTimer.current !== undefined) window.clearTimeout(launchTimer.current);
    };
  }, []);

  function finishVideo() {
    if (revealTimer.current !== undefined) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setVideoFinished(true), 1000);
  }

  function completeLaunch() {
    if (launchTimer.current !== undefined) window.clearTimeout(launchTimer.current);
    const maximum = (sliderRef.current?.clientWidth ?? 0) - 58;
    setIsCompleting(true);
    setSlideOffset(Math.max(0, maximum));
    launchTimer.current = window.setTimeout(onStart, 240);
  }

  function resetSlider() {
    pointerStart.current = undefined;
    setIsCompleting(false);
    setSlideOffset(0);
  }

  function updateSlide(clientX: number) {
    const track = sliderRef.current;
    const drag = pointerStart.current;
    if (!track || !drag) return 0;
    const maximum = track.clientWidth - 58;
    const offset = Math.min(maximum, Math.max(0, drag.offset + clientX - drag.x));
    setSlideOffset(offset);
    return maximum > 0 ? offset / maximum : 0;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!videoFinished) return;
    if (launchTimer.current !== undefined) window.clearTimeout(launchTimer.current);
    setIsCompleting(false);
    event.preventDefault();
    sliderRef.current?.setPointerCapture(event.pointerId);
    pointerStart.current = {
      id: event.pointerId,
      x: event.clientX,
      offset: slideOffset,
      type: event.pointerType,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointerStart.current?.id !== event.pointerId) return;
    updateSlide(event.clientX);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = pointerStart.current;
    if (!drag || drag.id !== event.pointerId) return;
    const progress = updateSlide(event.clientX);
    pointerStart.current = undefined;

    if (drag.type !== "touch" || progress >= 0.72) {
      completeLaunch();
      return;
    }
    setIsCompleting(true);
    setSlideOffset(0);
  }

  return (
    <motion.div
      className="splash-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.4 }}
    >
      <div className="splash-video-frame">
        <video
          ref={videoRef}
          className="splash-video"
          src="/splash.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={finishVideo}
          onError={finishVideo}
          aria-label="Find Tony animated splash screen"
        />
      </div>
      {videoFinished && (
        <motion.button
          ref={sliderRef}
          className={`splash-launch${isCompleting ? " is-completing" : ""}`}
          type="button"
          aria-label="Slide to find your spot on mobile, or click to continue"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={resetSlider}
          onLostPointerCapture={() => {
            if (pointerStart.current) resetSlider();
          }}
          onClick={(event) => {
            if (event.detail === 0) completeLaunch();
          }}
        >
          <span className="splash-launch-label">Find your spot !</span>
          <span
            className="splash-launch-knob"
            style={{ transform: `translateX(${slideOffset}px)` }}
            aria-hidden="true"
          >
            <ArrowRight size={28} strokeWidth={1.8} />
          </span>
        </motion.button>
      )}
    </motion.div>
  );
}
