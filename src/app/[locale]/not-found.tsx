import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Container } from '@/ui/primitives/container';

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main id="main">
      <Container className="py-24">
        <h1 className="text-h1">{t('notFound.title')}</h1>
        <p className="mt-6"><Link href="/" className="underline">{t('notFound.back')}</Link></p>
      </Container>
    </main>
  );
}
