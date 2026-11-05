"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // Public dealership websites have no staff alerts to receive.
    if (document.querySelector("[data-storefront]")) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Install stays optional if the browser rejects registration.
    });
  }, []);

  return null;
}
