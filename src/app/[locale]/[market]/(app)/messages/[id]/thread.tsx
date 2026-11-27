'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Notice, Textarea } from '@/ui/forms/fields';
import { uploadImage } from '@/ui/forms/image-upload';
import { SubmitButton } from '@/ui/forms/submit-button';
import type { SendState } from '../actions';

type Msg = { id: string; senderId: string; body: string; mediaId: string | null; createdAt: string };

/**
 * Live thread. Uses polling (every 4 s while visible) as the transport; when Supabase Realtime is
 * configured the same component can subscribe to the private `conversation:<id>` channel instead.
 */
export function Thread({ conversationId, me, initial, readOnly, action, names, timeZone, locale }: {
  conversationId: string; me: string; initial: Msg[]; readOnly: boolean; action: (s: SendState, f: FormData) => Promise<SendState>;
  names: Record<string, string>; timeZone: string; locale: string;
}) {
  const t = useTranslations('chat');
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [closed, setClosed] = useState(readOnly);
  const [state, formAction] = useActionState(action, null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const last = msgs.at(-1)?.id ?? null;

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const res = await fetch(`/api/conversations/${conversationId}/messages${last ? `?after=${last}` : ''}`, { cache: 'no-store' }).catch(() => null);
      if (!res?.ok || stop) return;
      const json = (await res.json()) as { status: string; messages: Msg[] };
      if (json.messages.length) setMsgs((m) => [...m, ...json.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      setClosed(json.status !== 'open');
    };
    const h = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(h); };
  }, [conversationId, last]);

  useEffect(() => {
    if (state?.sentAt) { formRef.current?.reset(); setMediaId(null); }
  }, [state?.sentAt]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const fmt = new Intl.DateTimeFormat(locale, { timeStyle: 'short', dateStyle: 'short', timeZone });
  return (
    <>
      <ol className="mt-6 flex flex-col gap-3" aria-live="polite" aria-relevant="additions" data-testid="messages">
        {msgs.map((m) => {
          const mine = m.senderId === me;
          return (
            <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] rounded-lg border px-3 py-2 ${mine ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                <p className="sr-only">{mine ? t('you') : names[m.senderId]}:</p>
                {m.body ? <p className="whitespace-pre-line text-body">{m.body}</p> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.mediaId ? <a href={`/api/media/${m.mediaId}`}><img src={`/api/media/${m.mediaId}`} alt={t('photo')} loading="lazy" className="mt-1 max-h-60 rounded-md" /></a> : null}
              </div>
              <span className="mt-0.5 text-micro text-ink-3">{fmt.format(new Date(m.createdAt))}</span>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
      {closed ? <div className="mt-6"><Notice>{t('readOnly')}</Notice></div> : (
        <form ref={formRef} action={formAction} className="sticky bottom-0 mt-6 flex flex-col gap-2 border-t border-line bg-bg py-3">
          {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
          <input type="hidden" name="mediaId" value={mediaId ?? ''} />
          <label htmlFor="body" className="sr-only">{t('placeholder')}</label>
          <Textarea id="body" name="body" maxLength={2000} placeholder={t('placeholder')} className="min-h-14" />
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-small underline focus-within:outline-2 focus-within:outline-focus">
              {uploading ? '…' : mediaId ? `✓ ${t('photo')}` : t('attach')}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                setUploading(true);
                const r = await uploadImage(f, 'message_photo');
                setUploading(false);
                if ('id' in r) setMediaId(r.id);
              }} />
            </label>
            <SubmitButton disabled={uploading}>{t('send')}</SubmitButton>
          </div>
        </form>
      )}
    </>
  );
}
