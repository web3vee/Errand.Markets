/**
 * Design tokens — single source of truth for both visual directions.
 * Emitted as CSS custom properties (inlined in <head>, no extra request) and
 * mapped to Tailwind utilities in globals.css. Contrast is unit-tested (WCAG AA).
 */
export type ColorTokens = {
  bg: string; surface: string; sunken: string;
  ink: string; ink2: string; ink3: string;
  line: string; lineStrong: string;
  accent: string; accentInk: string; accentSoft: string; accentText: string;
  danger: string; focus: string;
};

export type Direction = {
  id: 'a' | 'b';
  name: string;
  summary: string;
  font: string;        // CSS var holding the font family
  radius: string;
  light: ColorTokens;
  dark: ColorTokens;
};

export const directions: Record<'a' | 'b', Direction> = {
  a: {
    id: 'a',
    name: 'Ledger',
    summary: 'Warm paper, ink-black type set in Geist, one deep "money" green. Reads like a bank statement: calm, exact, accountable.',
    font: 'var(--font-geist-sans)',
    radius: '6px',
    light: {
      bg: '#FAFAF7', surface: '#FFFFFF', sunken: '#F2F1EC',
      ink: '#0B0B0C', ink2: '#45453F', ink3: '#62625B',
      line: '#E4E3DC', lineStrong: '#8C8B83',
      accent: '#0F6B45', accentInk: '#FFFFFF', accentSoft: '#E5EFE9', accentText: '#0C5A3A',
      danger: '#B42318', focus: '#0F6B45',
    },
    dark: {
      bg: '#0B0B0C', surface: '#141413', sunken: '#1B1B19',
      ink: '#F4F3EE', ink2: '#BDBCB4', ink3: '#9A998F',
      line: '#2A2A27', lineStrong: '#6A6964',
      accent: '#4CC38A', accentInk: '#06140D', accentSoft: '#13261C', accentText: '#6FD3A2',
      danger: '#F97066', focus: '#4CC38A',
    },
  },
  b: {
    id: 'b',
    name: 'Signal',
    summary: 'Cool white, Inter, one ultramarine accent and the logo\'s speed lines as a recurring motif. Quicker, more kinetic, still restrained.',
    font: 'var(--font-inter)',
    radius: '8px',
    light: {
      bg: '#FFFFFF', surface: '#F6F7F9', sunken: '#EEF0F3',
      ink: '#0E1116', ink2: '#3F4652', ink3: '#5A6270',
      line: '#E4E7EC', lineStrong: '#868E9C',
      accent: '#2A3FD6', accentInk: '#FFFFFF', accentSoft: '#ECEEFC', accentText: '#2436B8',
      danger: '#B42318', focus: '#2A3FD6',
    },
    dark: {
      bg: '#0B0D12', surface: '#12151C', sunken: '#181C25',
      ink: '#F3F4F6', ink2: '#B4BAC5', ink3: '#959DAB',
      line: '#232832', lineStrong: '#5E6778',
      accent: '#8F9BFF', accentInk: '#0B0D12', accentSoft: '#1A1F3A', accentText: '#A7B1FF',
      danger: '#F97066', focus: '#8F9BFF',
    },
  },
};

const VAR: Record<keyof ColorTokens, string> = {
  bg: '--bg', surface: '--surface', sunken: '--sunken', ink: '--ink', ink2: '--ink-2', ink3: '--ink-3',
  line: '--line', lineStrong: '--line-strong', accent: '--accent', accentInk: '--accent-ink',
  accentSoft: '--accent-soft', accentText: '--accent-text', danger: '--danger', focus: '--focus',
};

const block = (sel: string, d: Direction, c: ColorTokens) =>
  `${sel}{${Object.entries(c).map(([k, v]) => `${VAR[k as keyof ColorTokens]}:${v}`).join(';')};--font-brand:${d.font};--radius:${d.radius}}`;

/** CSS for both directions, light + dark. `html[data-direction]` picks the page default; nested [data-direction] scopes override (design page). */
export function tokensCss(): string {
  const a = directions.a, b = directions.b;
  return [
    block(':root,[data-direction="a"]', a, a.light),
    block('[data-direction="b"]', b, b.light),
    `@media (prefers-color-scheme:dark){${block(':root,[data-direction="a"]', a, a.dark)}${block('[data-direction="b"]', b, b.dark)}}`,
  ].join('');
}
