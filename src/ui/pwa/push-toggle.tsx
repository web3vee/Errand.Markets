'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives/button';

const b64ToBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Opt in/out of push on this device. Requires VAPID public key; otherwise explains (sandbox). */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = useTranslations('notificationsPage');
  const [state, setState] = useState<'loading' | 'unsupported' | 'denied' | 'off' | 'on'>('loading');
  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setState('unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);
  if (!vapidPublicKey) return <p className="text-small text-ink-3">{t('pushNotConfigured')}</p>;
  if (state === 'unsupported') return <p className="text-small text-ink-3">{t('pushUnsupported')}</p>;
  if (state === 'denied') return <p className="text-small text-ink-3">{t('pushDenied')}</p>;
  const on = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublicKey) });
    const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
    setState(res.ok ? 'on' : 'off');
  };
  const off = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState('off');
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === 'on' ? <><span className="text-small text-ink-2">{t('pushEnabled')}</span><Button variant="ghost" onClick={off}>{t('pushOff')}</Button></> : <Button variant="secondary" onClick={on} disabled={state === 'loading'}>{t('pushOn')}</Button>}
    </div>
  );
}
