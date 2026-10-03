"use client";

import { useEffect } from "react";

// Registers the service worker (app-shell cache + notification click handling).
// Production only: in `next dev` a cached shell fights hot reload.
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* unsupported context — app works without it */ });
  }, []);
  return null;
}
