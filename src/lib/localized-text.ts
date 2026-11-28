import { pseudoText } from '@/i18n/pseudo';

/** Text keyed by UI language, as stored in market config (see LocalizedText in the market schema). */
export type LocalizedText = Readonly<Record<string, string>>;

const FALLBACK = 'en';

/**
 * Pick the best text for a UI locale: exact tag → base language → English → whatever exists.
 * Pseudo-locales (en-XA, ar-XB) transform the English text so layout QA covers config text too.
 */
export function localized(text: LocalizedText | null | undefined, locale: string): string {
  if (!text) return '';
  if (locale === 'en-XA' || locale === 'ar-XB') {
    const base = text[FALLBACK] ?? Object.values(text)[0] ?? '';
    return pseudoText(base, locale === 'en-XA' ? 'long' : 'rtl');
  }
  if (text[locale]) return text[locale];
  const language = locale.split('-')[0]!;
  if (text[language]) return text[language];
  return text[FALLBACK] ?? Object.values(text)[0] ?? '';
}
