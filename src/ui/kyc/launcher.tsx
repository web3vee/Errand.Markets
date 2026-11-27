'use client';

import { useEffect, useRef } from 'react';
import type { KycLaunch } from '@/providers/types';

/**
 * Embeds the provider's verification UI. Sandbox uses a plain redirect (handled server-side).
 * UNVERIFIED: the Sumsub WebSDK and Dojah widget calls follow their public SDKs as I know them
 * and must be checked with real sandbox keys. Scripts load only when that provider is used.
 */
function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function KycLauncher({ launch, locale, onDoneHref }: { launch: Exclude<KycLaunch, { kind: 'url' }>; locale: string; onDoneHref: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (launch.kind === 'sumsub_sdk') {
        await loadScript('https://static.sumsub.com/idensic/static/sns-websdk-builder.js');
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sdk = (window as any).snsWebSdk;
        sdk.init(launch.token, async () => launch.token)
          .withConf({ lang: locale.split('-')[0] })
          .on('idCheck.onApplicantSubmitted', () => { window.location.href = onDoneHref; })
          .build().launch('#kyc-container');
      } else {
        await loadScript('https://widget.dojah.io/widget.js');
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Connect = (window as any).Connect;
        const c = launch.config;
        const connect = new Connect({
          app_id: c.appId, p_key: c.publicKey, widget_id: c.widgetId, type: 'custom', reference_id: c.referenceId,
          metadata: { reference_id: c.referenceId },
          onSuccess: () => { window.location.href = onDoneHref; }, onError: () => {}, onClose: () => {},
        });
        connect.setup(); connect.open();
      }
    })().catch((e) => console.error(e));
    return () => { cancelled = true; };
  }, [launch, locale, onDoneHref]);
  return <div id="kyc-container" ref={ref} className="mt-8 min-h-[32rem]" />;
}
