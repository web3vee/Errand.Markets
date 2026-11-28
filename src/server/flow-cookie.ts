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

/** `purpose`: 'sign_in' (phone sign-in) or 'link' (a signed-in Google account adding its phone). */
export type OtpFlow = { phone: string; market: string; next: string | null; purpose: 'sign_in' | 'link' };

export async function setOtpFlow(flow: OtpFlow) {
  const token = await new SignJWT(flow).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(key());
  (await cookies()).set(NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
}

async function readOtpFlow(): Promise<OtpFlow | null> {
  const token = (await cookies()).get(NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return typeof payload.phone === 'string' && typeof payload.market === 'string'
      ? { phone: payload.phone, market: payload.market, next: typeof payload.next === 'string' ? payload.next : null, purpose: payload.purpose === 'link' ? 'link' : 'sign_in' } : null;
  } catch {
    return null;
  }
}

/** The pending flow, only if it was started for `purpose` (a sign-in code can't finish a phone link, and vice versa). */
export async function getOtpFlow(purpose: OtpFlow['purpose'] = 'sign_in'): Promise<OtpFlow | null> {
  const f = await readOtpFlow();
  return f && f.purpose === purpose ? f : null;
}

export async function clearOtpFlow() {
  (await cookies()).delete(NAME);
}
