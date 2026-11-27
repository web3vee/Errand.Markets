import { formatMoney, type CurrencySpec } from '@/lib/money';
import { quote, type FeeSchedule, type RoundingMode } from '@/modules/pricing/domain/quote';

export type SerializedFees = { id: string; commissionBps: number; serviceFeeBps: number | null; serviceFeeFixedMinor: string | null; serviceFeeMinMinor: string | null; serviceFeeMaxMinor: string | null };
const big = (v: string | null) => (v === null ? null : BigInt(v));
export const serializeFees = (f: FeeSchedule): SerializedFees => ({
  id: f.id, commissionBps: f.commissionBps, serviceFeeBps: f.serviceFeeBps,
  serviceFeeFixedMinor: f.serviceFeeFixedMinor?.toString() ?? null, serviceFeeMinMinor: f.serviceFeeMinMinor?.toString() ?? null, serviceFeeMaxMinor: f.serviceFeeMaxMinor?.toString() ?? null,
});
export const deserializeFees = (f: SerializedFees): FeeSchedule => ({
  ...f, serviceFeeFixedMinor: big(f.serviceFeeFixedMinor), serviceFeeMinMinor: big(f.serviceFeeMinMinor), serviceFeeMaxMinor: big(f.serviceFeeMaxMinor),
});

/** Percentage label for a basis-point rate, formatted for the locale (500 → "5%"). */
export const rateLabel = (bpsValue: number | null, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format((bpsValue ?? 0) / 10_000);

/**
 * Customer-facing breakdown. Pure (renders on server or client). Labels are passed in so the
 * component doesn't depend on a translation provider.
 */
export function PriceSummary({ errandFeeMinor, itemEstimateMinor, fees, currency, formatLocale, rounding, labels, testId }: {
  errandFeeMinor: bigint; itemEstimateMinor: bigint; fees: FeeSchedule; currency: CurrencySpec & { code: string }; formatLocale: string; rounding: RoundingMode;
  labels: { title: string; errandFee: string; serviceFee: string; items: string; total: string; note?: string }; testId?: string;
}) {
  if (errandFeeMinor <= 0n) return null;
  const q = quote({ currency: currency.code, minorUnit: currency.minorUnit, rounding, errandFeeMinor, itemEstimateMinor, fees, taxRules: [] });
  const fmt = (m: bigint) => formatMoney(m, currency, formatLocale);
  const label = { errand_fee: labels.errandFee, service_fee: labels.serviceFee, item_estimate: labels.items };
  return (
    <section aria-label={labels.title} className="rounded-md border border-line bg-surface p-4" data-testid={testId}>
      <h3 className="text-small font-medium text-ink-3">{labels.title}</h3>
      <dl className="mt-2">
        {q.lines.map((l) => (
          <div key={l.code} className="flex justify-between gap-4 py-1 text-small">
            <dt className="text-ink-2">{label[l.code]}</dt>
            <dd className="tabular-nums">{fmt(l.amountMinor)}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2">
          <dt className="font-medium">{labels.total}</dt>
          <dd className="font-medium tabular-nums" data-testid={testId ? `${testId}-total` : undefined}>{fmt(q.customerTotalMinor)}</dd>
        </div>
      </dl>
      {labels.note ? <p className="mt-2 text-micro text-ink-3">{labels.note}</p> : null}
    </section>
  );
}
