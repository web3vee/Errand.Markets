import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium',
    'transition-[background-color,border-color,color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:pointer-events-none disabled:opacity-50 select-none',
  ],
  {
    variants: {
      variant: {
        /** The single accent-coloured action on a screen. */
        primary: 'bg-accent text-accent-ink hover:bg-[color-mix(in_oklab,var(--accent),var(--ink)_14%)]',
        /** Strong neutral action. */
        ink: 'bg-ink text-bg hover:bg-[color-mix(in_oklab,var(--ink),var(--bg)_16%)]',
        secondary: 'border border-line-strong bg-transparent text-ink hover:bg-sunken',
        ghost: 'bg-transparent text-ink hover:bg-sunken',
      },
      size: {
        // All sizes keep a ≥44px tap target.
        md: 'min-h-11 px-4 text-body',
        lg: 'min-h-12 px-5 text-body',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = ComponentPropsWithoutRef<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
