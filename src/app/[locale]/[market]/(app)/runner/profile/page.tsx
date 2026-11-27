import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { hasActiveRole } from '@/modules/identity/domain/policy';
import { listServiceAreas } from '@/modules/identity/service';
import { defaultDb, requireAccount } from '@/server/context';
import { Container } from '@/ui/primitives/container';
import { saveRunnerProfile } from '../actions';
import { RunnerProfileForm } from './form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('runnerOnboarding.profileTitle') };
}

export default async function RunnerProfile({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { account, market } = await requireAccount(locale, slug, `/${locale}/${slug}/runner/profile`);
  if (!hasActiveRole(account.roles, 'runner') || !account.runner) redirect(`/${locale}/${slug}/account`);
  const t = await getTranslations();
  const areas = (await listServiceAreas(defaultDb(), market.id)).map((a) => ({ id: a.id, name: t(a.nameKey) }));
  const r = account.runner;
  return (
    <Container className="max-w-[40rem] py-14">
      <h1 className="text-h1">{t('runnerOnboarding.profileTitle')}</h1>
      <p className="mt-3 text-body text-ink-2">{t('runnerOnboarding.profileLead')}</p>
      <RunnerProfileForm action={saveRunnerProfile.bind(null, locale, slug)} areas={areas}
        initial={{ bio: r.bio, vehicle: r.vehicle, areaIds: r.serviceAreaIds, emergencyName: r.emergencyContactName, emergencyPhone: r.emergencyContactPhone }} />
    </Container>
  );
}
