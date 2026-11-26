/**
 * Design tokens — single source of truth (direction A, "Ledger", chosen in Stage 2).
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

export const theme = {
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
  } satisfies ColorTokens,
  dark: {
    bg: '#0B0B0C', surface: '#141413', sunken: '#1B1B19',
    ink: '#F4F3EE', ink2: '#BDBCB4', ink3: '#9A998F',
    line: '#2A2A27', lineStrong: '#6A6964',
    accent: '#4CC38A', accentInk: '#06140D', accentSoft: '#13261C', accentText: '#6FD3A2',
    danger: '#F97066', focus: '#4CC38A',
  } satisfies ColorTokens,
} as const;

const VAR: Record<keyof ColorTokens, string> = {
  bg: '--bg', surface: '--surface', sunken: '--sunken', ink: '--ink', ink2: '--ink-2', ink3: '--ink-3',
  line: '--line', lineStrong: '--line-strong', accent: '--accent', accentInk: '--accent-ink',
  accentSoft: '--accent-soft', accentText: '--accent-text', danger: '--danger', focus: '--focus',
};

const vars = (c: ColorTokens) => Object.entries(c).map(([k, v]) => `${VAR[k as keyof ColorTokens]}:${v}`).join(';');

/** CSS custom properties, light + dark (follows the system setting). */
export function tokensCss(): string {
  return `:root{${vars(theme.light)};--font-brand:${theme.font};--radius:${theme.radius}}@media (prefers-color-scheme:dark){:root{${vars(theme.dark)}}}`;
}
