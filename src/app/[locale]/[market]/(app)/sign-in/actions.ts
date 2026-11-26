'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { parseMarketPhone } from '@/lib/phone';
import { OTP_POLICY } from '@/modules/identity/domain/otp';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { ensureUser } from '@/modules/identity/service';
import { hitRateLimit } from '@/modules/platform/rate-limit';
import { auth } from '@/server/auth';
import { clientIp, defaultDb, providersFor, requireMarket } from '@/server/context';
import { clearOtpFlow, getOtpFlow, setOtpFlow } from '@/server/flow-cookie';

export type FormState = { error?: string; values?: Record<string, string> } | null;

async function sendCode(locale: string, marketSlug: string, phone: string): Promise<FormState> {
  const market = await requireMarket(marketSlug);
  const t = await getTranslations({ locale });
  const db = defaultDb();
  const ip = await clientIp();
  const cooldown = await hitRateLimit(db, `otp:cooldown:${phone}`, 1, OTP_POLICY.resendCooldownSeconds);
  if (!cooldown.allowed) return { error: t('auth.errors.resend_cooldown') };
  for (const [key, limit] of [[`otp:send:phone:${phone}`, OTP_POLICY.sendsPerPhonePerHour], [`otp:send:ip:${ip}`, OTP_POLICY.sendsPerIpPerHour]] as const) {
    const r = await hitRateLimit(db, key, limit, 3600);
    if (!r.allowed) return { error: t('auth.errors.rate_limited', { minutes: Math.max(1, Math.ceil(r.retryAfterSeconds / 60)) }) };
  }
  const { sms, ctx } = providersFor(market, locale);
  const res = await auth().startOtp(phone, async (code) => {
    await sms.send(ctx, { toE164: phone, body: t('sms.otp', { code }), purpose: 'otp' });
  });
  return res.ok ? null : { error: t('auth.errors.send_failed') };
}

export async function startSignIn(locale: string, marketSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const market = await requireMarket(marketSlug);
  const t = await getTranslations({ locale });
  const raw = String(form.get('phone') ?? '');
  const parsed = parseMarketPhone(raw, market.phone);
  if (!parsed.ok) {
    return { error: parsed.reason === 'wrong_country' ? t('auth.errors.wrong_country', { market: t(market.nameKey) }) : t('auth.errors.invalid_phone'), values: { phone: raw } };
  }
  const err = await sendCode(locale, marketSlug, parsed.e164);
  if (err) return { ...err, values: { phone: raw } };
  await setOtpFlow({ phone: parsed.e164, market: marketSlug, next: safeNextPath(String(form.get('next') ?? ''), locale) });
  redirect(`/${locale}/${marketSlug}/sign-in/verify`);
}

export async function resendCode(locale: string, marketSlug: string, _prev: FormState): Promise<FormState> {
  const flow = await getOtpFlow();
  const t = await getTranslations({ locale });
  if (!flow || flow.market !== marketSlug) return { error: t('auth.errors.session_expired') };
  return sendCode(locale, marketSlug, flow.phone);
}

export async function verifySignIn(locale: string, marketSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations({ locale });
  const flow = await getOtpFlow();
  if (!flow || flow.market !== marketSlug) return { error: t('auth.errors.session_expired') };
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  const limit = await hitRateLimit(defaultDb(), `otp:verify:${flow.phone}`, OTP_POLICY.verifiesPerPhonePerHour, 3600);
  if (!limit.allowed) return { error: t('auth.errors.rate_limited', { minutes: Math.max(1, Math.ceil(limit.retryAfterSeconds / 60)) }) };

  const res = await auth().verifyOtp(flow.phone, code);
  if (!res.ok) return { error: t(`auth.errors.${res.error}`) };

  const market = await requireMarket(marketSlug);
  const user = await ensureUser(defaultDb(), { authUserId: res.session.userId, phoneE164: flow.phone, marketId: market.id, locale });
  await clearOtpFlow();
  const next = flow.next ?? `/${locale}/${marketSlug}/account`;
  redirect(user.displayName ? next : `/${locale}/${marketSlug}/onboarding?next=${encodeURIComponent(next)}`);
}
