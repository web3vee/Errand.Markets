import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-micro font-medium', {
  variants: {
    tone: {
      neutral: 'bg-sunken text-ink-2',
      accent: 'bg-accent-soft text-accent-text',
      outline: 'border border-line text-ink-2',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: ComponentPropsWithoutRef<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
