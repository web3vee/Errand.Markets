import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { pseudoLocalizeMessages } from './pseudo';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  if (locale === 'en-XA' || locale === 'ar-XB') {
    const en = (await import('../../messages/en.json')).default;
    return { locale, messages: pseudoLocalizeMessages(en, locale === 'en-XA' ? 'long' : 'rtl') };
  }
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
