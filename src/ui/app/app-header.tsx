import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { hasActiveRole } from '@/modules/identity/domain/policy';
import type { Account } from '@/modules/identity/service';
import { Logo } from '@/ui/brand/logo';
import { Container } from '@/ui/primitives/container';
import { signOutAction } from './sign-out-action';

export async function AppHeader({ locale, marketSlug, marketName, account, sandbox }: {
  locale: string; marketSlug: string; marketName: string; account: Account | null; sandbox: boolean;
}) {
  const t = await getTranslations();
  const base = `/${locale}/${marketSlug}`;
  const isAdmin = account ? hasActiveRole(account.roles, 'admin') : false;
  const isRunner = account ? hasActiveRole(account.roles, 'runner') : false;
  const link = 'inline-flex min-h-11 items-center rounded-md px-3 text-small font-medium text-ink-2 hover:bg-sunken hover:text-ink';
  return (
    <header className="border-b border-line">
      {sandbox ? <p className="bg-sunken py-1.5 text-center text-micro text-ink-2">{t('sandbox.banner')}</p> : null}
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-3 focus:text-bg">{t('nav.skipToContent')}</a>
      <Container className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-2">
        <Link href={base} aria-label={t('brand.name')} className="-ms-1 inline-flex min-h-11 items-center rounded-md px-1"><Logo /></Link>
        {account ? (
          <nav aria-label={t('nav.label')} className="flex flex-wrap items-center gap-1">
            <span className="hidden px-2 text-small text-ink-3 sm:inline">{marketName}</span>
            <Link href={`${base}/account`} className={link}>{t('nav.account')}</Link>
            {isRunner ? <Link href={`${base}/runner/verify`} className={link}>{t('nav.runner')}</Link> : null}
            {isAdmin ? <Link href={`/${locale}/admin/runners`} className={link}>{t('nav.admin')}</Link> : null}
            <form action={signOutAction.bind(null, locale, marketSlug)}>
              <button type="submit" className={link}>{t('nav.signOut')}</button>
            </form>
          </nav>
        ) : (
          <span className="text-small text-ink-3">{marketName}</span>
        )}
      </Container>
    </header>
  );
}
