import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { parseMarketPhone } from '@/lib/phone';
import { hasActiveRole } from '@/modules/identity/domain/policy';
import { requireAccount } from '@/server/context';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Container } from '@/ui/primitives/container';
import { saveName } from '../onboarding/actions';
import { NameForm } from '../onboarding/name-form';
import { becomeRunnerAction } from '../runner/actions';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('account.title') };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { account, market } = await requireAccount(locale, slug, `/${locale}/${slug}/account`);
  const t = await getTranslations();
  const phone = parseMarketPhone(account.phoneE164, market.phone);
  const activeRoles = account.roles.filter((r) => r.status === 'active' && ['customer', 'runner', 'admin'].includes(r.role));
  const isRunner = hasActiveRole(account.roles, 'runner');
  const row = 'grid gap-1 border-t border-line py-4 sm:grid-cols-[10rem_1fr] sm:gap-6';
  return (
    <Container className="max-w-[44rem] py-14">
      <h1 className="text-h1">{t('account.title')}</h1>
      <dl className="mt-8 border-b border-line">
        <div className={row}><dt className="text-small text-ink-3">{t('account.phone')}</dt><dd dir="ltr" className="text-start">{phone.ok ? `${market.phone.countryCode} ${phone.national}` : account.phoneE164}</dd></div>
        <div className={row}><dt className="text-small text-ink-3">{t('account.market')}</dt><dd>{t(market.nameKey)} · {market.currency.code}</dd></div>
        <div className={row}>
          <dt className="text-small text-ink-3">{t('account.roles')}</dt>
          <dd className="flex flex-wrap gap-2">{activeRoles.map((r) => <Badge key={r.role}>{t(`account.roleNames.${r.role}`)}</Badge>)}</dd>
        </div>
        <div className={row}>
          <dt className="text-small text-ink-3">{t('account.name')}</dt>
          <dd className="max-w-[24rem]"><NameForm action={saveName.bind(null, locale, slug)} initial={account.displayName} submitLabel={t('account.save')} /></dd>
        </div>
      </dl>

      <section aria-labelledby="runner-h" className="mt-12">
        {isRunner && account.runner ? (
          <>
            <h2 id="runner-h" className="text-h3">{t('account.runnerStatusTitle')}</h2>
            <p className="mt-2 flex items-center gap-3">
              <Badge tone={account.runner.kycStatus === 'approved' ? 'accent' : 'neutral'}>{t(`statuses.${account.runner.kycStatus}`)}</Badge>
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild variant="secondary"><Link href={`/${locale}/${slug}/runner/verify`}>{t(`runnerOnboarding.status.${account.runner.kycStatus}.title`)}</Link></Button>
              <Button asChild variant="ghost"><Link href={`/${locale}/${slug}/runner/profile`}>{t('account.manageRunner')}</Link></Button>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-line bg-surface p-6">
            <h2 id="runner-h" className="text-h3">{t('account.runnerCtaTitle')}</h2>
            <p className="mt-2 text-body text-ink-2">{t('account.runnerCtaBody')}</p>
            <form action={becomeRunnerAction.bind(null, locale, slug)} className="mt-5">
              <Button type="submit" variant="ink">{t('account.runnerCta')}</Button>
            </form>
          </div>
        )}
      </section>
      <section className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <p className="text-body">{t('account.postSoon')}</p>
        <Button asChild><Link href={`/${locale}/${slug}/errands/new`}>{t('account.postCta')}</Link></Button>
      </section>
    </Container>
  );
}
