import 'server-only';
import { headers } from 'next/headers';
import { ensureUser } from '@/modules/identity/service';
import { authMode, type Session } from './auth';
import { defaultDb, requireMarket } from './context';

/**
 * Google sign-in is offered when it can work: always in local mode (sandbox stand-in page), and in
 * Supabase mode once the Google provider is configured in Supabase and AUTH_GOOGLE_ENABLED=1.
 */
export function googleSignInEnabled(): boolean {
  return authMode() === 'local' || process.env.AUTH_GOOGLE_ENABLED === '1';
}

/** Public origin for OAuth callbacks: NEXT_PUBLIC_APP_URL, else the request's own host. */
export async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * After any verified sign-in (phone or Google): make sure the account exists, then decide where to go.
 * Google accounts are created in the market they signed in from, with their Google name, and no phone.
 */
export async function finishSignIn(session: Session, locale: string, marketSlug: string, next: string | null): Promise<string> {
  const market = await requireMarket(marketSlug);
  const user = await ensureUser(defaultDb(), {
    authUserId: session.userId, phoneE164: session.phoneE164, email: session.email, displayName: session.name, marketId: market.id, locale,
  });
  const target = next ?? `/${locale}/${marketSlug}/account`;
  return user.displayName ? target : `/${locale}/${marketSlug}/onboarding?next=${encodeURIComponent(target)}`;
}
