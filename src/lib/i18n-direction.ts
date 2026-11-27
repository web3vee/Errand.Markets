/** Text direction for a locale, from Intl (CLDR) data — no hand-maintained list. */
export function localeDirection(locale: string): 'ltr' | 'rtl' {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => { direction: string };
      textInfo?: { direction: string };
    };
    const info = l.getTextInfo?.() ?? l.textInfo;
    return info?.direction === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

/** Combine a UI language with a market to get the formatting locale (e.g. en + NG → en-NG). */
export function formatLocaleFor(uiLanguage: string, marketFormatLocale: string): string {
  const lang = new Intl.Locale(uiLanguage).language;
  const region = new Intl.Locale(marketFormatLocale).region;
  // Pseudo-locales keep their own tags so their effect is visible.
  if (['XA', 'XB'].includes(new Intl.Locale(uiLanguage).region ?? '')) return marketFormatLocale;
  return region ? `${lang}-${region}` : lang;
}
