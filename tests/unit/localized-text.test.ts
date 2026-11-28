import { describe, expect, it } from 'vitest';
import { localized } from '@/lib/localized-text';

const text = { en: 'Ivory Coast', fr: "Côte d'Ivoire", 'pt-BR': 'Costa do Marfim' };

describe('localized', () => {
  it('prefers the exact locale tag', () => expect(localized(text, 'pt-BR')).toBe('Costa do Marfim'));
  it('falls back to the base language', () => expect(localized(text, 'fr-CI')).toBe("Côte d'Ivoire"));
  it('falls back to English', () => expect(localized(text, 'ha')).toBe('Ivory Coast'));
  it('falls back to any text when English is missing', () => expect(localized({ fr: 'Sénégal' }, 'en')).toBe('Sénégal'));
  it('returns empty for missing text', () => expect(localized(null, 'en')).toBe(''));
  it('pseudo-localises for layout QA locales', () => {
    expect(localized(text, 'en-XA')).toMatch(/^\[Ívóŕý Çóáşţ|^\[Í/);
    expect(localized(text, 'ar-XB')).toBe('‮Ivory Coast‬');
  });
});
