import type { JwtClaims } from '../../../db/client';

/** A signed-in user. `phoneE164` is null for Google accounts that haven't verified a phone yet. */
export type Session = { userId: string; phoneE164: string | null; email: string | null; name: string | null; claims: JwtClaims };

export type StartResult = { ok: true } | { ok: false; error: 'send_failed' | 'phone_taken' };
export type VerifyResult = { ok: true; session: Session } | { ok: false; error: 'invalid_code' | 'expired' | 'too_many_attempts' | 'phone_taken' };

/**
 * Sign-in by phone OTP or Google, and adding a verified phone to an account that has none.
 * Two implementations: Supabase Auth (production) and local (sandbox/dev, with a stand-in for Google).
 */
export interface AuthGateway {
  readonly mode: 'supabase' | 'local';
  startOtp(phoneE164: string, send: (code: string) => Promise<void>): Promise<StartResult>;
  verifyOtp(phoneE164: string, code: string): Promise<VerifyResult>;
  /** Signed-in user adds a phone: send a code to it (refused if another account already has it). */
  startPhoneLink(phoneE164: string, send: (code: string) => Promise<void>): Promise<StartResult>;
  verifyPhoneLink(phoneE164: string, code: string): Promise<VerifyResult>;
  /**
   * Where to send the browser to sign in with Google; it comes back to `callbackUrl`.
   * null = no real Google here (local mode): the caller shows the sandbox stand-in instead.
   */
  googleStartUrl(callbackUrl: string): Promise<string | null>;
  /** Finish a Google sign-in from the callback's `code` (Supabase PKCE). */
  googleFinish(code: string): Promise<Session | null>;
  getSession(): Promise<Session | null>;
  signOut(): Promise<void>;
}
