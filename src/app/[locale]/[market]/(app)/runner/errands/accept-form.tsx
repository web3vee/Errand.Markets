'use client';

import { useActionState } from 'react';
import { Notice } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import type { AcceptState } from './actions';

export function AcceptForm({ action, priceMinor, label }: { action: (s: AcceptState, f: FormData) => Promise<AcceptState>; priceMinor: string; label: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* The exact price the Runner saw; if the customer changed it meanwhile, the accept is refused. */}
      <input type="hidden" name="price" value={priceMinor} />
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <SubmitButton size="lg">{label}</SubmitButton>
    </form>
  );
}
