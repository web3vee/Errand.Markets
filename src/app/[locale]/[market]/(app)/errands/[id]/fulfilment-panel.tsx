import { getFormatter, getTranslations } from 'next-intl/server';
import { currencySymbol } from '@/lib/money';
import type { MarketRecord } from '@/modules/markets/source';
import { DISPUTABLE_STATUSES, DISPUTE_REASONS, itemDifferenceMinor, ratingWindowEnds, ratingWindowOpen } from '@/modules/errands/domain/fulfilment';
import type { errands, disputes, ratings } from '../../../../../../../db/schema';
import { money } from '@/server/format';
import { Notice, Radio, Select, Textarea } from '@/ui/forms/fields';
import { SubmitButton } from '@/ui/forms/submit-button';
import { CompleteForm } from './complete-form';
import {
  cancelAction, completeAction, confirmAction, disputeAction, rateAction, sandboxPayAction, startAction, withdrawAction,
} from './fulfil-actions';

type Errand = typeof errands.$inferSelect;
type Dispute = typeof disputes.$inferSelect;
type Rating = typeof ratings.$inferSelect;
type Market = MarketRecord & { id: string };

export const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * The "what happens next" block on the errand page, for the customer or the assigned Runner.
 * Forms post to server actions that re-check everything; this only decides what to offer.
 */
