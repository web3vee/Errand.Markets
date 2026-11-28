import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { maskPhone } from '@/lib/phone';
import { listReviews } from '@/modules/kyc/service';
import { marketSource } from '@/modules/markets/source';
import { defaultDb, requireAdmin } from '@/server/context';
import { Select } from '@/ui/forms/fields';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { localized } from '@/lib/localized-text';

const STATUSES = ['in_review', 'pending', 'resubmission_required', 'approved', 'rejected'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('admin.runnersTitle') };
}

export default async function RunnerReviews({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ market?: string; status?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { session, scope } = await requireAdmin('ops');
  const t = await getTranslations();
  const format = await getFormatter();
  const sp = await searchParams;
  const all = await marketSource().list();
  const visible = all.filter((m) => scope === 'all' || scope.includes(m.id!));
  const marketFilter = visible.find((m) => m.slug === sp.market);
  const status = STATUSES.includes(sp.status as never) ? sp.status! : sp.status === 'all' ? 'all' : 'in_review';
  const rows = await listReviews(defaultDb(), session.claims, {
    marketIds: marketFilter ? [marketFilter.id!] : scope,
    statuses: status === 'all' ? [] : [status],
  });
  const byId = new Map(all.map((m) => [m.id, m]));
  return (
    <Container className="py-10">
      <h1 className="text-h1">{t('admin.runnersTitle')}</h1>
      <p className="mt-2 text-small text-ink-3">
        {scope === 'all' ? t('admin.scopeAll') : t('admin.scope', { markets: format.list(visible.map((m) => localized(m.name, locale))) })}
      </p>
      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1.5 text-small font-medium">{t('admin.filters.market')}
          <Select name="market" defaultValue={marketFilter?.slug ?? ''} className="w-48">
            <option value="">{t('admin.filters.all')}</option>
            {visible.map((m) => <option key={m.slug} value={m.slug}>{localized(m.name, locale)}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-small font-medium">{t('admin.filters.status')}
          <Select name="status" defaultValue={status} className="w-56">
            <option value="all">{t('admin.filters.all')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`statuses.${s}`)}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="secondary">{t('admin.filters.apply')}</Button>
      </form>

      {rows.length === 0 ? <p className="mt-10 text-body text-ink-2">{t('admin.empty')}</p> : (<>
        {/* Phones: one card per Runner, so status and flags are visible without sideways scrolling. */}
        <ul className="mt-8 border-t border-line md:hidden">
          {rows.map((r) => {
            const m = byId.get(r.marketId);
            const flags = ((r.summary as { flags?: string[] } | null)?.flags ?? []);
            return (
              <li key={r.verificationId} className="border-b border-line">
                <Link href={`/${locale}/admin/runners/${r.verificationId}`} className="flex flex-col gap-1 py-4 text-small">
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink underline-offset-2">{r.displayName ?? '—'}</span>
                      <span dir="ltr" className="text-ink-3">{maskPhone(r.phoneE164)}</span>
                    </span>
                    <Badge tone={r.runnerStatus === 'in_review' ? 'accent' : 'neutral'}>{t(`statuses.${r.runnerStatus}`)}</Badge>
                  </span>
                  <span className="text-ink-2">
                    {m ? localized(m.name, locale) : '—'}
                    {r.submittedAt && m ? <> · <span className="tabular-nums">{format.dateTime(r.submittedAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: m.timezone })}</span></> : null}
                  </span>
                  <span className="text-ink-3">
                    {t('admin.columns.flags')}: {flags.length ? <span className="text-ink">{flags.map((f) => t(`admin.flagNames.${f}`)).join(', ')}</span> : t('admin.none')}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[44rem] border-collapse text-start text-small">
            <thead>
              <tr className="border-b border-line-strong text-ink-3">
                <th scope="col" className="py-3 pe-4 text-start font-medium">{t('admin.columns.runner')}</th>
                <th scope="col" className="py-3 pe-4 text-start font-medium">{t('admin.columns.market')}</th>
                <th scope="col" className="py-3 pe-4 text-start font-medium">{t('admin.columns.submitted')}</th>
                <th scope="col" className="py-3 pe-4 text-start font-medium">{t('admin.columns.status')}</th>
                <th scope="col" className="py-3 text-start font-medium">{t('admin.columns.flags')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = byId.get(r.marketId);
                const flags = ((r.summary as { flags?: string[] } | null)?.flags ?? []);
                return (
                  <tr key={r.verificationId} className="border-b border-line">
                    <td className="py-2 pe-4">
                      <Link href={`/${locale}/admin/runners/${r.verificationId}`} className="inline-flex min-h-11 flex-col justify-center underline-offset-2 hover:underline">
                        <span className="font-medium text-ink">{r.displayName ?? '—'}</span>
                        <span dir="ltr" className="text-ink-3">{maskPhone(r.phoneE164)}</span>
                      </Link>
                    </td>
                    <td className="py-2 pe-4">{m ? localized(m.name, locale) : '—'}</td>
                    <td className="py-2 pe-4 tabular-nums">{r.submittedAt && m ? format.dateTime(r.submittedAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: m.timezone }) : '—'}</td>
                    <td className="py-2 pe-4"><Badge tone={r.runnerStatus === 'in_review' ? 'accent' : 'neutral'}>{t(`statuses.${r.runnerStatus}`)}</Badge></td>
                    <td className="py-2">{flags.length ? flags.map((f) => t(`admin.flagNames.${f}`)).join(', ') : <span className="text-ink-3">{t('admin.none')}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}
    </Container>
  );
}

// Per-request: depends on the signed-in admin (never prerender).
export const dynamic = 'force-dynamic';
