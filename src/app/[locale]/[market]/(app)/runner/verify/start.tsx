'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Notice } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import { KycLauncher } from '@/ui/kyc/launcher';
import type { KycStartState } from '../actions';

export function StartVerification({ action, label, locale, doneHref }: { action: (s: KycStartState) => Promise<KycStartState>; label: string; locale: string; doneHref: string }) {
  const t = useTranslations('runnerOnboarding');
  const [state, formAction] = useActionState(action, null);
  if (state?.launch && state.launch.kind !== 'url') return <KycLauncher launch={state.launch} locale={locale} onDoneHref={doneHref} />;
  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <SubmitButton size="lg" className="self-start">{label}</SubmitButton>
      <span className="sr-only">{t('verifyLead')}</span>
    </form>
  );
}
