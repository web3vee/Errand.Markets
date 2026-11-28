import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { auth } from '@/server/auth';
import { getMarket } from '@/server/context';
import { finishSignIn } from '@/server/sign-in';

/**
 * Google comes back here (through Supabase) with ?code=… plus the locale, market and next page we
 * sent. Exchanges the code for a session, creates the account if needed, then continues.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const locale = (routing.locales as readonly string[]).includes(q.get('locale') ?? '') ? q.get('locale')! : routing.defaultLocale;
  const market = await getMarket(q.get('market') ?? '');
  if (!market) return NextResponse.redirect(new URL(`/${locale}/markets`, req.url));
  const signIn = new URL(`/${locale}/${market.slug}/sign-in?error=google`, req.url);
  const code = q.get('code');
  if (!code || q.get('error')) return NextResponse.redirect(signIn);
  const session = await auth().googleFinish(code);
  if (!session) return NextResponse.redirect(signIn);
  const target = await finishSignIn(session, locale, market.slug, safeNextPath(q.get('next'), locale));
  return NextResponse.redirect(new URL(target, req.url));
}
