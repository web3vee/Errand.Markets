'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field, Input, Notice } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import type { SimpleState } from './actions';

export function PriceForm({ action, version, initial, symbol }: { action: (s: SimpleState, f: FormData) => Promise<SimpleState>; version: number; initial: string; symbol: string }) {
  const t = useTranslations('errands');
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <input type="hidden" name="version" value={version} />
      <Field id="price" label={`${t('editPrice')} (${symbol})`} error={state?.error} className="w-44">
        <Input id="price" name="price" inputMode="decimal" defaultValue={initial} dir="ltr" className="text-start tabular-nums" aria-invalid={Boolean(state?.error)} />
      </Field>
      <SubmitButton variant="secondary">{t('savePrice')}</SubmitButton>
      {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
    </form>
  );
}
