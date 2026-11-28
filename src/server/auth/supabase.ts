import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { Session as SbSession, User } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import type { AuthGateway, Session, VerifyResult } from './types';

/**
 * Supabase Auth (Q0 = Option A). Supabase generates and checks the OTP; delivery goes through
 * our Send-SMS hook (/api/auth/sms-hook) to the market's SMS provider. Google sign-in uses
 * Supabase's Google provider with the PKCE flow (code verifier kept in a cookie by @supabase/ssr).
 * Adding a phone to a Google account is Supabase's phone-change flow (updateUser → OTP → verify).
 * NOT YET RUN against a real Supabase project (no credentials in this environment).
 */
async function client() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { for (const c of list) store.set(c.name, c.value, c.options); } catch { /* called from a Server Component; middleware refreshes */ }
      },
    },
  });
}

const phoneTaken = (msg: string | undefined) => /already|exists|registered|taken/i.test(msg ?? '');

export class SupabaseAuth implements AuthGateway {
  readonly mode = 'supabase' as const;

  // `send` is unused: Supabase calls our SMS hook, which sends via the market's provider.
  async startOtp(phone: string) {
    const sb = await client();
    const { error } = await sb.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
    if (error) { console.error('supabase otp start', error.message); return { ok: false as const, error: 'send_failed' as const }; }
    return { ok: true as const };
  }

  async verifyOtp(phone: string, code: string): Promise<VerifyResult> {
    const sb = await client();
    const { data, error } = await sb.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (error || !data.session || !data.user) {
      const expired = /expired/i.test(error?.message ?? '');
      return { ok: false as const, error: expired ? 'expired' as const : 'invalid_code' as const };
    }
    return { ok: true as const, session: toSession(data.session, data.user) };
  }

  async startPhoneLink(phone: string) {
    const sb = await client();
    const { error } = await sb.auth.updateUser({ phone });
    if (error) {
      if (phoneTaken(error.message)) return { ok: false as const, error: 'phone_taken' as const };
      console.error('supabase phone link start', error.message);
      return { ok: false as const, error: 'send_failed' as const };
    }
    return { ok: true as const };
  }

  async verifyPhoneLink(phone: string, code: string): Promise<VerifyResult> {
    const sb = await client();
    const { data, error } = await sb.auth.verifyOtp({ phone, token: code, type: 'phone_change' });
    if (error || !data.session || !data.user) {
      if (phoneTaken(error?.message)) return { ok: false as const, error: 'phone_taken' as const };
      return { ok: false as const, error: /expired/i.test(error?.message ?? '') ? 'expired' as const : 'invalid_code' as const };
    }
    return { ok: true as const, session: toSession(data.session, data.user) };
  }

  async googleStartUrl(callbackUrl: string) {
    const sb = await client();
    const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl, skipBrowserRedirect: true } });
    if (error || !data.url) { console.error('supabase google start', error?.message); throw new Error('google_unavailable'); }
    return data.url;
  }

  async googleFinish(code: string) {
    const sb = await client();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user) { console.error('supabase google finish', error?.message); return null; }
    return toSession(data.session, data.user);
  }

  async getSession(): Promise<Session | null> {
    const sb = await client();
    const { data: { user } } = await sb.auth.getUser(); // validates the JWT with Supabase
    if (!user) return null;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    return toSession(session, user);
  }

  async signOut() {
    await (await client()).auth.signOut();
  }
}

function toSession(session: SbSession, user: User): Session {
  const c = decodeJwt(session.access_token);
  const phone = user.phone ? `+${user.phone.replace(/^\+/, '')}` : null;
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const name = meta.full_name ?? meta.name ?? null;
  return {
    userId: c.sub!, phoneE164: phone, email: user.email ?? null, name,
    claims: { ...(c as Record<string, unknown>), sub: c.sub!, role: 'authenticated', ...(phone ? { phone } : {}) },
  };
}
