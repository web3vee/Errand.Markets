import 'server-only';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';

/** Short-lived signed cookie carrying the phone between "send code" and "enter code" (keeps PII out of URLs). */
const NAME = 'em_otp';
const key = () => {
  const s = process.env.APP_SECRET ?? process.env.LOCAL_AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('APP_SECRET (≥32 chars) is required');
  return new TextEncoder().encode(`flow:${s}`);
};

export type OtpFlow = { phone: string; market: string; next: string | null };

export async function setOtpFlow(flow: OtpFlow) {
  const token = await new SignJWT(flow).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(key());
  (await cookies()).set(NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
}

export async function getOtpFlow(): Promise<OtpFlow | null> {
  const token = (await cookies()).get(NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return typeof payload.phone === 'string' && typeof payload.market === 'string'
      ? { phone: payload.phone, market: payload.market, next: typeof payload.next === 'string' ? payload.next : null } : null;
  } catch {
    return null;
  }
}

export async function clearOtpFlow() {
  (await cookies()).delete(NAME);
}
