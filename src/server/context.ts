import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { asSystem, defaultDb } from '../../db/client';
import { sandboxOutbox } from '../../db/schema';
import { adminScope, type AdminPermission } from '@/modules/identity/domain/policy';
import { ensureUser, getAccount, type Account } from '@/modules/identity/service';
import { marketSource, type MarketRecord } from '@/modules/markets/source';
import { kycFor, providerContext, smsFor } from '@/providers/registry';
import { auth } from './auth';

export { defaultDb } from '../../db/client';

export const getMarket = cache(async (slug: string) => marketSource().bySlug(slug));
export const getMarketById = cache(async (id: string) => (await marketSource().list()).find((m) => m.id === id) ?? null);

export async function requireMarket(slug: string): Promise<MarketRecord & { id: string }> {
  const m = await getMarket(slug);
  if (!m || !m.id) notFound();
  return m as MarketRecord & { id: string };
}

export function providerDeps(market: MarketRecord, locale: string) {
  return {
    writeOutbox: async (m: { to: string; body: string; marketCode: string }) =>
      asSystem(defaultDb(), 'sandbox sms outbox', async (tx) => {
        const [row] = await tx.insert(sandboxOutbox).values({ channel: 'sms', toAddress: m.to, body: m.body, marketCode: m.marketCode }).returning({ id: sandboxOutbox.id });
        return row!.id;
      }),
    sandboxKycLaunchUrl: (verificationId: string) => `/${locale}/${market.slug}/runner/verify/sandbox?v=${verificationId}`,
  };
}

export function providersFor(market: MarketRecord, locale: string) {
  const deps = providerDeps(market, locale);
  return { ctx: providerContext(market, locale), sms: smsFor(market, deps), kyc: kycFor(market, deps) };
}

/** SANDBOX ONLY: most recent outbox message to a phone (shown on the code screen so testers can sign in). */
export async function latestSandboxSms(phone: string) {
  const [row] = await defaultDb().select().from(sandboxOutbox).where(eq(sandboxOutbox.toAddress, phone)).orderBy(desc(sandboxOutbox.id)).limit(1);
  return row ?? null;
}

export const getSession = cache(async () => auth().getSession());

export const currentAccount = cache(async (): Promise<Account | null> => {
  const s = await getSession();
  if (!s) return null;
  return getAccount(defaultDb(), s.claims);
});

/**
 * Guard for signed-in pages under /{locale}/{market}/…
 * - no session → sign-in (with ?next)
 * - session but no profile yet (e.g. Supabase user created elsewhere) → create it
 * - account in another market → same page in the user's own market
 * - no name yet → onboarding
 */
export async function requireAccount(locale: string, marketSlug: string, path: string, opts: { allowNoName?: boolean } = {}) {
  const session = await getSession();
  if (!session) redirect(`/${locale}/${marketSlug}/sign-in?next=${encodeURIComponent(path)}`);
  let account = await currentAccount();
  if (!account) {
    const market = await requireMarket(marketSlug);
    await ensureUser(defaultDb(), { authUserId: session.userId, phoneE164: session.phoneE164, marketId: market.id, locale });
    account = await getAccount(defaultDb(), session.claims);
    if (!account) redirect(`/${locale}/${marketSlug}/sign-in`);
  }
  if (account.status !== 'active') redirect(`/${locale}/${marketSlug}/account/suspended`);
  const own = await getMarketById(account.marketId);
  if (own && own.slug !== marketSlug) redirect(path.replace(`/${locale}/${marketSlug}/`, `/${locale}/${own.slug}/`));
  if (!account.displayName && !opts.allowNoName) redirect(`/${locale}/${marketSlug}/onboarding?next=${encodeURIComponent(path)}`);
  const market = await requireMarket(marketSlug);
  return { session, account, market };
}

/** Admin pages: 404 for anyone without the permission (don't reveal the admin area exists). */
export async function requireAdmin(perm: AdminPermission) {
  const session = await getSession();
  if (!session) notFound();
  const account = await currentAccount();
  if (!account) notFound();
  const scope = adminScope(account.roles, account.adminGrants, perm);
  if (scope !== 'all' && scope.length === 0) notFound();
  return { session, account, scope };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
