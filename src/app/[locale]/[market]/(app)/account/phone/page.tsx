import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { localized } from '@/lib/localized-text';
import { exampleMobile } from '@/lib/phone';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { requireAccount } from '@/server/context';
import { Container } from '@/ui/primitives/container';
import { PhoneForm } from '../../sign-in/forms';
import { startPhoneLink } from './actions';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('phoneLink.title') };
}

/** Accounts created with Google add a verified phone here before posting errands or becoming a Runner. */
export default async function AddPhone({ params, searchParams }: { params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { account, market } = await requireAccount(locale, slug, `/${locale}/${slug}/account/phone`, { allowNoName: true });
  const next = safeNextPath((await searchParams).next, locale);
  if (account.phoneE164) redirect(next ?? `/${locale}/${slug}/account`);
  const t = await getTranslations();
  return (
    <Container className="max-w-[30rem] py-14">
      <h1 className="text-h1 text-balance">{t('phoneLink.title')}</h1>
      <p className="mt-3 text-body text-ink-2">{t('phoneLink.lead', { market: localized(market.name, locale) })}</p>
      <PhoneForm action={startPhoneLink.bind(null, locale, slug, next)} next={null} example={exampleMobile(market.phoneRegions) ?? ''} />
    </Container>
  );
}
