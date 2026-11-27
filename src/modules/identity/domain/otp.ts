import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Security constants (platform-wide, not market config). */
export const OTP_POLICY = {
  length: 6,
  ttlSeconds: 300,
  maxAttemptsPerCode: 5,
  resendCooldownSeconds: 60,
  sendsPerPhonePerHour: 5,
  sendsPerIpPerHour: 20,
  verifiesPerPhonePerHour: 15,
} as const;

export function generateOtp(rand: (max: number) => number = randomInt): string {
  return String(rand(10 ** OTP_POLICY.length)).padStart(OTP_POLICY.length, '0');
}

/** Codes are stored only as an HMAC bound to the phone number. */
export function hashOtp(secret: string, phoneE164: string, code: string): string {
  return createHmac('sha256', `otp:${secret}`).update(`${phoneE164}:${code}`).digest('hex');
}

export function otpMatches(secret: string, phoneE164: string, code: string, storedHash: string): boolean {
  if (!/^\d+$/.test(code) || code.length !== OTP_POLICY.length) return false;
  const a = Buffer.from(hashOtp(secret, phoneE164, code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ChallengeState = { attempts: number; expiresAt: Date; consumedAt: Date | null };
export function challengeUsable(c: ChallengeState, now: Date): 'ok' | 'expired' | 'too_many_attempts' {
  if (c.consumedAt || c.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (c.attempts >= OTP_POLICY.maxAttemptsPerCode) return 'too_many_attempts';
  return 'ok';
}
