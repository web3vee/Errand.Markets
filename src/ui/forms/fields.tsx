import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Form field with label, hint and error wired up for screen readers (aria-describedby / aria-invalid). */
export function Field({ id, label, hint, error, children, className }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-small font-medium text-ink">{label}</label>
      {children}
      {hint ? <p id={`${id}-hint`} className="text-small text-ink-3">{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="text-small text-danger">{error}</p> : null}
    </div>
  );
}

export const describedBy = (id: string, hint?: unknown, error?: unknown) =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;

const control = 'min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-ink-3 aria-[invalid=true]:border-danger focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-60';

export function Input({ className, ...p }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(control, className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn(control, 'min-h-24 py-2.5', className)} {...p} />;
}
export function Select({ className, ...p }: ComponentPropsWithoutRef<'select'>) {
  return <select className={cn(control, 'appearance-auto pe-8', className)} {...p} />;
}
export function Checkbox({ label, className, ...p }: ComponentPropsWithoutRef<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3 text-body hover:bg-sunken has-[:checked]:border-accent has-[:checked]:bg-accent-soft', className)}>
      <input type="checkbox" className="size-4 accent-[var(--accent)]" {...p} />
      <span>{label}</span>
    </label>
  );
}
export function Radio({ label, className, ...p }: ComponentPropsWithoutRef<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3 text-body hover:bg-sunken has-[:checked]:border-accent has-[:checked]:bg-accent-soft', className)}>
      <input type="radio" className="size-4 accent-[var(--accent)]" {...p} />
      <span>{label}</span>
    </label>
  );
}

export function Notice({ tone = 'neutral', title, children }: { tone?: 'neutral' | 'success' | 'danger' | 'sandbox'; title?: ReactNode; children: ReactNode }) {
  const tones = {
    neutral: 'border-line bg-surface',
    success: 'border-accent bg-accent-soft',
    danger: 'border-danger bg-surface',
    sandbox: 'border-dashed border-line-strong bg-sunken',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-md border px-4 py-3 text-small text-ink-2', tones[tone])}>
      {title ? <p className="font-medium text-ink">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}
