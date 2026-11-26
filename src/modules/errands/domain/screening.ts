/** Prohibited-item screening (per-market list from config). Pure. */
export type ProhibitedRule = { id: string; label: string; keywords: string[]; action: 'block' | 'review' };
export type ScreenResult = { action: 'allow' | 'review' | 'block'; matches: { id: string; label: string; keyword: string }[] };

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Whole-word / whole-phrase match, case- and accent-insensitive, tolerant of a trailing plural "s".
 * "block" beats "review"; any match on a "review" rule holds the errand for an admin.
 */
export function screenText(texts: string[], rules: ProhibitedRule[]): ScreenResult {
  const hay = ` ${normalize(texts.join(' \n ')).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const matches: ScreenResult['matches'] = [];
  for (const r of rules) {
    for (const kw of r.keywords) {
      const k = normalize(kw).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!k) continue;
      if (hay.includes(` ${k} `) || hay.includes(` ${k}s `) || hay.includes(` ${k}es `)) {
        matches.push({ id: r.id, label: r.label, keyword: kw });
        break;
      }
    }
  }
  const hit = (a: 'block' | 'review') => matches.some((m) => rules.find((r) => r.id === m.id)?.action === a);
  return { action: hit('block') ? 'block' : hit('review') ? 'review' : 'allow', matches };
}
