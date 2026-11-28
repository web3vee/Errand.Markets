import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { listDisputes } from '@/modules/errands/fulfilment';
import { participantNames } from '@/modules/messaging/service';
import { defaultDb, getMarketById, requireAdmin } from '@/server/context';
import { Select } from '@/ui/forms/fields';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('adminDisputes.title') };
}

const STATUSES = ['open', 'resolved', 'all'] as const;

export default async function Disputes({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { session, scope } = await requireAdmin('ops');
  const t = await getTranslations();
  const format = await getFormatter();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as never) ? (sp.status as (typeof STATUSES)[number]) : 'open';
  const rows = await listDisputes(defaultDb(), session.claims, { status, marketIds: scope }); // RLS: admin's markets only
  const names = await participantNames(defaultDb(), rows.map((r) => r.d.raisedBy));
  return (
    <Container className="max-w-[48rem] py-10">
      <h1 className="text-h1">{t('adminDisputes.title')}</h1>
      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1.5 text-small font-medium">{t('adminDisputes.status')}
          <Select name="status" defaultValue={status} className="w-48">
            {STATUSES.map((s) => <option key={s} value={s}>{t(`adminDisputes.statuses.${s}`)}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="secondary">{t('admin.filters.apply')}</Button>
      </form>
      {rows.length === 0 ? <p className="mt-10 text-body text-ink-2">{t('adminDisputes.empty')}</p> : (
        <ul className="mt-8 border-t border-line" data-testid="disputes">
          {await Promise.all(rows.map(async ({ d, title }) => {
            const m = await getMarketById(d.marketId);
            return (
              <li key={d.id} className="border-b border-line">
                <Link href={`/${locale}/admin/disputes/${d.id}`} className="flex flex-col gap-1 py-4 text-small hover:bg-sunken">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-medium text-ink">{title}</span>
                    <Badge tone={d.status === 'open' ? 'accent' : 'neutral'}>{t(`adminDisputes.statuses.${d.status}`)}</Badge>
                  </span>
                  <span className="text-ink-2">{t(`fulfil.reasons.${d.reasonCode}` as never)} · {t('adminDisputes.raisedBy', { role: t(`adminDisputes.roles.${d.raisedRole}`) })} ({names.get(d.raisedBy)})</span>
                  <span className="text-ink-3">{m ? t(m.nameKey) : ''} · <span className="tabular-nums">{format.dateTime(d.createdAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: m?.timezone })}</span></span>
                </Link>
              </li>
            );
          }))}
        </ul>
      )}
    </Container>
  );
}
