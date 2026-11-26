import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/ui/contrast';
import { directions, type ColorTokens } from '@/ui/tokens';

// [foreground, background, minimum ratio, why]
const PAIRS: [keyof ColorTokens, keyof ColorTokens, number, string][] = [
  ['ink', 'bg', 7, 'body text (AAA target)'],
  ['ink2', 'bg', 4.5, 'secondary text'],
  ['ink3', 'bg', 4.5, 'tertiary text'],
  ['ink2', 'surface', 4.5, 'secondary text on panels'],
  ['ink3', 'surface', 4.5, 'tertiary text on panels'],
  ['ink3', 'sunken', 4.5, 'tertiary text on sunken'],
  ['accentInk', 'accent', 4.5, 'primary button label'],
  ['accentText', 'bg', 4.5, 'accent-coloured text'],
  ['accentText', 'accentSoft', 4.5, 'status pill text'],
  ['accent', 'bg', 3, 'non-text UI: focus ring, icons (1.4.11)'],
  ['lineStrong', 'bg', 3, 'control borders (1.4.11)'],
  ['danger', 'bg', 4.5, 'error text'],
  ['ink', 'accentSoft', 4.5, 'text on selection/soft accent'],
];

for (const d of Object.values(directions)) {
  for (const scheme of ['light', 'dark'] as const) {
    describe(`direction ${d.id} (${d.name}) — ${scheme}`, () => {
      const t = d[scheme];
      it.each(PAIRS)('%s on %s ≥ %s — %s', (fg, bg, min) => {
        expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
      });
    });
  }
}
