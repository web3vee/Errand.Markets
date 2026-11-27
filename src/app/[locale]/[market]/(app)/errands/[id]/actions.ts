'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { parseAmountToMinor } from '@/modules/errands/domain/amount';
import { editPrice, ErrandError, publishDraft } from '@/modules/errands/service';
import { defaultDb, requireAccount } from '@/server/context';
import { money } from '@/server/format';
import { onErrandPublished } from '@/server/workflows';

export type SimpleState = { error?: string; ok?: string } | null;

export async function editPriceAction(locale: string, marketSlug: string, errandId: string, _prev: SimpleState, form: FormData): Promise<SimpleState> {
  const { account, market } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/errands/${errandId}`);
  const t = await getTranslations({ locale });
  const price = parseAmountToMinor(String(form.get('price') ?? ''), market.currency.minorUnit, market.formatLocale);
  const version = Number(form.get('version'));
  if (price === null || !Number.isInteger(version)) return { error: t('post.errors.amount') };
  try {
    await editPrice(defaultDb(), account.id, errandId, price, version);
  } catch (e) {
    if (e instanceof ErrandError) {
      if (e.code === 'price_below_minimum') return { error: t('post.errors.price_below_minimum', { amount: money(market, e.detail!.min as bigint, true) }) };
      if (e.code === 'price_locked') return { error: t('errands.priceLocked') };
      if (e.code === 'stale') return { error: t('errands.stale') };
      return { error: t('common.error') };
    }
    throw e;
  }
  redirect(`/${locale}/${marketSlug}/errands/${errandId}?price=1`);
}

export async function publishDraftAction(locale: string, marketSlug: string, errandId: string): Promise<void> {
  const { account } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/errands/${errandId}`);
  let q = 'posted=1';
  try {
    const r = await publishDraft(defaultDb(), account.id, errandId);
    if (r.heldForReview) q = 'held=1';
    else await onErrandPublished(errandId);
  } catch (e) {
    if (!(e instanceof ErrandError)) throw e;
    q = `error=${encodeURIComponent(e.code)}`;
  }
  redirect(`/${locale}/${marketSlug}/errands/${errandId}?${q}`);
}
