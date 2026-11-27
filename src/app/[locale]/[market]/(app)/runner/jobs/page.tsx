import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listRunnerJobs } from '@/modules/errands/service';
import { defaultDb } from '@/server/context';
import { money } from '@/server/format';
import { requireVerifiedRunner } from '@/server/runner-guard';
import { Badge } from '@/ui/primitives/badge';
import { Container } from '@/ui/primitives/container';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('runnerMarket.jobsTitle') };
}

export default async function MyJobs({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { session, market } = await requireVerifiedRunner(locale, slug, `/${locale}/${slug}/runner/jobs`);
  const t = await getTranslations();
  const rows = await listRunnerJobs(defaultDb(), session.claims);
  return (
    <Container className="max-w-[48rem] py-12">
      <h1 className="text-h1">{t('runnerMarket.jobsTitle')}</h1>
      {rows.length === 0 ? <p className="mt-8 text-body text-ink-2">{t('runnerMarket.jobsEmpty')}</p> : (
        <ul className="mt-8 border-b border-line">
          {rows.map((r) => (
            <li key={r.id} className="border-t border-line">
              <Link href={`/${locale}/${slug}/errands/${r.id}`} className="flex min-h-16 items-center justify-between gap-4 py-3 hover:bg-sunken">
                <span className="truncate font-medium">{r.title}</span>
                <span className="flex shrink-0 flex-col items-end gap-1"><span className="tabular-nums">{money(market, r.priceMinor, true)}</span><Badge>{t(`errandStatus.${r.status}`)}</Badge></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
