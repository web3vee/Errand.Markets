'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { describedBy, Field, Input, Notice } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import type { FormState } from './actions';

export function PhoneForm({ action, next, example }: { action: (s: FormState, f: FormData) => Promise<FormState>; next: string | null; example: string }) {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field id="phone" label={t('phoneLabel')} hint={t('phoneHint', { example })} error={state?.error}>
        <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={state?.values?.phone}
          aria-invalid={Boolean(state?.error)} aria-describedby={describedBy('phone', true, state?.error)} dir="ltr" className="text-start" />
      </Field>
      <SubmitButton size="lg">{t('sendCode')}</SubmitButton>
    </form>
  );
}

export function CodeForm({ action, resend }: { action: (s: FormState, f: FormData) => Promise<FormState>; resend: (s: FormState) => Promise<FormState> }) {
  const t = useTranslations('auth');
  const [state, formAction] = useActionState(action, null);
  const [resendState, resendAction] = useActionState(resend, null);
  return (
    <>
      <form action={formAction} className="mt-8 flex flex-col gap-5" noValidate>
        <Field id="code" label={t('codeLabel')} error={state?.error}>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
            aria-invalid={Boolean(state?.error)} aria-describedby={describedBy('code', false, state?.error)} dir="ltr"
            className="text-start text-h3 tracking-[0.3em] tabular-nums" />
        </Field>
        <SubmitButton size="lg">{t('verify')}</SubmitButton>
      </form>
      <form action={resendAction} className="mt-4">
        <SubmitButton variant="ghost">{t('resend')}</SubmitButton>
      </form>
      {resendState?.error ? <div className="mt-2"><Notice tone="danger">{resendState.error}</Notice></div> : null}
    </>
  );
}
