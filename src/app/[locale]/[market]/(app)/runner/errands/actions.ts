'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { acceptErrand, ErrandError, marketplaceConfig } from '@/modules/errands/service';
import { MessagingError, startQuestionThread } from '@/modules/messaging/service';
import { hitRateLimit } from '@/modules/platform/rate-limit';
import { defaultDb, requireAccount } from '@/server/context';
import { money } from '@/server/format';
import { onAccepted } from '@/server/workflows';

export type AcceptState = { error?: string } | null;

export async function acceptAction(locale: string, marketSlug: string, errandId: string, _prev: AcceptState, form: FormData): Promise<AcceptState> {
  const { account, market } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/runner/errands/${errandId}`);
  const t = await getTranslations({ locale });
  const seen = String(form.get('price') ?? '');
  if (!/^\d+$/.test(seen)) return { error: t('common.error') };
  const limit = await hitRateLimit(defaultDb(), `accept:${account.id}`, 30, 3600);
  if (!limit.allowed) return { error: t('auth.errors.rate_limited', { minutes: Math.ceil(limit.retryAfterSeconds / 60) }) };
  let result;
  try {
    result = await acceptErrand(defaultDb(), account.id, errandId, BigInt(seen));
  } catch (e) {
    if (e instanceof ErrandError) {
      const { rules } = await marketplaceConfig(defaultDb(), market.id);
      const values = { max: rules.maxConcurrentErrands, amount: e.detail?.price !== undefined ? money(market, e.detail.price as bigint) : '' };
      return { error: t.has(`runnerMarket.errors.${e.code}`) ? t(`runnerMarket.errors.${e.code}` as never, values as never) : t('common.error') };
    }
    throw e;
  }
  await onAccepted(result, account.displayName ?? '');
  redirect(`/${locale}/${marketSlug}/errands/${errandId}?accepted=1`);
}

export async function askAction(locale: string, marketSlug: string, errandId: string): Promise<void> {
  const { account } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/runner/errands/${errandId}`);
  let conversationId: string;
  try {
    conversationId = await startQuestionThread(defaultDb(), account.id, errandId);
  } catch (e) {
    if (e instanceof MessagingError) redirect(`/${locale}/${marketSlug}/runner/errands/${errandId}?error=${e.code}`);
    throw e;
  }
  redirect(`/${locale}/${marketSlug}/messages/${conversationId}`);
}
