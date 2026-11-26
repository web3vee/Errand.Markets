import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import type { AuthGateway, Session } from './types';

/**
 * Supabase Auth (Q0 = Option A). Supabase generates and checks the OTP; delivery goes through
 * our Send-SMS hook (/api/auth/sms-hook) to the market's SMS provider.
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

export class SupabaseAuth implements AuthGateway {
  readonly mode = 'supabase' as const;

  // `send` is unused: Supabase calls our SMS hook, which sends via the market's provider.
  async startOtp(phone: string) {
    const sb = await client();
    const { error } = await sb.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
    if (error) { console.error('supabase otp start', error.message); return { ok: false as const, error: 'send_failed' as const }; }
    return { ok: true as const };
  }

  async verifyOtp(phone: string, code: string) {
    const sb = await client();
    const { data, error } = await sb.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (error || !data.session || !data.user) {
      const expired = /expired/i.test(error?.message ?? '');
      return { ok: false as const, error: expired ? 'expired' as const : 'invalid_code' as const };
    }
    return { ok: true as const, session: toSession(data.session.access_token, phone) };
  }

  async getSession(): Promise<Session | null> {
    const sb = await client();
    const { data: { user } } = await sb.auth.getUser(); // validates the JWT with Supabase
    if (!user) return null;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    return toSession(session.access_token, user.phone ? `+${user.phone.replace(/^\+/, '')}` : '');
  }

  async signOut() {
    await (await client()).auth.signOut();
  }
}

function toSession(accessToken: string, phone: string): Session {
  const c = decodeJwt(accessToken);
  return { userId: c.sub!, phoneE164: phone, claims: { ...(c as Record<string, unknown>), sub: c.sub!, role: 'authenticated', phone } };
}
