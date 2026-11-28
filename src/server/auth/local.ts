import 'server-only';
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { defaultDb, type Tx } from '../../../db/client';
import { uuidv7 } from '@/lib/ids';
import { challengeUsable, generateOtp, hashOtp, OTP_POLICY, otpMatches } from '@/modules/identity/domain/otp';
import type { AuthGateway, Session, VerifyResult } from './types';

/**
 * LOCAL / SANDBOX AUTH — for development and sandbox environments without Supabase.
 * Same contract as Supabase Auth: OTP codes (hashed, 5-minute expiry, 5 attempts), an
 * `auth.users` row, and an HS256 JWT with { sub, role: 'authenticated', phone?, email? } in an
 * httpOnly cookie. Google sign-in is replaced by a labelled sandbox page (no Google account
 * involved). Refused on production deploys.
 */
export const SESSION_COOKIE = 'em_session';
const SESSION_HOURS = 12;

function secret() {
  const s = process.env.LOCAL_AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('LOCAL_AUTH_SECRET (≥32 chars) is required when AUTH_MODE=local');
  return s;
}
const jwtKey = () => new TextEncoder().encode(`jwt:${secret()}`);

type Identity = { phone: string | null; email: string | null; name: string | null };

export async function signLocalSession(userId: string, id: Identity | string) {
  const who = typeof id === 'string' ? { phone: id, email: null, name: null } : id;
  return new SignJWT({ role: 'authenticated', ...(who.phone ? { phone: who.phone } : {}), ...(who.email ? { email: who.email } : {}), ...(who.name ? { name: who.name } : {}) })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setAudience('authenticated').setIssuer('errand-local')
    .setIssuedAt().setExpirationTime(`${SESSION_HOURS}h`).setJti(randomUUID()).sign(jwtKey());
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export async function verifyLocalSession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { audience: 'authenticated', issuer: 'errand-local', algorithms: ['HS256'] });
    const phone = str(payload.phone); const email = str(payload.email);
    if (!payload.sub || (!phone && !email)) return null;
    return { userId: payload.sub, phoneE164: phone, email, name: str(payload.name), claims: { sub: payload.sub, role: 'authenticated', ...(phone ? { phone } : {}), ...(email ? { email } : {}) } };
  } catch {
    return null;
  }
}

async function setSessionCookie(userId: string, who: Identity): Promise<Session> {
  const token = await signLocalSession(userId, who);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_HOURS * 3600,
  });
  return (await verifyLocalSession(token))!;
}

/** Check (and consume) the newest code sent to a phone. */
async function consumeCode(tx: Tx, phone: string, code: string): Promise<'ok' | 'invalid_code' | 'expired' | 'too_many_attempts'> {
  const rows = (await tx.execute(sql`select id, code_hash, attempts, expires_at, consumed_at from auth.local_otp_challenges
    where phone = ${phone} and consumed_at is null order by created_at desc limit 1 for update`)) as unknown as
    { id: string; code_hash: string; attempts: number; expires_at: Date; consumed_at: Date | null }[];
  const c = rows[0];
  if (!c) return 'expired';
  const state = challengeUsable({ attempts: c.attempts, expiresAt: new Date(c.expires_at), consumedAt: c.consumed_at }, new Date());
  if (state !== 'ok') return state;
  if (!otpMatches(secret(), phone, code, c.code_hash)) {
    await tx.execute(sql`update auth.local_otp_challenges set attempts = attempts + 1 where id = ${c.id}`);
    return c.attempts + 1 >= OTP_POLICY.maxAttemptsPerCode ? 'too_many_attempts' : 'invalid_code';
  }
  await tx.execute(sql`update auth.local_otp_challenges set consumed_at = now() where id = ${c.id}`);
  return 'ok';
}

async function sendCode(phone: string, send: (code: string) => Promise<void>) {
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

export class LocalAuth implements AuthGateway {
  readonly mode = 'local' as const;

  startOtp(phone: string, send: (code: string) => Promise<void>) {
    return sendCode(phone, send);
  }

  async verifyOtp(phone: string, code: string): Promise<VerifyResult> {
    return defaultDb().transaction(async (tx) => {
      const state = await consumeCode(tx, phone, code);
      if (state !== 'ok') return { ok: false as const, error: state };
      const rows = (await tx.execute(sql`insert into auth.users (id, phone, last_sign_in_at) values (gen_random_uuid(), ${phone}, now())
        on conflict (phone) do update set last_sign_in_at = now() returning id, email, raw_user_meta_data ->> 'name' as name`)) as unknown as { id: string; email: string | null; name: string | null }[];
      const u = rows[0]!;
      return { ok: true as const, session: await setSessionCookie(u.id, { phone, email: u.email, name: u.name }) };
    });
  }

  async startPhoneLink(phone: string, send: (code: string) => Promise<void>) {
    const me = await this.getSession();
    if (!me) return { ok: false as const, error: 'send_failed' as const };
    const taken = (await defaultDb().execute(sql`select 1 from auth.users where phone = ${phone} and id <> ${me.userId}`)) as unknown as unknown[];
    if (taken.length) return { ok: false as const, error: 'phone_taken' as const };
    return sendCode(phone, send);
  }

  async verifyPhoneLink(phone: string, code: string): Promise<VerifyResult> {
    const me = await this.getSession();
    if (!me) return { ok: false as const, error: 'expired' as const };
    return defaultDb().transaction(async (tx) => {
      const state = await consumeCode(tx, phone, code);
      if (state !== 'ok') return { ok: false as const, error: state };
      const taken = (await tx.execute(sql`select 1 from auth.users where phone = ${phone} and id <> ${me.userId}`)) as unknown as unknown[];
      if (taken.length) return { ok: false as const, error: 'phone_taken' as const };
      await tx.execute(sql`update auth.users set phone = ${phone} where id = ${me.userId}`);
      return { ok: true as const, session: await setSessionCookie(me.userId, { phone, email: me.email, name: me.name }) };
    });
  }

  /** No real Google in local mode: the caller shows the sandbox stand-in page. */
  async googleStartUrl() {
    return null;
  }

  async googleFinish() {
    return null;
  }

  /**
   * SANDBOX ONLY — stands in for "Continue with Google": signs in (or creates) the account with
   * this email, exactly as a Google identity would arrive from Supabase (email + name, no phone).
   */
  async sandboxGoogleSignIn(email: string, name: string | null): Promise<Session> {
    const rows = (await defaultDb().execute(sql`insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at)
      values (gen_random_uuid(), ${email}, ${JSON.stringify(name ? { name, provider: 'google' } : { provider: 'google' })}::jsonb, now())
      on conflict (email) do update set last_sign_in_at = now() returning id, phone, raw_user_meta_data ->> 'name' as name`)) as unknown as { id: string; phone: string | null; name: string | null }[];
    const u = rows[0]!;
    return setSessionCookie(u.id, { phone: u.phone, email, name: u.name ?? name });
  }

  async getSession() {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return token ? verifyLocalSession(token) : null;
  }

  async signOut() {
    (await cookies()).delete(SESSION_COOKIE);
  }
}
