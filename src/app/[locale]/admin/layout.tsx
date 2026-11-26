import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getMarketById, requireAdmin } from '@/server/context';
import { AppHeader } from '@/ui/app/app-header';
import { authMode } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Admin area. Every page and action re-checks permissions server-side; RLS scopes the data. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: { template: `%s · ${t('brand.name')}`, default: t('brand.name') }, robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { account } = await requireAdmin('ops');
  const own = await getMarketById(account.marketId);
  const t = await getTranslations();
  const messages = (await getMessages()) as Record<string, unknown>;
  return (
    <NextIntlClientProvider locale={locale} messages={{ admin: messages.admin, common: messages.common }}>
      <AppHeader locale={locale} marketSlug={own?.slug ?? ''} marketName={t('admin.title')} account={account} sandbox={authMode() === 'local'} />
      <main id="main" className="pb-24">{children}</main>
    </NextIntlClientProvider>
  );
}