export async function FulfilmentPanel({ e, role, locale, slug, market, sandbox, otherName, dispute, myRating, theirRating, theirRatingHidden, now }: {
  e: Errand; role: 'customer' | 'runner'; locale: string; slug: string; market: Market; sandbox: boolean; otherName: string;
  dispute: Dispute | null; myRating: Rating | null; theirRating: Rating | null; theirRatingHidden: boolean; now: Date;
}) {
  const t = await getTranslations('fulfil');
  const tAll = await getTranslations();
  const format = await getFormatter();
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short', timeZone: market.timezone });
  const bind = <A extends unknown[], R>(fn: (locale: string, slug: string, id: string, ...rest: A) => R) => fn.bind(null, locale, slug, e.id);
  const isCustomer = role === 'customer';
  const s = e.status;
  const blocks: React.ReactNode[] = [];

  // ── Status message ──
  if (s === 'offer_accepted') blocks.push(<Notice key="m">{isCustomer ? tAll('errands.awaitingPayment', { runner: otherName }) : tAll('runnerMarket.waitingPayment')}</Notice>);
  if (s === 'funded') blocks.push(<Notice key="m" tone="success">{isCustomer ? t('paidCustomer', { runner: otherName }) : t('runnerPaid')}</Notice>);
  if (s === 'in_progress') blocks.push(<Notice key="m">{isCustomer ? t('inProgressCustomer', { runner: otherName }) : t('inProgressRunner')}</Notice>);
  if (s === 'completed_pending_confirmation' && e.autoReleaseAt) {
    blocks.push(<Notice key="m" tone={isCustomer ? 'success' : 'neutral'}>{isCustomer ? t('awaitingConfirmCustomer', { runner: otherName, time: when(e.autoReleaseAt) }) : t('awaitingConfirmRunner', { time: when(e.autoReleaseAt) })}</Notice>);
  }
  if (s === 'disputed') blocks.push(<Notice key="m">{t('disputeOpen')}</Notice>);
  if ((s === 'confirmed' || s === 'paid_out') && dispute?.outcome === 'release_runner') blocks.push(<Notice key="m">{t('disputeResolvedRelease')}</Notice>);
  else if (s === 'confirmed' || s === 'paid_out') blocks.push(<Notice key="m" tone="success">{isCustomer ? t('confirmedCustomer') : t('confirmedRunner')}</Notice>);
  if (s === 'refunded' && dispute?.outcome === 'refund_customer') blocks.push(<Notice key="m">{t('disputeResolvedRefund')}</Notice>);

  // ── Primary action ──
  if (isCustomer && s === 'offer_accepted') {
    blocks.push(sandbox ? (
      <Notice key="pay" tone="sandbox" title={t('sandboxPayTitle')}>
        <p>{t('sandboxPayLead')}</p>
        <form action={bind(sandboxPayAction)} className="mt-3"><SubmitButton size="lg">{t('sandboxPay')}</SubmitButton></form>
      </Notice>
    ) : <p key="pay" className="text-small text-ink-3">{t('payLater')}</p>);
  }
  if (!isCustomer && s === 'funded') blocks.push(<form key="start" action={bind(startAction)}><SubmitButton size="lg">{t('start')}</SubmitButton></form>);
  if (!isCustomer && s === 'in_progress') {
    blocks.push(
      <div key="complete" className="rounded-md border border-line p-4">
        <CompleteForm action={bind(completeAction)} requiresPurchase={e.requiresPurchase} estimateLabel={money(market, e.itemEstimateMinor)}
          symbol={currencySymbol(market.currency, market.formatLocale)} />
      </div>,
    );
  }
  if (isCustomer && s === 'completed_pending_confirmation') blocks.push(<form key="confirm" action={bind(confirmAction)}><SubmitButton size="lg">{t('confirm')}</SubmitButton></form>);

  // ── Ratings (after confirmation) ──
  if ((s === 'confirmed' || s === 'paid_out') && e.confirmedAt) {
    const open = ratingWindowOpen(e.confirmedAt, now);
    blocks.push(
      <section key="rate" aria-labelledby="rate-h" className="flex flex-col gap-3 rounded-md border border-line p-4">
        <h3 id="rate-h" className="text-h3">{t('rateTitle', { name: otherName })}</h3>
        {myRating ? (
          <p data-testid="my-rating"><span className="text-small text-ink-3">{t('yourRating')}: </span><span aria-label={t('stars', { count: myRating.stars })}>{stars(myRating.stars)}</span>{myRating.comment ? ` · ${myRating.comment}` : ''}</p>
        ) : open ? (
          <form action={bind(rateAction)} className="flex flex-col gap-3">
            <p className="text-small text-ink-3">{t('rateLead', { time: when(ratingWindowEnds(e.confirmedAt)) })}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{t('rateTitle', { name: otherName })}</legend>
              {[5, 4, 3, 2, 1].map((n) => <Radio key={n} name="stars" value={n} required label={<span><span aria-hidden>{stars(n)}</span> <span className="text-small text-ink-3">{t('stars', { count: n })}</span></span>} />)}
            </fieldset>
            <label className="flex flex-col gap-1.5 text-small font-medium">{t('comment')}<Textarea name="comment" maxLength={500} rows={2} /></label>
            <SubmitButton className="self-start">{t('rateSubmit')}</SubmitButton>
          </form>
        ) : <p className="text-small text-ink-3">{t('rateClosed')}</p>}
        {theirRating ? (
          <p data-testid="their-rating"><span className="text-small text-ink-3">{t('theirRating', { name: otherName })}: </span><span aria-label={t('stars', { count: theirRating.stars })}>{stars(theirRating.stars)}</span>{theirRating.comment ? ` · ${theirRating.comment}` : ''}</p>
        ) : theirRatingHidden ? <p className="text-small text-ink-3">{t('ratingHidden', { name: otherName })}</p> : null}
      </section>,
    );
  }

  // ── Secondary: cancel / withdraw / dispute ──
  const secondary: React.ReactNode[] = [];
  if (isCustomer && (s === 'draft' || s === 'open' || s === 'offer_accepted')) {
    secondary.push(
      <details key="cancel" className="border-t border-line pt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-small text-ink-2 underline">{t('cancel')}</summary>
        <form action={bind(cancelAction)} className="mt-2 flex flex-col items-start gap-2">
          <p className="text-small text-ink-3">{t('cancelHelp')}</p>
          <SubmitButton variant="secondary">{t('cancelConfirm')}</SubmitButton>
        </form>
      </details>,
    );
  }
  if (!isCustomer && s === 'offer_accepted') {
    secondary.push(
      <details key="withdraw" className="border-t border-line pt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-small text-ink-2 underline">{t('withdraw')}</summary>
        <form action={bind(withdrawAction)} className="mt-2 flex flex-col items-start gap-2">
          <p className="text-small text-ink-3">{t('withdrawHelp')}</p>
          <SubmitButton variant="secondary">{t('withdraw')}</SubmitButton>
        </form>
      </details>,
    );
  }
  if (DISPUTABLE_STATUSES.includes(s)) {
    secondary.push(
      <details key="dispute" className="border-t border-line pt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-small text-ink-2 underline">{t('disputeTitle')}</summary>
        <form action={bind(disputeAction)} className="mt-2 flex flex-col gap-3">
          <p className="text-small text-ink-3">{t('disputeLead')}</p>
          <label className="flex flex-col gap-1.5 text-small font-medium">{t('disputeReason')}
            <Select name="reason" required defaultValue="">{[<option key="" value="" disabled>—</option>, ...DISPUTE_REASONS.map((r) => <option key={r} value={r}>{t(`reasons.${r}`)}</option>)]}</Select>
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium">{t('disputeDetails')}<Textarea name="details" maxLength={1000} rows={3} /></label>
          <SubmitButton variant="secondary" className="self-start">{t('disputeSubmit')}</SubmitButton>
        </form>
      </details>,
    );
  }

  if (!blocks.length && !secondary.length) return null;
  return (
    <section aria-label={t('panelLabel')} className="mt-6 flex flex-col gap-4" data-testid="fulfilment-panel">
      {blocks}
      {secondary.length ? <div className="flex flex-col">{secondary}</div> : null}
    </section>
  );
}

