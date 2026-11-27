'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { describedBy, Field, Input } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import type { FormState } from '../sign-in/actions';

export function NameForm({ action, next, initial, submitLabel }: { action: (s: FormState, f: FormData) => Promise<FormState>; next?: string | null; initial?: string | null; submitLabel?: string }) {
  const t = useTranslations('onboarding');
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field id="name" label={t('nameLabel')} error={state?.error}>
        <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={60} defaultValue={state?.values?.name ?? initial ?? ''}
          aria-invalid={Boolean(state?.error)} aria-describedby={describedBy('name', false, state?.error)} />
      </Field>
      <SubmitButton size="lg">{submitLabel ?? t('continue')}</SubmitButton>
    </form>
  );
}
