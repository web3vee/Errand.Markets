import { cn } from '@/lib/cn';
import { MARK_PATH, MARK_VIEWBOX } from './mark-path';

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={cn('h-6 w-auto', className)} fill="currentColor" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/** Mark + wordmark. The wordmark is live text (crisp, translatable, ~0 bytes). Logo is never mirrored in RTL. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-ink', className)} dir="ltr">
      <LogoMark className="h-[1.375rem]" />
      <span className="hidden text-[1.0625rem] font-semibold tracking-[-0.02em] min-[360px]:inline">
        errand<span className="text-ink-3">.markets</span>
      </span>
    </span>
  );
}
