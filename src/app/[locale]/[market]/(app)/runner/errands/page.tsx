import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { browseOpenErrands } from '@/modules/errands/service';
import { defaultDb } from '@/server/context';
import { money } from '@/server/format';
import { requireVerifiedRunner } from '@/server/runner-guard';
import { Select } from '@/ui/forms/fields';
import { Notice } from '@/ui/forms/fields';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('runnerMarket.title') };
}

export default async function FindErrands({ params, searchParams }: { params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ areas?: string; category?: string; before?: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { account, market, verified } = await requireVerifiedRunner(locale, slug, `/${locale}/${slug}/runner/errands`);
  const t = await getTranslations();
  const format = await getFormatter();
  if (!verified) {
    return (
      <Container className="max-w-[40rem] py-12">
        <h1 className="text-h1">{t('runnerMarket.title')}</h1>
        <div className="mt-6"><Notice>{t('runnerMarket.notVerified')}</Notice></div>
        <Button asChild className="mt-6"><Link href={`/${locale}/${slug}/runner/verify`}>{t('runnerMarket.verifyCta')}</Link></Button>
      </Container>
    );
  }
  const sp = await searchParams;
  const allAreas = sp.areas === 'all';
  const category = market.categories.find((c) => c.key === sp.category)?.key ?? null;
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : null;
  const rows = await browseOpenErrands(defaultDb(), account.id, { marketId: market.id, allAreas, categoryKey: category, before });
  const noAreas = !allAreas && account.runner!.serviceAreaIds.length === 0;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(allAreas ? { areas: 'all' } : {}), ...(category ? { category } : {}), ...extra }).toString();
  return (
    <Container className="max-w-[48rem] py-12">
      <h1 className="text-h1">{t('runnerMarket.title')}</h1>
      <p className="mt-3 text-body text-ink-2">{t('runnerMarket.lead')}</p>
      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-small font-medium">{t('runnerMarket.filters.areas')}
          <Select name="areas" defaultValue={allAreas ? 'all' : 'mine'} className="w-44">
            <option value="mine">{t('runnerMarket.filters.mine')}</option><option value="all">{t('runnerMarket.filters.all')}</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-small font-medium">{t('runnerMarket.filters.category')}
          <Select name="category" defaultValue={category ?? ''} className="w-48">
            <option value="">{t('runnerMarket.filters.any')}</option>
            {market.categories.filter((c) => c.active).map((c) => <option key={c.key} value={c.key}>{t(c.nameKey)}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="secondary">{t('runnerMarket.filters.apply')}</Button>
      </form>
      {noAreas ? <p className="mt-10 text-body text-ink-2">{t('runnerMarket.noAreas')}</p> : rows.length === 0 ? <p className="mt-10 text-body text-ink-2">{t('runnerMarket.empty')}</p> : (
        <ul className="mt-8 border-b border-line" data-testid="open-errands">
          {rows.map((r) => (
            <li key={r.id} className="border-t border-line">
              <Link href={`/${locale}/${slug}/runner/errands/${r.id}`} className="flex min-h-20 items-center justify-between gap-4 py-4 hover:bg-sunken">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="block text-small text-ink-3">{t(r.categoryNameKey)} · {r.areaNameKeys.map((k) => t(k)).join(' → ')}</span>
                  {r.publishedAt ? <span className="block text-small text-ink-3">{t('runnerMarket.posted', { when: format.relativeTime(r.publishedAt) })}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-h3 tabular-nums">{money(market, r.priceMinor, true)}</span>
                  {r.requiresPurchase ? <span className="text-micro text-ink-3">{t('runnerMarket.itemsEstimate', { amount: money(market, r.itemEstimateMinor, true) })}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 20 && rows.at(-1)?.publishedAt ? (
        <Button asChild variant="ghost" className="mt-6"><Link href={`?${qs({ before: rows.at(-1)!.publishedAt!.toISOString() })}`}>{t('runnerMarket.more')}</Link></Button>
      ) : null}
    </Container>
  );
}
