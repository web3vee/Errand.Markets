import { getTranslations, setRequestLocale } from 'next-intl/server';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { requireAccount } from '@/server/context';
import { Container } from '@/ui/primitives/container';
import { saveName } from './actions';
import { NameForm } from './name-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('onboarding.title') };
}

export default async function Onboarding({ params, searchParams }: { params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const next = safeNextPath((await searchParams).next, locale);
  const { account } = await requireAccount(locale, slug, `/${locale}/${slug}/onboarding`, { allowNoName: true });
  const t = await getTranslations();
  return (
    <Container className="max-w-[30rem] py-14">
      <h1 className="text-h1">{t('onboarding.title')}</h1>
      <p className="mt-3 text-body text-ink-2">{t('onboarding.lead')}</p>
      <NameForm action={saveName.bind(null, locale, slug)} next={next} initial={account.displayName} />
    </Container>
  );
}
