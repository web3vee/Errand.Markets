'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localized } from '@/lib/localized-text';
import { parseMarketPhone } from '@/lib/phone';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { IdentityError, linkVerifiedPhone, phoneBelongsToOther } from '@/modules/identity/service';
import { auth } from '@/server/auth';
import { defaultDb, requireAccount } from '@/server/context';
import { clearOtpFlow, getOtpFlow, setOtpFlow } from '@/server/flow-cookie';
import { limitCodeChecks, sendPhoneCode } from '@/server/otp';
import type { FormState } from '../../sign-in/actions';

const accountPath = (locale: string, slug: string) => `/${locale}/${slug}/account`;

/** A signed-in account without a phone (Google sign-in) adds one: validate it, then text a code. */
export async function startPhoneLink(locale: string, marketSlug: string, next: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { account, market } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/account/phone`, { allowNoName: true });
  const safeNext = safeNextPath(next, locale);
  if (account.phoneE164) redirect(safeNext ?? accountPath(locale, marketSlug));
  const t = await getTranslations({ locale });
  const raw = String(form.get('phone') ?? '');
  const parsed = parseMarketPhone(raw, market.phoneRegions);
  if (!parsed.ok) {
    return { error: parsed.reason === 'wrong_country' ? t('auth.errors.wrong_country', { market: localized(market.name, locale) }) : t('auth.errors.invalid_phone'), values: { phone: raw } };
  }
  if (await phoneBelongsToOther(defaultDb(), account.id, parsed.e164)) return { error: t('auth.errors.phone_taken'), values: { phone: raw } };
  const err = await sendPhoneCode(locale, marketSlug, parsed.e164, 'link');
  if (err) return { error: err, values: { phone: raw } };
  await setOtpFlow({ phone: parsed.e164, market: marketSlug, next: safeNext, purpose: 'link' });
  redirect(`/${locale}/${marketSlug}/account/phone/verify`);
}

export async function resendPhoneLink(locale: string, marketSlug: string, _prev: FormState): Promise<FormState> {
  await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/account/phone`, { allowNoName: true });
  const t = await getTranslations({ locale });
  const flow = await getOtpFlow('link');
  if (!flow || flow.market !== marketSlug) return { error: t('auth.errors.session_expired') };
  const err = await sendPhoneCode(locale, marketSlug, flow.phone, 'link');
  return err ? { error: err } : null;
}

export async function verifyPhoneLink(locale: string, marketSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { account } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/account/phone`, { allowNoName: true });
  const t = await getTranslations({ locale });
  const flow = await getOtpFlow('link');
  if (!flow || flow.market !== marketSlug) return { error: t('auth.errors.session_expired') };
  const limited = await limitCodeChecks(locale, flow.phone);
  if (limited) return { error: limited };
  const res = await auth().verifyPhoneLink(flow.phone, String(form.get('code') ?? '').replace(/\D/g, ''));
  if (!res.ok) return { error: t(`auth.errors.${res.error}`) };
  try {
    await linkVerifiedPhone(defaultDb(), account.id, flow.phone);
  } catch (e) {
    if (e instanceof IdentityError) return { error: t(e.code === 'phone_taken' ? 'auth.errors.phone_taken' : 'common.error') };
    throw e;
  }
  await clearOtpFlow();
  redirect(flow.next ?? `${accountPath(locale, marketSlug)}?phone=added`);
}
