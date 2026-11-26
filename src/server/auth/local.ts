import 'server-only';
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { defaultDb } from '../../../db/client';
import { uuidv7 } from '@/lib/ids';
import { challengeUsable, generateOtp, hashOtp, OTP_POLICY, otpMatches } from '@/modules/identity/domain/otp';
import type { AuthGateway, Session } from './types';

/**
 * LOCAL / SANDBOX AUTH — for development and sandbox environments without Supabase.
 * Same contract as Supabase Auth: OTP codes (hashed, 5-minute expiry, 5 attempts), an
 * `auth.users` row, and an HS256 JWT with { sub, role: 'authenticated', phone } in an
 * httpOnly cookie. Refused on production deploys.
 */
export const SESSION_COOKIE = 'em_session';
const SESSION_HOURS = 12;

function secret() {
  const s = process.env.LOCAL_AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('LOCAL_AUTH_SECRET (≥32 chars) is required when AUTH_MODE=local');
  return s;
}
const jwtKey = () => new TextEncoder().encode(`jwt:${secret()}`);

export async function signLocalSession(userId: string, phone: string) {
  return new SignJWT({ role: 'authenticated', phone })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setAudience('authenticated').setIssuer('errand-local')
    .setIssuedAt().setExpirationTime(`${SESSION_HOURS}h`).setJti(randomUUID()).sign(jwtKey());
}

export async function verifyLocalSession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { audience: 'authenticated', issuer: 'errand-local', algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.phone !== 'string') return null;
    return { userId: payload.sub, phoneE164: payload.phone, claims: { sub: payload.sub, role: 'authenticated', phone: payload.phone } };
  } catch {
    return null;
  }
}

export class LocalAuth implements AuthGateway {
  readonly mode = 'local' as const;

  async startOtp(phone: string, send: (code: string) => Promise<void>) {
    const code = generateOtp();
    const db = defaultDb();
    await db.execute(sql`update auth.local_otp_challenges set consumed_at = now() where phone = ${phone} and consumed_at is null`);
    await db.execute(sql`insert into auth.local_otp_challenges (id, phone, code_hash, expires_at)
      values (${uuidv7()}, ${phone}, ${hashOtp(secret(), phone, code)}, now() + make_interval(secs => ${OTP_POLICY.ttlSeconds}))`);
    try {
      await send(code);
      return { ok: true as const };
    } catch (e) {
      console.error('otp send failed', e);
      return { ok: false as const, error: 'send_failed' as const };
    }
  }

  async verifyOtp(phone: string, code: string) {
    const db = defaultDb();
    return db.transaction(async (tx) => {
      const rows = (await tx.execute(sql`select id, code_hash, attempts, expires_at, consumed_at from auth.local_otp_challenges
        where phone = ${phone} and consumed_at is null order by created_at desc limit 1 for update`)) as unknown as
        { id: string; code_hash: string; attempts: number; expires_at: Date; consumed_at: Date | null }[];
      const c = rows[0];
      if (!c) return { ok: false as const, error: 'expired' as const };
      const state = challengeUsable({ attempts: c.attempts, expiresAt: new Date(c.expires_at), consumedAt: c.consumed_at }, new Date());
      if (state !== 'ok') return { ok: false as const, error: state };
      if (!otpMatches(secret(), phone, code, c.code_hash)) {
        await tx.execute(sql`update auth.local_otp_challenges set attempts = attempts + 1 where id = ${c.id}`);
        return { ok: false as const, error: c.attempts + 1 >= OTP_POLICY.maxAttemptsPerCode ? 'too_many_attempts' as const : 'invalid_code' as const };
      }
      await tx.execute(sql`update auth.local_otp_challenges set consumed_at = now() where id = ${c.id}`);
      const users = (await tx.execute(sql`insert into auth.users (id, phone, last_sign_in_at) values (gen_random_uuid(), ${phone}, now())
        on conflict (phone) do update set last_sign_in_at = now() returning id`)) as unknown as { id: string }[];
      const userId = users[0]!.id;
      const token = await signLocalSession(userId, phone);
      (await cookies()).set(SESSION_COOKIE, token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_HOURS * 3600,
      });
      return { ok: true as const, session: { userId, phoneE164: phone, claims: { sub: userId, role: 'authenticated' as const, phone } } };
    });
  }

  async getSession() {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return token ? verifyLocalSession(token) : null;
  }

  async signOut() {
    (await cookies()).delete(SESSION_COOKIE);
  }
}
