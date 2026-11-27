import Link from 'next/link';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { maskPhone } from '@/lib/phone';
import { allowedDecisions, REJECT_REASONS, type VerificationStatus } from '@/modules/kyc/domain/rules';
import { getReview } from '@/modules/kyc/service';
import { defaultDb, getMarketById, requireAdmin } from '@/server/context';
import { Notice } from '@/ui/forms/fields';
import { Badge } from '@/ui/primitives/badge';
import { Container } from '@/ui/primitives/container';
import { decideAction } from '../../actions';
import { DecisionForm } from './decision-form';

type Summary = { checks?: { kind: string; passed: boolean }[]; documentType?: string | null; nameOnDocument?: string | null; ageYears?: number | null; flags?: string[] };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('admin.detailTitle') };
}

export default async function ReviewRunner({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { session } = await requireAdmin('ops');
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await getReview(defaultDb(), session.claims, id); // RLS: only rows in the admin's markets
  if (!r) notFound();
  const market = await getMarketById(r.marketId);
  const t = await getTranslations();
  const format = await getFormatter();
  const s = (r.summary ?? {}) as Summary;
  const allowed = allowedDecisions(r.status as VerificationStatus);
  const row = 'grid gap-1 border-t border-line py-3 sm:grid-cols-[12rem_1fr] sm:gap-6';
  return (
    <Container className="max-w-[52rem] py-10">
      <Link href={`/${locale}/admin/runners`} className="inline-flex min-h-11 items-center text-small underline">{t('admin.back')}</Link>
      <h1 className="mt-2 text-h1">{r.displayName ?? '—'}</h1>
      <p className="mt-1 text-small text-ink-3"><span dir="ltr">{maskPhone(r.phoneE164)}</span> · {market ? t(market.nameKey) : ''}</p>
      {(await searchParams).saved ? <div className="mt-6"><Notice tone="success">{t('admin.decided')}</Notice></div> : null}
      <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_18rem]">
        <dl className="border-b border-line">
          <div className={row}><dt className="text-small text-ink-3">{t('admin.columns.status')}</dt><dd className="flex gap-2"><Badge tone="accent">{t(`statuses.${r.runnerStatus}`)}</Badge><span className="text-small text-ink-3">{t(`verificationStatuses.${r.status}`)}</span></dd></div>
          <div className={row}><dt className="text-small text-ink-3">{t('admin.provider')}</dt><dd>{r.provider}</dd></div>
          <div className={row}><dt className="text-small text-ink-3">{t('admin.columns.submitted')}</dt><dd className="tabular-nums">{r.submittedAt && market ? format.dateTime(r.submittedAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: market.timezone }) : '—'}</dd></div>
          <div className={row}><dt className="text-small text-ink-3">{t('admin.document')}</dt><dd>{s.documentType ? t(`kycDocTypes.${s.documentType}`) : '—'}</dd></div>
          <div className={row}><dt className="text-small text-ink-3">{t('admin.nameOnDocument')}</dt><dd>{s.nameOnDocument ?? '—'}</dd></div>
          <div className={row}><dt className="text-small text-ink-3">{t('admin.age')}</dt><dd className="tabular-nums">{s.ageYears ?? '—'}</dd></div>
          <div className={row}><dt className="text-small text-ink-3">{t('admin.checks')}</dt>
            <dd><ul className="flex flex-col gap-1">{(s.checks ?? []).map((c) => (
              <li key={c.kind} className="flex justify-between gap-4"><span>{t(`admin.checkNames.${c.kind}`)}</span><span className={c.passed ? 'text-accent-text' : 'text-danger'}>{c.passed ? t('admin.passed') : t('admin.failed')}</span></li>
            ))}</ul></dd></div>
          <div className={row}><dt className="text-small text-ink-3">{t('admin.flagsTitle')}</dt>
            <dd>{s.flags?.length ? <ul className="flex flex-col gap-1">{s.flags.map((f) => <li key={f} className="text-danger">{t(`admin.flagNames.${f}`)}</li>)}</ul> : <span className="text-ink-3">{t('admin.none')}</span>}</dd></div>
          {r.reviewedAt ? <div className={row}><dt className="text-small text-ink-3">{t('admin.decision')}</dt><dd>{t('admin.reviewed', { when: format.dateTime(r.reviewedAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: market?.timezone }), reason: r.reviewReasonCode ? t(`admin.reasons.${r.reviewReasonCode}`) : '—' })}{r.reviewNote ? <p className="mt-1 text-small text-ink-2">{r.reviewNote}</p> : null}</dd></div> : null}
        </dl>
        <section aria-label={t('admin.decision')}>
          {allowed.length ? <DecisionForm action={decideAction.bind(null, locale, r.verificationId)} allowed={allowed} reasons={REJECT_REASONS} /> : <p className="text-small text-ink-3">{t('admin.notAllowed')}</p>}
        </section>
      </div>
    </Container>
  );
}

// Per-request: depends on the signed-in admin (never prerender).
export const dynamic = 'force-dynamic';
