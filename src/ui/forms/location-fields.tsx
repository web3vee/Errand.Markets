'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { areaContaining, type AreaGeometry } from '@/modules/errands/domain/geo';
import { Field, Input, Select, Textarea } from './fields';

export type AreaOption = { id: string; name: string; boundary: AreaGeometry | null };
export type LocationValue = {
  serviceAreaId: string; lat: number | null; lng: number | null; pinSource: 'area_center' | 'device' | 'map';
  landmark: string; contactName: string; contactPhone: string; instructions: string;
};
export const emptyLocation = (): LocationValue => ({ serviceAreaId: '', lat: null, lng: null, pinSource: 'area_center', landmark: '', contactName: '', contactPhone: '', instructions: '' });

/**
 * Map pin + landmark + contact. Without a maps key the pin comes from the device's location
 * (checked against our service-area boundaries) or defaults to the area centre; the landmark
 * note carries the real directions, as is normal in both launch markets.
 */
export function LocationFields({ id, value, onChange, areas }: { id: string; value: LocationValue; onChange: (v: LocationValue) => void; areas: AreaOption[] }) {
  const t = useTranslations('post');
  const [geo, setGeo] = useState<'idle' | 'busy' | 'set' | 'outside' | 'denied'>(value.pinSource === 'device' ? 'set' : 'idle');
  const set = (patch: Partial<LocationValue>) => onChange({ ...value, ...patch });

  const locate = () => {
    if (!('geolocation' in navigator)) return setGeo('denied');
    setGeo('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const area = areaContaining(p, areas);
        if (!area) { setGeo('outside'); return; }
        set({ serviceAreaId: area.id, lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), pinSource: 'device' });
        setGeo('set');
      },
      () => setGeo('denied'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Field id={`${id}-area`} label={t('area')} hint={t('areaHint')}>
        <Select id={`${id}-area`} value={value.serviceAreaId} required aria-describedby={`${id}-area-hint`}
          onChange={(e) => { set({ serviceAreaId: e.target.value, lat: null, lng: null, pinSource: 'area_center' }); setGeo('idle'); }}>
          <option value="">—</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={locate} className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-4 text-small font-medium hover:bg-sunken">
          {geo === 'busy' ? t('locating') : t('useLocation')}
        </button>
        <p role="status" className="text-small text-ink-3">
          {geo === 'set' ? t('locationSet') : geo === 'outside' ? t('locationOutside') : geo === 'denied' ? t('locationDenied') : ''}
        </p>
      </div>
      <Field id={`${id}-landmark`} label={t('landmark')} hint={t('landmarkHint')}>
        <Textarea id={`${id}-landmark`} value={value.landmark} onChange={(e) => set({ landmark: e.target.value })} required minLength={3} maxLength={200}
          className="min-h-20" aria-describedby={`${id}-landmark-hint`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-cname`} label={t('contactName')}><Input id={`${id}-cname`} value={value.contactName} maxLength={60} onChange={(e) => set({ contactName: e.target.value })} /></Field>
        <Field id={`${id}-cphone`} label={t('contactPhone')}><Input id={`${id}-cphone`} type="tel" inputMode="tel" dir="ltr" className="text-start" value={value.contactPhone} maxLength={32} onChange={(e) => set({ contactPhone: e.target.value })} /></Field>
      </div>
    </div>
  );
}
