import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { exampleMobile } from '@/lib/phone';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { getSession, requireMarket } from '@/server/context';
import { Container } from '@/ui/primitives/container';
import { startGoogleSignIn, startSignIn } from './actions';
import { GoogleButton, PhoneForm } from './forms';
import { googleSignInEnabled } from '@/server/sign-in';
import { Notice } from '@/ui/forms/fields';
import { localized } from '@/lib/localized-text';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('auth.signInTitle') };
}

export default async function SignIn({ params, searchParams }: { params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ next?: string; error?: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const market = await requireMarket(slug);
  const sp = await searchParams;
  const next = safeNextPath(sp.next, locale);
  if (await getSession()) redirect(next ?? `/${locale}/${slug}/account`);
  const t = await getTranslations();
  return (
    <Container className="max-w-[30rem] py-14">
      <h1 className="text-h1 text-balance">{t('auth.signInTitle')}</h1>
      {sp.error === 'google' ? <div className="mt-6"><Notice tone="danger">{t('auth.google.failed')}</Notice></div> : null}
      {googleSignInEnabled() ? (
        <>
          <div className="mt-8"><GoogleButton action={startGoogleSignIn.bind(null, locale, slug, next)} /></div>
          <p className="mt-3 text-small text-ink-3">{t('auth.google.note')}</p>
          <div className="mt-8 flex items-center gap-3 text-small text-ink-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />{t('auth.or')}<span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}
      <p className="mt-6 text-body text-ink-2">{t('auth.signInLead', { market: localized(market.name, locale) })}</p>
      <PhoneForm action={startSignIn.bind(null, locale, slug)} next={next} example={exampleMobile(market.phoneRegions) ?? ''} />
    </Container>
  );
}
