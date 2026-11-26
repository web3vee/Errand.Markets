import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { hasActiveRole } from '@/modules/identity/domain/policy';
import { requireAccount } from '@/server/context';
import { Notice } from '@/ui/forms/fields';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { startKycAction } from '../actions';
import { StartVerification } from './start';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('runnerOnboarding.verifyTitle') };
}

export default async function RunnerVerify({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const path = `/${locale}/${slug}/runner/verify`;
  const { account, market } = await requireAccount(locale, slug, path);
  if (!hasActiveRole(account.roles, 'runner') || !account.runner) redirect(`/${locale}/${slug}/account`);
  if (account.runner.serviceAreaIds.length === 0) redirect(`/${locale}/${slug}/runner/profile`);
  const t = await getTranslations();
  const status = account.runner.kycStatus as 'not_started' | 'pending' | 'in_review' | 'resubmission_required' | 'approved' | 'rejected';
  const canStart = ['not_started', 'pending', 'resubmission_required'].includes(status);
  return (
    <Container className="max-w-[40rem] py-14">
      <h1 className="text-h1">{t('runnerOnboarding.verifyTitle')}</h1>
      <p className="mt-3 text-body text-ink-2">{t('runnerOnboarding.verifyLead')}</p>
      <p className="mt-2 text-small text-ink-3">{t('runnerOnboarding.needs', { requirement: t(`markets.${market.code}.runnerId`) })}</p>
      <div className="mt-8" data-testid="kyc-status" data-status={status}>
        <Notice tone={status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'neutral'}
          title={<span className="inline-flex items-center gap-2">{t(`runnerOnboarding.status.${status}.title`)} <Badge tone={status === 'approved' ? 'accent' : 'neutral'}>{t(`statuses.${status}`)}</Badge></span>}>
          {t(`runnerOnboarding.status.${status}.body`)}
        </Notice>
      </div>
      {canStart ? (
        <StartVerification action={startKycAction.bind(null, locale, slug)} locale={locale} doneHref={path}
          label={status === 'not_started' ? t('runnerOnboarding.start') : t('runnerOnboarding.retry')} />
      ) : null}
      <p className="mt-8"><Button asChild variant="ghost"><Link href={`/${locale}/${slug}/runner/profile`}>{t('runnerOnboarding.continueProfile')}</Link></Button></p>
    </Container>
  );
}
