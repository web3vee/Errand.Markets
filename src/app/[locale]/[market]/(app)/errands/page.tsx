import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { listCustomerErrands } from '@/modules/errands/service';
import { defaultDb, requireAccount } from '@/server/context';
import { money } from '@/server/format';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('errands.title') };
}

const GROUPS = {
  drafts: ['draft'],
  active: ['open', 'offer_accepted', 'funded', 'in_progress', 'completed_pending_confirmation', 'disputed'],
  past: ['confirmed', 'paid_out', 'cancelled', 'refunded', 'expired'],
} as const;

export default async function MyErrands({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { session, market } = await requireAccount(locale, slug, `/${locale}/${slug}/errands`);
  const t = await getTranslations();
  const format = await getFormatter();
  const rows = await listCustomerErrands(defaultDb(), session.claims);
  return (
    <Container className="max-w-[48rem] py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h1">{t('errands.title')}</h1>
        <Button asChild><Link href={`/${locale}/${slug}/errands/new`}>{t('errands.new')}</Link></Button>
      </div>
      {rows.length === 0 ? <p className="mt-10 text-body text-ink-2">{t('errands.empty')}</p> : null}
      {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((g) => {
        const list = rows.filter((r) => (GROUPS[g] as readonly string[]).includes(r.status));
        if (!list.length) return null;
        return (
          <section key={g} className="mt-10" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`} className="text-small font-medium text-ink-3">{t(`errands.${g}`)}</h2>
            <ul className="mt-2 border-b border-line">
              {list.map((r) => (
                <li key={r.id} className="border-t border-line">
                  <Link href={`/${locale}/${slug}/errands/${r.id}`} className="flex min-h-16 items-center justify-between gap-4 py-3 hover:bg-sunken">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="block text-small text-ink-3">{format.dateTime(r.createdAt, { dateStyle: 'medium', timeZone: market.timezone })}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tabular-nums">{money(market, r.priceMinor, true)}</span>
                      <Badge tone={r.status === 'open' ? 'accent' : 'neutral'}>{r.reviewState === 'pending_review' ? t('errandStatus.pending_review') : t(`errandStatus.${r.status}`)}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Container>
  );
}
