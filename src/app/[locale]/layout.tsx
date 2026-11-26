import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { localeDirection } from '@/lib/i18n-direction';
import { geist, inter } from '@/ui/fonts';
import { DirectionToggle } from '@/ui/preview/direction-toggle';
import { tokensCss } from '@/ui/tokens';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  applicationName: 'Errand.markets',
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/brand/mark.svg', type: 'image/svg+xml' }],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0C' },
  ],
};

// Stage 2 preview: pick direction from ?direction= or the last choice, before first paint (no flash).
const DIRECTION_SCRIPT = `try{var d=new URLSearchParams(location.search).get('direction');if(d==='a'||d==='b'){localStorage.setItem('em_dir',d)}else{d=localStorage.getItem('em_dir')}if(d==='a'||d==='b'){document.documentElement.dataset.direction=d}}catch(e){}`;
const PREVIEW = process.env.NEXT_PUBLIC_DIRECTION_PREVIEW !== '0';

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <html lang={locale} dir={localeDirection(locale)} data-direction="a" className={`${geist.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokensCss() }} />
        {PREVIEW ? <script dangerouslySetInnerHTML={{ __html: DIRECTION_SCRIPT }} /> : null}
      </head>
      <body className="min-h-dvh">
        {children}
        {PREVIEW ? <DirectionToggle label={t('preview.label')} a={t('preview.a')} b={t('preview.b')} /> : null}
      </body>
    </html>
  );
}
