import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { unreadCount } from '@/modules/notifications/service';
import { currentAccount, defaultDb, getMarket, getSession } from '@/server/context';
import { authMode } from '@/server/auth';
import { providerMode } from '@/providers/registry';
import { AppHeader } from '@/ui/app/app-header';

/** Signed-in / auth area. Always dynamic (per-user). */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: { template: `%s · ${t('brand.name')}`, default: t('brand.name') } };
}

export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const market = await getMarket(slug);
  if (!market) notFound();
  const t = await getTranslations();
  const account = await currentAccount();
  const session = await getSession();
  const unread = account && session ? await unreadCount(defaultDb(), session.claims) : 0;
  const messages = await getMessages();
  const sandbox = authMode() === 'local' || providerMode(market.code) === 'sandbox';
  // Client components here only need form-related namespaces.
  const pick = ['auth', 'common', 'runnerOnboarding', 'onboarding', 'sandbox', 'post', 'chat', 'notificationsPage', 'runnerMarket', 'errands'] as const;
  const clientMessages = Object.fromEntries(pick.map((k) => [k, (messages as Record<string, unknown>)[k]]));
  return (
    <NextIntlClientProvider locale={locale} messages={clientMessages}>
      <AppHeader locale={locale} marketSlug={slug} marketName={t(market.nameKey)} account={account} sandbox={sandbox} unread={unread} />
      <main id="main" className="pb-24">{children}</main>
    </NextIntlClientProvider>
  );
}
