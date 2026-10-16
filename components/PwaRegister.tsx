"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error: unknown) => console.error("PWA service worker registration failed.", error));
  }, []);
  return null;
}
