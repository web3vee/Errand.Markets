import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { listHeldErrands, reviewHeldErrand } from '@/modules/errands/service';
import { defaultDb, getMarketById, requireAdmin } from '@/server/context';
import { onReviewed } from '@/server/workflows';
import { Notice, Textarea } from '@/ui/forms/fields';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { localized } from '@/lib/localized-text';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('adminErrands.title') };
}

async function decide(locale: string, errandId: string, form: FormData) {
  'use server';
  const { account, scope } = await requireAdmin('ops');
  const decision = form.get('decision') === 'reject' ? 'reject' : 'clear';
  const note = String(form.get('note') ?? '').trim().slice(0, 500) || null;
  const r = await reviewHeldErrand(defaultDb(), { adminId: account.id, adminScope: scope, errandId, decision, note });
  await onReviewed(r, errandId);
  redirect(`/${locale}/admin/errands?done=1`);
}

export default async function HeldErrands({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ done?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { session } = await requireAdmin('ops');
  const t = await getTranslations();
  const format = await getFormatter();
  const rows = await listHeldErrands(defaultDb(), session.claims); // RLS: admin's markets only
  return (
    <Container className="max-w-[48rem] py-10">
      <h1 className="text-h1">{t('adminErrands.title')}</h1>
      {(await searchParams).done ? <div className="mt-4"><Notice tone="success">{t('adminErrands.done')}</Notice></div> : null}
      {rows.length === 0 ? <p className="mt-8 text-body text-ink-2">{t('adminErrands.empty')}</p> : (
        <ul className="mt-8 border-b border-line">
          {await Promise.all(rows.map(async (r) => {
            const m = await getMarketById(r.marketId);
            return (
              <li key={r.id} className="border-t border-line py-5">
                <p className="text-small text-ink-3">{m ? localized(m.name, locale) : ''} · {format.dateTime(r.createdAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: m?.timezone })}</p>
                <p className="mt-1 font-medium">{r.title}</p>
                <p className="mt-1 whitespace-pre-line text-small text-ink-2">{r.description}</p>
                <p className="mt-2 text-small text-danger">{t('adminErrands.matched', { note: r.reviewNote ?? '' })}</p>
                <form action={decide.bind(null, locale, r.id)} className="mt-3 flex flex-col gap-3">
                  <label className="flex flex-col gap-1.5 text-small">{t('adminErrands.note')}<Textarea name="note" maxLength={500} className="min-h-16" /></label>
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" name="decision" value="clear" variant="secondary">{t('adminErrands.clear')}</Button>
                    <Button type="submit" name="decision" value="reject" variant="ghost">{t('adminErrands.reject')}</Button>
                  </div>
                </form>
              </li>
            );
          }))}
        </ul>
      )}
    </Container>
  );
}
