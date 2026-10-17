"use client";

let heading = 0;
let trackingStarted = false;
const listeners = new Set<() => void>();

function updateHeading(event: DeviceOrientationEvent) {
  const compassEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
  const angle = typeof compassEvent.webkitCompassHeading === "number"
    ? compassEvent.webkitCompassHeading
    : typeof event.alpha === "number"
      ? (360 - event.alpha + (screen.orientation?.angle ?? 0)) % 360
      : null;
  if (angle === null || angle === heading) return;
  heading = angle;
  listeners.forEach((listener) => listener());
}

export function startDeviceHeadingTracking() {
  if (trackingStarted || typeof window === "undefined") return;
  trackingStarted = true;
  window.addEventListener("deviceorientation", updateHeading);
}

export function subscribeDeviceHeading(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDeviceHeading() {
  return heading;
}
