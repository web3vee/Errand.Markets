import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/ui/primitives/container';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('account.suspendedTitle') };
}

export default async function Suspended({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations();
  return (
    <Container className="max-w-[30rem] py-14">
      <h1 className="text-h1">{t('account.suspendedTitle')}</h1>
      <p className="mt-3 text-body text-ink-2">{t('account.suspendedBody')}</p>
    </Container>
  );
}
