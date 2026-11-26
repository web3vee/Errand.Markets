import 'server-only';
import { redirect } from 'next/navigation';
import { hasActiveRole } from '@/modules/identity/domain/policy';
import { requireAccount } from './context';

/** Runner marketplace pages: signed in, Runner role, and KYC approved (else sent to verify). */
export async function requireVerifiedRunner(locale: string, slug: string, path: string) {
  const ctx = await requireAccount(locale, slug, path);
  if (!hasActiveRole(ctx.account.roles, 'runner') || !ctx.account.runner) redirect(`/${locale}/${slug}/account`);
  return { ...ctx, verified: ctx.account.runner.kycStatus === 'approved' };
}
