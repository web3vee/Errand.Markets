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

/** Google's "G" mark, per Google's sign-in branding guidelines (unaltered colours). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/** "Continue with Google" — a plain form so it works without JavaScript. */
export function GoogleButton({ action }: { action: () => Promise<void> }) {
  const t = useTranslations('auth.google');
  return (
    <form action={action}>
      <SubmitButton size="lg" variant="secondary" className="w-full gap-3">
        <GoogleMark />
        {t('continue')}
      </SubmitButton>
    </form>
  );
}

export function SandboxGoogleForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const t = useTranslations('auth.google');
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5" noValidate>
      <Field id="email" label={t('sandboxEmail')} error={state?.error}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email}
          aria-invalid={Boolean(state?.error)} aria-describedby={describedBy('email', false, state?.error)} dir="ltr" className="text-start" />
      </Field>
      <Field id="name" label={t('sandboxName')}>
        <Input id="name" name="name" autoComplete="name" maxLength={60} defaultValue={state?.values?.name} />
      </Field>
      <SubmitButton size="lg">{t('sandboxSubmit')}</SubmitButton>
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
