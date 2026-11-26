import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { resolveMarket } from './modules/markets/domain/resolve';
import { activeMarketRouting } from './modules/markets/static-routing';

import { MARKET_COOKIE } from './modules/markets/cookie';
const intl = createMiddleware(routing);
const markets = activeMarketRouting();

/** Supabase mode: refresh the auth session cookie on navigation (per @supabase/ssr guidance). */
async function refreshSupabaseSession(req: NextRequest, res: NextResponse) {
  if (process.env.AUTH_MODE !== 'supabase' || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => { for (const c of list) res.cookies.set(c.name, c.value, c.options); },
    },
  });
  await sb.auth.getUser();
}

export default async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // "/en" → show the visitor's market homepage without a redirect round-trip (matters on 3G).
  const root = pathname.match(/^\/([^/]+)\/?$/);
  if (root && (routing.locales as readonly string[]).includes(root[1]!)) {
    const market = resolveMarket(markets, {
      cookie: req.cookies.get(MARKET_COOKIE)?.value,
      geoCountry: req.headers.get('x-vercel-ip-country'),
    });
    const target = `/${root[1]}/${market ?? 'markets'}${search}`;
    return NextResponse.rewrite(new URL(target, req.url));
  }

  const res = intl(req);

  // Visiting /{locale}/{market}/… remembers the choice (works without JavaScript).
  const seg = pathname.match(/^\/[^/]+\/([a-z]{2})(?:\/|$)/);
  if (seg && markets.some((m) => m.slug === seg[1])) {
    res.cookies.set(MARKET_COOKIE, seg[1]!, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  }
  await refreshSupabaseSession(req, res);
  return res;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|brand|icons|manifest.webmanifest|.*\\..*).*)'],
};
