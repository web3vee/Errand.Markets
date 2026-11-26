import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { hasActiveRole } from '@/modules/identity/domain/policy';
import type { Account } from '@/modules/identity/service';
import { Logo } from '@/ui/brand/logo';
import { Container } from '@/ui/primitives/container';
import { signOutAction } from './sign-out-action';

export async function AppHeader({ locale, marketSlug, marketName, account, sandbox, unread = 0 }: {
  locale: string; marketSlug: string; marketName: string; account: Account | null; sandbox: boolean; unread?: number;
}) {
  const t = await getTranslations();
  const base = `/${locale}/${marketSlug}`;
  const isAdmin = account ? hasActiveRole(account.roles, 'admin') : false;
  const isRunner = account ? hasActiveRole(account.roles, 'runner') : false;
  const link = 'inline-flex min-h-11 items-center rounded-md px-3 text-small font-medium text-ink-2 hover:bg-sunken hover:text-ink';
  const approved = account?.runner?.kycStatus === 'approved';
  const badge = unread ? <span className="ms-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-micro text-accent-ink" aria-hidden data-testid="unread-count">{unread}</span> : null;
  const links: { href: string; label: string; aria?: string; badge?: React.ReactNode }[] = account ? [
    { href: `${base}/errands`, label: t('nav.myErrands') },
    ...(isRunner ? [{ href: `${base}/${approved ? 'runner/errands' : 'runner/verify'}`, label: t('nav.findErrands') }] : []),
    ...(isRunner && approved ? [{ href: `${base}/runner/jobs`, label: t('nav.myJobs') }] : []),
    { href: `${base}/messages`, label: t('nav.messages') },
    { href: `${base}/notifications`, label: t('nav.notifications'), aria: unread ? t('nav.notificationsCount', { count: unread }) : undefined, badge },
    { href: `${base}/account`, label: t('nav.account') },
    ...(isAdmin ? [{ href: `/${locale}/admin/runners`, label: t('nav.admin') }, { href: `/${locale}/admin/errands`, label: t('adminErrands.nav') }] : []),
  ] : [];
  return (
    <header className="border-b border-line">
      {sandbox ? <p className="bg-sunken py-1.5 text-center text-micro text-ink-2">{t('sandbox.banner')}</p> : null}
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-3 focus:text-bg">{t('nav.skipToContent')}</a>
      <Container className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-2">
        <Link href={base} aria-label={t('brand.name')} className="-ms-1 inline-flex min-h-11 items-center rounded-md px-1"><Logo /></Link>
        {account ? (
          <>
            {/* Desktop: inline links. Phone: native <details> menu (no JavaScript). */}
            <nav aria-label={t('nav.label')} className="hidden flex-wrap items-center gap-1 lg:flex">
              <span className="px-2 text-small text-ink-3">{marketName}</span>
              {links.map((l) => <Link key={l.href} href={l.href} className={link} aria-label={l.aria}>{l.label}{l.badge}</Link>)}
              <form action={signOutAction.bind(null, locale, marketSlug)}><button type="submit" className={link}>{t('nav.signOut')}</button></form>
            </nav>
            <details className="group relative lg:hidden">
              <summary className={`${link} gap-2`} aria-label={unread ? t('nav.notificationsCount', { count: unread }) : t('nav.menu')}>
                {t('nav.menu')}{unread ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-micro text-accent-ink" aria-hidden>{unread}</span> : null}
              </summary>
              <nav aria-label={t('nav.label')} className="absolute end-0 z-30 mt-2 flex w-64 flex-col rounded-md border border-line bg-surface p-1 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]">
                <span className="px-3 py-2 text-micro text-ink-3">{marketName}</span>
                {links.map((l) => <Link key={l.href} href={l.href} className={`${link} justify-between`} aria-label={l.aria}>{l.label}{l.badge}</Link>)}
                <form action={signOutAction.bind(null, locale, marketSlug)}><button type="submit" className={`${link} w-full`}>{t('nav.signOut')}</button></form>
              </nav>
            </details>
          </>
        ) : (
          <span className="text-small text-ink-3">{marketName}</span>
        )}
      </Container>
    </header>
  );
}
