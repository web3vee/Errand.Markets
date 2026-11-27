'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Checkbox, Field, Input, Notice, Radio, Textarea } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import type { FormState } from '../../sign-in/actions';

type Props = {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  areas: { id: string; name: string }[];
  initial: { bio: string | null; vehicle: string; areaIds: string[]; emergencyName: string | null; emergencyPhone: string | null };
};

export function RunnerProfileForm({ action, areas, initial }: Props) {
  const t = useTranslations('runnerOnboarding');
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-8 flex flex-col gap-8">
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <fieldset>
        <legend className="text-small font-medium">{t('areas')}</legend>
        <p className="mt-1 text-small text-ink-3">{t('areasHint')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {areas.map((a) => <Checkbox key={a.id} name="areas" value={a.id} defaultChecked={initial.areaIds.includes(a.id)} label={a.name} />)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-small font-medium">{t('vehicle')}</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(['none', 'bicycle', 'motorbike', 'car'] as const).map((v) => (
            <Radio key={v} name="vehicle" value={v} defaultChecked={initial.vehicle === v} label={t(`vehicles.${v}`)} required />
          ))}
        </div>
      </fieldset>
      <Field id="bio" label={t('bio')} hint={t('bioHint')}>
        <Textarea id="bio" name="bio" maxLength={280} defaultValue={initial.bio ?? ''} aria-describedby="bio-hint" />
      </Field>
      <fieldset className="flex flex-col gap-4">
        <legend className="text-small font-medium">{t('emergencyTitle')}</legend>
        <Field id="emergencyName" label={t('emergencyName')}><Input id="emergencyName" name="emergencyName" maxLength={60} defaultValue={initial.emergencyName ?? ''} autoComplete="off" /></Field>
        <Field id="emergencyPhone" label={t('emergencyPhone')}><Input id="emergencyPhone" name="emergencyPhone" type="tel" inputMode="tel" dir="ltr" className="text-start" defaultValue={initial.emergencyPhone ?? ''} /></Field>
      </fieldset>
      <SubmitButton size="lg">{t('save')}</SubmitButton>
    </form>
  );
}
