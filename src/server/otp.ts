import 'server-only';
import { getTranslations } from 'next-intl/server';
import { OTP_POLICY } from '@/modules/identity/domain/otp';
import { hitRateLimit } from '@/modules/platform/rate-limit';
import { auth } from './auth';
import { clientIp, defaultDb, providersFor, requireMarket } from './context';

/**
 * Send a 6-digit code to a phone (sign-in, or a signed-in account adding its phone), with the same
 * cooldown and per-phone / per-IP limits for both. Returns an error message or null.
 * NOT a server action: callers validate the number against the market first.
 */
export async function sendPhoneCode(locale: string, marketSlug: string, phone: string, purpose: 'sign_in' | 'link'): Promise<string | null> {
  const market = await requireMarket(marketSlug);
  const t = await getTranslations({ locale });
  const db = defaultDb();
  const ip = await clientIp();
  const cooldown = await hitRateLimit(db, `otp:cooldown:${phone}`, 1, OTP_POLICY.resendCooldownSeconds);
  if (!cooldown.allowed) return t('auth.errors.resend_cooldown');
  for (const [key, limit] of [[`otp:send:phone:${phone}`, OTP_POLICY.sendsPerPhonePerHour], [`otp:send:ip:${ip}`, OTP_POLICY.sendsPerIpPerHour]] as const) {
    const r = await hitRateLimit(db, key, limit, 3600);
    if (!r.allowed) return t('auth.errors.rate_limited', { minutes: Math.max(1, Math.ceil(r.retryAfterSeconds / 60)) });
  }
  const { sms, ctx } = providersFor(market, locale);
  const send = async (code: string) => { await sms.send(ctx, { toE164: phone, body: t('sms.otp', { code }), purpose: 'otp' }); };
  const res = purpose === 'link' ? await auth().startPhoneLink(phone, send) : await auth().startOtp(phone, send);
  if (res.ok) return null;
  return t(res.error === 'phone_taken' ? 'auth.errors.phone_taken' : 'auth.errors.send_failed');
}

/** Rate-limit code checks per phone. Returns an error message or null. */
export async function limitCodeChecks(locale: string, phone: string): Promise<string | null> {
  const t = await getTranslations({ locale });
  const limit = await hitRateLimit(defaultDb(), `otp:verify:${phone}`, OTP_POLICY.verifiesPerPhonePerHour, 3600);
  return limit.allowed ? null : t('auth.errors.rate_limited', { minutes: Math.max(1, Math.ceil(limit.retryAfterSeconds / 60)) });
}
