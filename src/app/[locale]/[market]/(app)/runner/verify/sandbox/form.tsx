'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Checkbox, Field, Input, Notice, Select } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import type { FormState } from '../../../sign-in/actions';

export function SandboxKycForm({ action, verificationId, docTypes, defaultName }: { action: (s: FormState, f: FormData) => Promise<FormState>; verificationId: string; docTypes: string[]; defaultName: string }) {
  const t = useTranslations('sandbox');
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="verificationId" value={verificationId} />
      <Field id="outcome" label={t('outcome')}>
        <Select id="outcome" name="outcome" defaultValue="approved">
          {(['approved', 'rejected', 'needs_resubmission'] as const).map((o) => <option key={o} value={o}>{t(`outcomes.${o}`)}</option>)}
        </Select>
      </Field>
      <Field id="docType" label={t('docType')}>
        <Select id="docType" name="docType">{docTypes.map((d) => <option key={d} value={d}>{t(`docTypes.${d}`)}</option>)}</Select>
      </Field>
      <Field id="idNumber" label={t('idNumber')}><Input id="idNumber" name="idNumber" defaultValue="12345678901" required dir="ltr" className="text-start" /></Field>
      <Field id="docName" label={t('name')}><Input id="docName" name="docName" defaultValue={defaultName} required /></Field>
      <Field id="dob" label={t('dob')}><Input id="dob" name="dob" type="date" defaultValue="1995-06-15" required /></Field>
      <Checkbox name="liveness" defaultChecked label={t('liveness')} />
      <SubmitButton size="lg">{t('submit')}</SubmitButton>
    </form>
  );
}