/** Proof + receipt photos and what was spent on items (shown once the Runner marks the errand done). */
export async function ProofSection({ role, photos, e, market }: {
  role: 'customer' | 'runner' | 'admin'; photos: { id: string; kind: string; width: number; height: number }[]; e: Errand; market: Market;
}) {
  if (!photos.length && e.itemActualMinor === null) return null;
  const t = await getTranslations('fulfil');
  const proofs = photos.filter((p) => p.kind === 'proof');
  const receipts = photos.filter((p) => p.kind === 'receipt');
  const diff = e.itemActualMinor !== null ? itemDifferenceMinor(e.itemEstimateMinor, e.itemActualMinor) : 0n;
  const img = (p: { id: string; width: number; height: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <a key={p.id} href={`/api/media/${p.id}`}><img src={`/api/media/${p.id}`} alt="" width={p.width} height={p.height} loading="lazy" className="size-28 rounded-md border border-line object-cover" /></a>
  );
  return (
    <section className="mt-6 flex flex-col gap-3" aria-labelledby="proof-h" data-testid="proof-section">
      <h2 id="proof-h" className="text-h3">{role === 'runner' ? t('proofTitleRunner') : t('proofTitle')}</h2>
      {proofs.length ? <div className="flex flex-wrap gap-3">{proofs.map(img)}</div> : null}
      {receipts.length ? <><h3 className="text-small font-medium">{t('receiptTitle')}</h3><div className="flex flex-wrap gap-3">{receipts.map(img)}</div></> : null}
      {e.itemActualMinor !== null ? (
        <p className="text-small text-ink-2">
          {t('itemsSpent', { actual: money(market, e.itemActualMinor), estimate: money(market, e.itemEstimateMinor) })}
          {diff > 0n ? ` ${t('itemsDiffMore', { amount: money(market, diff) })}` : diff < 0n ? ` ${t('itemsDiffLess', { amount: money(market, -diff) })}` : ''}
        </p>
      ) : null}
    </section>
  );
}
