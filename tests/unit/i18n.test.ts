import { describe, expect, it } from 'vitest';
import { formatLocaleFor, localeDirection } from '@/lib/i18n-direction';
import { pseudoLocalize } from '@/i18n/pseudo';

describe('localeDirection', () => {
  it.each([['en', 'ltr'], ['en-NG', 'ltr'], ['ar', 'rtl'], ['he', 'rtl'], ['ar-XB', 'rtl'], ['ha', 'ltr']])('%s → %s', (l, d) =>
    expect(localeDirection(l)).toBe(d));
});

describe('formatLocaleFor', () => {
  it('combines UI language with market region', () => {
    expect(formatLocaleFor('en', 'en-NG')).toBe('en-NG');
    expect(formatLocaleFor('fr', 'en-VC')).toBe('fr-VC');
  });
});

describe('pseudoLocalize', () => {
  it('expands strings and preserves ICU placeholders and tags', () => {
    const src = 'Hello {name}, you have {count, plural, one {# errand} other {# errands}} <b>now</b>';
    const out = pseudoLocalize(src, 'long');
    expect(out).toContain('Ĥéļļó');
    expect(out.length).toBeGreaterThan(src.length);
    expect(out).toContain('{name}');
    expect(out).toMatch(/\{count,\s?plural,\s?one\s?\{# /);
    expect(out).toContain('<b>');
    expect(out).toContain('</b>');
  });
});
