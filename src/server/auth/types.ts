import type { JwtClaims } from '../../../db/client';

export type Session = { userId: string; phoneE164: string; claims: JwtClaims };

export type StartResult = { ok: true } | { ok: false; error: 'send_failed' };
export type VerifyResult = { ok: true; session: Session } | { ok: false; error: 'invalid_code' | 'expired' | 'too_many_attempts' };

/** Sign-in by phone OTP. Two implementations: Supabase Auth (production) and local (sandbox/dev). */
export interface AuthGateway {
  readonly mode: 'supabase' | 'local';
  startOtp(phoneE164: string, send: (code: string) => Promise<void>): Promise<StartResult>;
  verifyOtp(phoneE164: string, code: string): Promise<VerifyResult>;
  getSession(): Promise<Session | null>;
  signOut(): Promise<void>;
}
