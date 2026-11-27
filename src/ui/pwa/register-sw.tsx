'use client';

import { useEffect } from 'react';

/** Registers the service worker (offline fallback + push). No-op where unsupported. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
