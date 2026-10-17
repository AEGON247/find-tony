"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then(({ DotLottieReact: player }) => player),
  { ssr: false },
);

const animationDataCache = new Map<string, Promise<ArrayBuffer>>();

function loadAnimationData(src: string) {
  const cached = animationDataCache.get(src);
  if (cached) return cached;

  const request = fetch(src, { cache: "force-cache" }).then((response) => {
    if (!response.ok) throw new Error(`Could not load map animation (${response.status}).`);
    return response.arrayBuffer();
  });
  animationDataCache.set(src, request);
  void request.catch(() => {
    if (animationDataCache.get(src) === request) animationDataCache.delete(src);
  });
  return request;
}

interface MapLoaderProps {
  label: string;
  compact?: boolean;
}

export default function MapLoader({ label, compact = false }: MapLoaderProps) {
  const src = "/icons/map.lottie";
  const [animation, setAnimation] = useState<{ src: string; data: ArrayBuffer }>();

  useEffect(() => {
    let active = true;
    setAnimation(undefined);
    loadAnimationData(src)
      .then((data) => {
        if (active) setAnimation({ src, data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) console.warn("[Map animation] Could not load the Lottie asset.", error);
      });
    return () => {
      active = false;
    };
  }, [src]);

  return (
    <div className={`map-loading-indicator${compact ? " map-loading-indicator--compact" : ""}`} role="status">
      {animation?.src === src ? (
        <DotLottieReact
          data={animation.data}
          autoplay
          loop
          aria-hidden="true"
          style={{ width: compact ? 40 : 112, height: compact ? 40 : 112 }}
        />
      ) : (
        <span
          className="map-loading-animation-placeholder"
          style={{ width: compact ? 40 : 112, height: compact ? 40 : 112 }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </div>
  );
}
