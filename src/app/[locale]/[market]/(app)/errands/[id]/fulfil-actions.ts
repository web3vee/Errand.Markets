'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { parseAmountToMinor } from '@/modules/errands/domain/amount';
import {
  cancelByCustomer, completeErrand, confirmErrand, raiseDispute, rateErrand, sandboxPay, startErrand, withdrawByRunner,
} from '@/modules/errands/fulfilment';
import { ErrandError } from '@/modules/errands/service';
import { participantNames } from '@/modules/messaging/service';
import { providerMode } from '@/providers/registry';
import { defaultDb, requireAccount } from '@/server/context';
import { onDispute, onFulfilment, onRated } from '@/server/workflows';

/**
 * Fulfilment steps on the errand page. Each one re-checks the actor and status inside the service
 * (row lock), then notifies the other party. Errors come back as ?ferr=<code> on the errand page.
 */
type Ctx = { locale: string; slug: string; id: string };
const errandPath = (c: Ctx, q = '') => `/${c.locale}/${c.slug}/errands/${c.id}${q}`;

async function run(c: Ctx, step: (accountId: string) => Promise<string>) {
  const { account } = await requireAccount(c.locale, c.slug, errandPath(c));
  let q: string;
  try {
    q = `?f=${await step(account.id)}`;
  } catch (e) {
    if (!(e instanceof ErrandError)) throw e;
    q = `?ferr=${encodeURIComponent(e.code)}`;
  }
  redirect(errandPath(c, q));
}

async function names(f: { customerId: string; runnerId: string | null }) {
  const n = await participantNames(defaultDb(), [f.customerId, ...(f.runnerId ? [f.runnerId] : [])]);
  return { customer: n.get(f.customerId) ?? '', runner: f.runnerId ? n.get(f.runnerId) ?? '' : '' };
}

/** SANDBOX ONLY until Stage 6: refused in live provider mode and on production deploys. */
export async function sandboxPayAction(locale: string, slug: string, id: string) {
  await run({ locale, slug, id }, async (me) => {
    const { market } = await requireAccount(locale, slug, errandPath({ locale, slug, id }));
    const sandbox = providerMode(market.code) === 'sandbox' && process.env.VERCEL_ENV !== 'production';
    const f = await sandboxPay(defaultDb(), me, id, { sandbox });
    await onFulfilment('paid', f, await names(f));
    return 'paid';
  });
}

export async function startAction(locale: string, slug: string, id: string) {
  await run({ locale, slug, id }, async (me) => {
    const f = await startErrand(defaultDb(), me, id);
    await onFulfilment('started', f, await names(f));
    return 'started';
  });
}

export type CompleteState = { error?: string } | null;

/** Called from the client form (photos are uploaded first; their ids come in as hidden fields). */
export async function completeAction(locale: string, slug: string, id: string, _prev: CompleteState, form: FormData): Promise<CompleteState> {
  const { account, market } = await requireAccount(locale, slug, errandPath({ locale, slug, id }));
  const t = await getTranslations({ locale });
  const ids = (k: string) => form.getAll(k).map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v)).slice(0, 6);
  const spentRaw = String(form.get('spent') ?? '').trim();
  const spent = spentRaw ? parseAmountToMinor(spentRaw, market.currency.minorUnit, market.formatLocale) : null;
  if (spentRaw && spent === null) return { error: t('post.errors.amount') };
  try {
    const f = await completeErrand(defaultDb(), account.id, id, { proofMediaIds: ids('proof'), receiptMediaIds: ids('receipt'), itemActualMinor: spent });
    await onFulfilment('completed', f, await names(f));
  } catch (e) {
    if (e instanceof ErrandError) return { error: t.has(`fulfil.errors.${e.code}`) ? t(`fulfil.errors.${e.code}` as never) : t('common.error') };
    throw e;
  }
  redirect(errandPath({ locale, slug, id }, '?f=completed'));
}

export async function confirmAction(locale: string, slug: string, id: string) {
  await run({ locale, slug, id }, async (me) => {
    const f = await confirmErrand(defaultDb(), me, id);
    await onFulfilment('confirmed', f, await names(f));
    return 'confirmed';
  });
}

export async function cancelAction(locale: string, slug: string, id: string) {
  await run({ locale, slug, id }, async (me) => {
    const f = await cancelByCustomer(defaultDb(), me, id, null);
    if (f.wasAccepted) await onFulfilment('cancelled', f, await names(f));
    return 'cancelled';
  });
}

export async function withdrawAction(locale: string, slug: string, id: string) {
  const { account } = await requireAccount(locale, slug, errandPath({ locale, slug, id }));
  try {
    const f = await withdrawByRunner(defaultDb(), account.id, id);
    await onFulfilment('withdrew', f, await names(f));
  } catch (e) {
    if (!(e instanceof ErrandError)) throw e;
    redirect(errandPath({ locale, slug, id }, `?ferr=${encodeURIComponent(e.code)}`));
  }
  // The Runner can no longer see the errand: back to their jobs.
  redirect(`/${locale}/${slug}/runner/jobs?withdrawn=1`);
}

export async function disputeAction(locale: string, slug: string, id: string, form: FormData) {
  await run({ locale, slug, id }, async (me) => {
    const f = await raiseDispute(defaultDb(), me, id, { reasonCode: String(form.get('reason') ?? ''), details: String(form.get('details') ?? '') });
    await onDispute(f);
    return 'disputed';
  });
}

export async function rateAction(locale: string, slug: string, id: string, form: FormData) {
  await run({ locale, slug, id }, async (me) => {
    const f = await rateErrand(defaultDb(), me, id, { stars: Number(form.get('stars')), comment: String(form.get('comment') ?? '') });
    await onRated(f);
    return 'rated';
  });
}
