'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { formatMoney } from '@/lib/money';
import { Checkbox, Field, Input, Notice, Radio, Select, Textarea } from '@/ui/forms/fields';
import { uploadImage } from '@/ui/forms/image-upload';
import { emptyLocation, LocationFields, type AreaOption, type LocationValue } from '@/ui/forms/location-fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import { parseAmountToMinor } from '@/modules/errands/domain/amount';
import { deserializeFees, PriceSummary, rateLabel, type SerializedFees } from '@/ui/pricing/price-summary';
import type { RoundingMode } from '@/modules/pricing/domain/quote';
import type { PostState } from './actions';

type Category = { key: string; name: string; description: string; purchaseAllowed: boolean };
type Props = {
  action: (s: PostState, f: FormData) => Promise<PostState>;
  categories: Category[]; areas: AreaOption[]; currencyCode: string; currencySymbol: string; minPriceLabel: string | null;
  timezoneLabel: string; initialCategory: string | null; formatLocale: string; minorUnit: number;
  fees: SerializedFees; rounding: RoundingMode; displaySymbol: string | null;
};
type Item = { name: string; qty: number; price: string };

export function PostErrandForm(p: Props) {
  const t = useTranslations('post');
  const tp = useTranslations('pricing');
  const [state, formAction] = useActionState(p.action, null);
  const [priceInput, setPriceInput] = useState('');
  const [categoryKey, setCategoryKey] = useState(p.initialCategory ?? '');
  const category = p.categories.find((c) => c.key === categoryKey);
  const [buying, setBuying] = useState(false);
  const [items, setItems] = useState<Item[]>([{ name: '', qty: 1, price: '' }]);
  const [hasPickup, setHasPickup] = useState(false);
  const [pickupKind, setPickupKind] = useState<'pickup' | 'purchase' | 'collect'>('pickup');
  const [pickup, setPickup] = useState<LocationValue>(emptyLocation());
  const [dropoff, setDropoff] = useState<LocationValue>(emptyLocation());
  const [windowKind, setWindowKind] = useState<'asap' | 'by_time'>('asap');
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [publish, setPublish] = useState(true);
  const requiresPurchase = buying && !!category?.purchaseAllowed;


  const priceMinor = parseAmountToMinor(priceInput, p.minorUnit, p.formatLocale) ?? 0n;
  const itemsMinor = requiresPurchase
    ? items.reduce((s, i) => s + (parseAmountToMinor(i.price, p.minorUnit, p.formatLocale) ?? 0n) * BigInt(i.qty), 0n) : 0n;
  const fees = deserializeFees(p.fees);

  const toStop = (kind: string, v: LocationValue) => ({
    kind, serviceAreaId: v.serviceAreaId, lat: v.lat, lng: v.lng, pinSource: v.pinSource, landmark: v.landmark,
    contactName: v.contactName || null, contactPhone: v.contactPhone || null, instructions: v.instructions || null,
  });

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || photos.length >= 3) return;
    setUploading(true); setUploadError(null);
    const r = await uploadImage(file, 'errand_reference');
    setUploading(false);
    if ('error' in r) setUploadError(t('errors.upload'));
    else setPhotos((ps) => [...ps, { id: r.id, url: URL.createObjectURL(file) }]);
  };

  const buildPayload = (form: HTMLFormElement) => JSON.stringify({
    categoryKey,
    title: (form.elements.namedItem('title') as HTMLInputElement).value,
    description: (form.elements.namedItem('description') as HTMLTextAreaElement).value,
    requiresPurchase,
    items: requiresPurchase ? items.filter((i) => i.name.trim()) : [],
    stops: [...(hasPickup ? [toStop(pickupKind, pickup)] : []), toStop('dropoff', dropoff)],
    price: (form.elements.namedItem('price') as HTMLInputElement).value,
    windowKind,
    windowLocal: windowKind === 'by_time' ? (form.elements.namedItem('windowLocal') as HTMLInputElement).value : null,
    mediaIds: photos.map((ph) => ph.id),
    publish,
  });

  return (
    <form
      action={formAction}
      onSubmit={(e) => { (e.currentTarget.elements.namedItem('payload') as HTMLInputElement).value = buildPayload(e.currentTarget); }}
      className="mt-8 flex flex-col gap-10"
    >
      <input type="hidden" name="payload" />
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <fieldset>
        <legend className="text-h3">{t('category')}</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {p.categories.map((c) => (
            <Radio key={c.key} name="category" value={c.key} checked={categoryKey === c.key} onChange={() => setCategoryKey(c.key)} required
              label={<span><span className="block font-medium">{c.name}</span><span className="block text-small text-ink-3">{c.description}</span></span>}
              className="items-start py-3" />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-5">
        <Field id="title" label={t('titleLabel')} hint={t('titleHint')}><Input id="title" name="title" required minLength={3} maxLength={80} aria-describedby="title-hint" /></Field>
        <Field id="description" label={t('description')} hint={t('descriptionHint')}><Textarea id="description" name="description" maxLength={2000} aria-describedby="description-hint" /></Field>
      </div>

      {category?.purchaseAllowed ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="sr-only">{t('items')}</legend>
          <Checkbox checked={buying} onChange={(e) => setBuying(e.target.checked)} label={t('buying')} />
          {buying ? (
            <>
              <p className="text-small text-ink-3">{t('itemsHint')}</p>
              <ul className="flex flex-col gap-3">
                {items.map((it, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_9rem_auto] sm:items-end">
                    <Field id={`item-${i}-name`} label={t('itemName')}><Input id={`item-${i}-name`} value={it.name} maxLength={80} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
                    <Field id={`item-${i}-qty`} label={t('itemQty')}><Input id={`item-${i}-qty`} type="number" min={1} max={999} inputMode="numeric" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} /></Field>
                    <Field id={`item-${i}-price`} label={`${t('itemPrice')} (${p.currencySymbol})`} className="col-span-2 sm:col-span-1"><Input id={`item-${i}-price`} inputMode="decimal" dir="ltr" className="text-start" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} /></Field>
                    {items.length > 1 ? <button type="button" className="min-h-11 rounded-md px-3 text-small text-ink-2 underline hover:text-ink" onClick={() => setItems(items.filter((_, j) => j !== i))}>{t('removeItem')}</button> : <span />}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 text-small font-medium hover:bg-sunken" onClick={() => setItems([...items, { name: '', qty: 1, price: '' }])}>{t('addItem')}</button>
                <p className="text-small text-ink-2" aria-live="polite">{t('itemTotal', { amount: formatMoney(itemsMinor, { code: p.currencyCode, minorUnit: p.minorUnit, displaySymbol: p.displaySymbol }, p.formatLocale) })}</p>
              </div>
            </>
          ) : null}
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="text-h3">{t('pickupTitle')}</legend>
        <Checkbox checked={hasPickup} onChange={(e) => setHasPickup(e.target.checked)} label={t('pickupToggle')} />
        {hasPickup ? (
          <>
            <Field id="pickup-kind" label={t('pickupKind')}>
              <Select id="pickup-kind" value={pickupKind} onChange={(e) => setPickupKind(e.target.value as typeof pickupKind)}>
                <option value="pickup">{t('pickupKindPickup')}</option>
                {requiresPurchase ? <option value="purchase">{t('pickupKindPurchase')}</option> : null}
                <option value="collect">{t('pickupKindCollect')}</option>
              </Select>
            </Field>
            <LocationFields id="pickup" value={pickup} onChange={setPickup} areas={p.areas} />
          </>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-h3">{t('dropoffTitle')}</legend>
        <LocationFields id="dropoff" value={dropoff} onChange={setDropoff} areas={p.areas} />
      </fieldset>

      <div className="flex flex-col gap-5">
        <Field id="price" label={`${t('price')} (${p.currencySymbol})`} hint={<>{t('priceHint', { code: p.currencyCode, rate: rateLabel(p.fees.serviceFeeBps, p.formatLocale) })}{p.minPriceLabel ? ` ${t('priceMin', { amount: p.minPriceLabel })}` : ''}</>}>
          <div className="flex items-stretch">
            <span className="inline-flex items-center rounded-s-md border border-e-0 border-line-strong bg-sunken px-3 text-small text-ink-2" aria-hidden>{p.currencySymbol}</span>
            <Input id="price" name="price" inputMode="decimal" required dir="ltr" className="rounded-s-none text-start text-h3 tabular-nums" aria-describedby="price-hint"
              value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
          </div>
        </Field>
        <div aria-live="polite">
          <PriceSummary testId="post-summary" errandFeeMinor={priceMinor} itemEstimateMinor={itemsMinor} fees={fees} rounding={p.rounding} formatLocale={p.formatLocale}
            currency={{ code: p.currencyCode, minorUnit: p.minorUnit, displaySymbol: p.displaySymbol }}
            labels={{ title: tp('title'), errandFee: tp('errandFee'), serviceFee: tp('serviceFee', { rate: rateLabel(p.fees.serviceFeeBps, p.formatLocale) }), items: tp('items'), total: tp('total'), note: tp('whenPaid') }} />
        </div>
        <fieldset>
          <legend className="text-small font-medium">{t('when')}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Radio name="windowKind" value="asap" checked={windowKind === 'asap'} onChange={() => setWindowKind('asap')} label={t('asap')} />
            <Radio name="windowKind" value="by_time" checked={windowKind === 'by_time'} onChange={() => setWindowKind('by_time')} label={t('byTime')} />
          </div>
          {windowKind === 'by_time' ? (
            <Field id="windowLocal" label={t('byTimeLabel', { tz: p.timezoneLabel })} className="mt-3 max-w-[18rem]"><Input id="windowLocal" name="windowLocal" type="datetime-local" required /></Field>
          ) : null}
        </fieldset>
      </div>

      <div>
        <p className="text-small font-medium">{t('photos')}</p>
        <p className="mt-1 text-small text-ink-3">{t('photosHint')}</p>
        <ul className="mt-3 flex flex-wrap gap-3">
          {photos.map((ph) => (
            <li key={ph.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt="" className="size-24 rounded-md border border-line object-cover" />
              <button type="button" onClick={() => setPhotos(photos.filter((x) => x.id !== ph.id))} className="mt-1 min-h-11 text-small underline">{t('removePhoto')}</button>
            </li>
          ))}
        </ul>
        {photos.length < 3 ? (
          <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line-strong px-4 text-small font-medium hover:bg-sunken focus-within:outline-2 focus-within:outline-focus">
            {uploading ? t('uploading') : t('addPhoto')}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={onPhoto} disabled={uploading} />
          </label>
        ) : null}
        {uploadError ? <p role="alert" className="mt-2 text-small text-danger">{uploadError}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <SubmitButton size="lg" onClick={() => setPublish(true)} disabled={uploading}>{t('submit')}</SubmitButton>
        <SubmitButton size="lg" variant="ghost" onClick={() => setPublish(false)} disabled={uploading}>{t('saveDraft')}</SubmitButton>
      </div>
    </form>
  );
}
