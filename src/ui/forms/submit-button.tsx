'use client';

import { useFormStatus } from 'react-dom';
import type { ComponentProps } from 'react';
import { Button } from '@/ui/primitives/button';

/** Disables itself while the form's server action runs (prevents double submits). */
export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" aria-disabled={pending} disabled={pending || props.disabled} {...props}>
      {children}
    </Button>
  );
}
