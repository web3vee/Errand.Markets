import { cn } from '@/lib/cn';

export function SectionHeading({ eyebrow, title, lead, id, className }: { eyebrow: string; title: string; lead?: string; id?: string; className?: string }) {
  return (
    <div className={cn('max-w-[40rem]', className)}>
      <p className="text-small font-medium text-accent-text">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-h2 text-balance">{title}</h2>
      {lead ? <p className="mt-4 text-lead text-ink-2 text-pretty">{lead}</p> : null}
    </div>
  );
}
