import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { authMode } from '@/server/auth';
import { getSession, requireMarket } from '@/server/context';
import { Notice } from '@/ui/forms/fields';
import { Container } from '@/ui/primitives/container';
import { sandboxGoogleSignIn } from '../actions';
import { SandboxGoogleForm } from '../forms';

/** SANDBOX ONLY — stands in for Google's account chooser in local auth mode. 404 otherwise. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('auth.google.sandboxTitle') };
}

export default async function GoogleSandbox({ params, searchParams }: { params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  if (authMode() !== 'local') notFound();
  await requireMarket(slug);
  const next = safeNextPath((await searchParams).next, locale);
  if (await getSession()) redirect(next ?? `/${locale}/${slug}/account`);
  const t = await getTranslations();
  return (
    <Container className="max-w-[30rem] py-14">
      <h1 className="text-h1">{t('auth.google.sandboxTitle')}</h1>
      <div className="mt-4"><Notice tone="sandbox">{t('auth.google.sandboxLead')}</Notice></div>
      <SandboxGoogleForm action={sandboxGoogleSignIn.bind(null, locale, slug, next)} />
    </Container>
  );
}
