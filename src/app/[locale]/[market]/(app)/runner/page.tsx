import { redirect } from 'next/navigation';
import { hasActiveRole } from '@/modules/identity/domain/policy';
import { requireVerifiedPhone } from '@/server/context';

export default async function RunnerIndex({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market } = await params;
  const { account } = await requireVerifiedPhone(locale, market, `/${locale}/${market}/runner`);
  redirect(hasActiveRole(account.roles, 'runner') ? `/${locale}/${market}/runner/verify` : `/${locale}/${market}/account#runner-h`);
}
