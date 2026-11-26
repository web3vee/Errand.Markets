import 'server-only';
import { createTranslator } from 'next-intl';
import { formatMoney } from '@/lib/money';
import en from '../../messages/en.json';

/** Render a notification's text in the recipient's language (outside a request, e.g. in a job). */
const CATALOGS: Record<string, typeof en> = { en };

export function renderNotification(locale: string, type: string, payload: Record<string, unknown>) {
  const lang = new Intl.Locale(locale).language;
  const t = createTranslator({ locale: lang, messages: CATALOGS[lang] ?? en });
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) if (typeof v === 'string' || typeof v === 'number') values[k] = String(v);
  if (payload.priceMinor && payload.currency && payload.minorUnit !== undefined) {
    values.price = formatMoney(BigInt(String(payload.priceMinor)), { code: String(payload.currency), minorUnit: Number(payload.minorUnit), displaySymbol: (payload.displaySymbol as string) ?? null }, String(payload.formatLocale ?? locale));
  }
  const title = t(`notify.${type}.title` as never, values as never) as string;
  const body = t(`notify.${type}.body` as never, values as never) as string;
  return { title, body, sms: t('notify.sms', { title, body }) as string };
}
