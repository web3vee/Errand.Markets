import { defineRouting } from 'next-intl/routing';
import { uiLanguages } from '@/modules/markets/source';

/** Pseudo-locales for layout QA: en-XA (long, accented) and ar-XB (right-to-left). Never enabled in production. */
export const PSEUDO_LOCALES = ['en-XA', 'ar-XB'] as const;
const pseudoEnabled = process.env.ENABLE_PSEUDO_LOCALES === '1' && process.env.VERCEL_ENV !== 'production';

export const routing = defineRouting({
  locales: [...uiLanguages(), ...(pseudoEnabled ? PSEUDO_LOCALES : [])],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeCookie: { name: 'em_locale' },
});
export type AppLocale = (typeof routing.locales)[number];
