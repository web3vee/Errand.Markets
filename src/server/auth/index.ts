import 'server-only';
import { LocalAuth } from './local';
import { SupabaseAuth } from './supabase';
import type { AuthGateway } from './types';

export function authMode(): 'local' | 'supabase' {
  const mode = process.env.AUTH_MODE ?? (process.env.NEXT_PUBLIC_SUPABASE_URL ? 'supabase' : 'local');
  if (mode === 'local' && process.env.VERCEL_ENV === 'production') throw new Error('AUTH_MODE=local is not allowed on production deploys');
  return mode === 'supabase' ? 'supabase' : 'local';
}

let gateway: AuthGateway | null = null;
export function auth(): AuthGateway {
  gateway ??= authMode() === 'supabase' ? new SupabaseAuth() : new LocalAuth();
  return gateway;
}
export type { Session } from './types';
