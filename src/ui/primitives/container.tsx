import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

/** Page gutter: 16px on phones, growing with the viewport. Max width keeps line lengths readable. */
export function Container({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[72rem] px-4 sm:px-6 lg:px-8', className)} {...props} />;
}
