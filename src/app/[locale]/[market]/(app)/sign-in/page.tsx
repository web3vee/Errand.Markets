import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { exampleMobile } from '@/lib/phone';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { getSession, requireMarket } from '@/server/context';
import { Container } from '@/ui/primitives/container';
import { startSignIn } from './actions';
import { PhoneForm } from './forms';
import { localized } from '@/lib/localized-text';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('auth.signInTitle') };
}

export default async function SignIn({ params, searchParams }: { params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const market = await requireMarket(slug);
  const next = safeNextPath((await searchParams).next, locale);
  if (await getSession()) redirect(next ?? `/${locale}/${slug}/account`);
  const t = await getTranslations();
  return (
    <Container className="max-w-[30rem] py-14">
      <h1 className="text-h1 text-balance">{t('auth.signInTitle')}</h1>
      <p className="mt-3 text-body text-ink-2">{t('auth.signInLead', { market: localized(market.name, locale) })}</p>
      <PhoneForm action={startSignIn.bind(null, locale, slug)} next={next} example={exampleMobile(market.phoneRegions) ?? ''} />
    </Container>
  );
}
