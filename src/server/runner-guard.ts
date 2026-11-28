import 'server-only';
import { redirect } from 'next/navigation';
import { hasActiveRole } from '@/modules/identity/domain/policy';
import { requireVerifiedPhone } from './context';

/** Runner marketplace pages: signed in with a verified phone, Runner role, and KYC approved (else sent to verify). */
export async function requireVerifiedRunner(locale: string, slug: string, path: string) {
  const ctx = await requireVerifiedPhone(locale, slug, path);
  if (!hasActiveRole(ctx.account.roles, 'runner') || !ctx.account.runner) redirect(`/${locale}/${slug}/account`);
  return { ...ctx, verified: ctx.account.runner.kycStatus === 'approved' };
}
