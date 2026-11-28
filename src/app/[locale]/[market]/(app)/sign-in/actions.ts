'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { localized } from '@/lib/localized-text';
import { parseMarketPhone } from '@/lib/phone';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { auth, authMode } from '@/server/auth';
import { LocalAuth } from '@/server/auth/local';
import { requireMarket } from '@/server/context';
import { clearOtpFlow, getOtpFlow, setOtpFlow } from '@/server/flow-cookie';
import { limitCodeChecks, sendPhoneCode } from '@/server/otp';
import { appOrigin, finishSignIn, googleSignInEnabled } from '@/server/sign-in';

export type FormState = { error?: string; values?: Record<string, string> } | null;

export async function startSignIn(locale: string, marketSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const market = await requireMarket(marketSlug);
  const t = await getTranslations({ locale });
  const raw = String(form.get('phone') ?? '');
  const parsed = parseMarketPhone(raw, market.phoneRegions);
  if (!parsed.ok) {
    return { error: parsed.reason === 'wrong_country' ? t('auth.errors.wrong_country', { market: localized(market.name, locale) }) : t('auth.errors.invalid_phone'), values: { phone: raw } };
  }
  const err = await sendPhoneCode(locale, marketSlug, parsed.e164, 'sign_in');
  if (err) return { error: err, values: { phone: raw } };
  await setOtpFlow({ phone: parsed.e164, market: marketSlug, next: safeNextPath(String(form.get('next') ?? ''), locale), purpose: 'sign_in' });
  redirect(`/${locale}/${marketSlug}/sign-in/verify`);
}

export async function resendCode(locale: string, marketSlug: string, _prev: FormState): Promise<FormState> {
  const flow = await getOtpFlow('sign_in');
  const t = await getTranslations({ locale });
  if (!flow || flow.market !== marketSlug) return { error: t('auth.errors.session_expired') };
  const err = await sendPhoneCode(locale, marketSlug, flow.phone, 'sign_in');
  return err ? { error: err } : null;
}

export async function verifySignIn(locale: string, marketSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations({ locale });
  const flow = await getOtpFlow('sign_in');
  if (!flow || flow.market !== marketSlug) return { error: t('auth.errors.session_expired') };
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  const limited = await limitCodeChecks(locale, flow.phone);
  if (limited) return { error: limited };

  const res = await auth().verifyOtp(flow.phone, code);
  if (!res.ok) return { error: t(`auth.errors.${res.error}`) };
  await clearOtpFlow();
  redirect(await finishSignIn(res.session, locale, marketSlug, flow.next));
}

/** "Continue with Google": off to Google (via Supabase), or to the sandbox stand-in in local mode. */
export async function startGoogleSignIn(locale: string, marketSlug: string, next: string | null): Promise<void> {
  await requireMarket(marketSlug);
  if (!googleSignInEnabled()) redirect(`/${locale}/${marketSlug}/sign-in`);
  const safeNext = safeNextPath(next, locale);
  const query = new URLSearchParams({ locale, market: marketSlug, ...(safeNext ? { next: safeNext } : {}) });
  const url = await auth().googleStartUrl(`${await appOrigin()}/api/auth/google/callback?${query}`);
  redirect(url ?? `/${locale}/${marketSlug}/sign-in/google-sandbox?${new URLSearchParams(safeNext ? { next: safeNext } : {})}`);
}

const SandboxGoogle = z.object({ email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().max(60) });

/** SANDBOX ONLY: completes the Google stand-in. Refused outside local auth mode. */
export async function sandboxGoogleSignIn(locale: string, marketSlug: string, next: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations({ locale });
  if (authMode() !== 'local') return { error: t('common.error') };
  const parsed = SandboxGoogle.safeParse({ email: form.get('email'), name: form.get('name') ?? '' });
  if (!parsed.success) return { error: t('auth.google.sandboxInvalidEmail'), values: { email: String(form.get('email') ?? ''), name: String(form.get('name') ?? '') } };
  const session = await new LocalAuth().sandboxGoogleSignIn(parsed.data.email, parsed.data.name || null);
  redirect(await finishSignIn(session, locale, marketSlug, safeNextPath(next, locale)));
}
