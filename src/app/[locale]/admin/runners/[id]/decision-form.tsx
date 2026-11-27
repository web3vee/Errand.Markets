'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Field, Notice, Radio, Select, Textarea } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import type { DecisionState } from '../../actions';

export function DecisionForm({ action, allowed, reasons }: { action: (s: DecisionState, f: FormData) => Promise<DecisionState>; allowed: string[]; reasons: readonly string[] }) {
  const t = useTranslations('admin');
  const [state, formAction] = useActionState(action, null);
  const label = { approve: t('approve'), reject: t('reject'), request_resubmission: t('requestResubmission') } as Record<string, string>;
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <fieldset>
        <legend className="text-small font-medium">{t('decision')}</legend>
        <div className="mt-2 grid gap-2">{allowed.map((d, i) => <Radio key={d} name="decision" value={d} defaultChecked={i === 0} label={label[d]} required />)}</div>
      </fieldset>
      <Field id="reasonCode" label={t('reason')}>
        <Select id="reasonCode" name="reasonCode" defaultValue="">
          <option value="">—</option>
          {reasons.map((r) => <option key={r} value={r}>{t(`reasons.${r}`)}</option>)}
        </Select>
      </Field>
      <Field id="note" label={t('note')}><Textarea id="note" name="note" maxLength={500} /></Field>
      <SubmitButton size="lg" variant="ink" className="self-start">{t('submit')}</SubmitButton>
    </form>
  );
}
