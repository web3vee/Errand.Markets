import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js';

/**
 * Pseudo-localisation for layout testing (dev/preview only):
 *  - 'long': accented + ~50% longer, bracketed — catches truncation and hardcoded strings
 *  - 'rtl' : bidi-overridden text — used with the `ar-XB` locale (dir=rtl) to test mirroring
 * Only literal text is changed; ICU arguments, plurals and rich-text tags are preserved.
 */
const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ó', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ó', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

function transformText(text: string, mode: 'long' | 'rtl'): string {
  if (!text.trim()) return text;
  if (mode === 'rtl') return `‮${text}‬`;
  const accented = [...text].map((ch) => ACCENTS[ch] ?? ch).join('');
  const pad = '·'.repeat(Math.max(1, Math.round(text.length * 0.5)));
  return `${accented}${pad}`;
}

function walk(els: MessageFormatElement[], mode: 'long' | 'rtl'): MessageFormatElement[] {
  return els.map((el) => {
    if (el.type === TYPE.literal) return { ...el, value: transformText(el.value, mode) };
    if (el.type === TYPE.tag) return { ...el, children: walk(el.children, mode) };
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      const options = Object.fromEntries(
        Object.entries(el.options).map(([k, v]) => [k, { ...v, value: walk(v.value, mode) }]),
      );
      return { ...el, options } as MessageFormatElement;
    }
    return el;
  });
}

export function pseudoLocalize(message: string, mode: 'long' | 'rtl'): string {
  const ast = walk(parse(message), mode);
  const out = printAST(ast);
  return mode === 'long' ? `[${out}]` : out;
}

type Messages = { [k: string]: string | Messages };
export function pseudoLocalizeMessages(messages: Messages, mode: 'long' | 'rtl'): Messages {
  return Object.fromEntries(
    Object.entries(messages).map(([k, v]) => [k, typeof v === 'string' ? pseudoLocalize(v, mode) : pseudoLocalizeMessages(v, mode)]),
  );
}
