'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { Field, Input, Notice } from '@/ui/forms/fields';
import { uploadImage } from '@/ui/forms/image-upload';
import { SubmitButton } from '@/ui/forms/submit-button';
import { Button } from '@/ui/primitives/button';
import type { CompleteState } from './fulfil-actions';

type Photo = { id: string; preview: string };

/** One photo slot group (proof or receipt): uploads right away, keeps the ids in hidden fields. */
function PhotoPicker({ name, kind, label, hint, onBusy }: { name: string; kind: 'proof' | 'receipt'; label: string; hint: string; onBusy: (b: boolean) => void }) {
  const t = useTranslations('fulfil');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = `${name}-file`;
  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true); onBusy(true); setError(null);
    const r = await uploadImage(file, kind);
    setBusy(false); onBusy(false);
    if (input.current) input.current.value = '';
    if ('error' in r) { setError(t('errors.upload_failed')); return; }
    setPhotos((p) => [...p, { id: r.id, preview: URL.createObjectURL(file) }]);
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-small font-medium">{label}</legend>
      <p className="text-small text-ink-3">{hint}</p>
      {photos.length ? (
        <ul className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <li key={p.id} className="flex flex-col items-start gap-1">
              <input type="hidden" name={name} value={p.id} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="size-24 rounded-md border border-line object-cover" />
              <button type="button" className="min-h-11 text-small underline" onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}>{t('removePhoto')}</button>
            </li>
          ))}
        </ul>
      ) : null}
      <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files)} data-testid={`${name}-input`} />
      {photos.length < 6 ? (
        <Button type="button" variant="secondary" className="self-start" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? t('uploading') : t('addPhoto')}
        </Button>
      ) : null}
      {error ? <p role="alert" className="text-small text-danger">{error}</p> : null}
    </fieldset>
  );
}

export function CompleteForm({ action, requiresPurchase, estimateLabel, symbol }: {
  action: (s: CompleteState, f: FormData) => Promise<CompleteState>; requiresPurchase: boolean; estimateLabel: string; symbol: string;
}) {
  const t = useTranslations('fulfil');
  const [state, formAction] = useActionState(action, null);
  const [uploads, setUploads] = useState(0);
  const onBusy = (b: boolean) => setUploads((n) => n + (b ? 1 : -1));
  return (
    <form action={formAction} className="flex flex-col gap-6" aria-labelledby="complete-h">
      <h3 id="complete-h" className="text-h3">{t('completeTitle')}</h3>
      <PhotoPicker name="proof" kind="proof" label={t('proof')} hint={t('proofHelp')} onBusy={onBusy} />
      {requiresPurchase ? (
        <>
          <PhotoPicker name="receipt" kind="receipt" label={t('receipt')} hint={t('receiptHelp')} onBusy={onBusy} />
          <Field id="spent" label={`${t('spent')} (${symbol})`} hint={t('spentHelp', { amount: estimateLabel })} className="w-56">
            <Input id="spent" name="spent" inputMode="decimal" dir="ltr" className="text-start tabular-nums" />
          </Field>
        </>
      ) : null}
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <SubmitButton size="lg" className="self-start" disabled={uploads > 0}>{t('complete')}</SubmitButton>
    </form>
  );
}
