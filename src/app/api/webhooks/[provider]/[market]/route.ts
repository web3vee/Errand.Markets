import { NextResponse } from 'next/server';
import { handleKycWebhook } from '@/server/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Provider webhooks: /api/webhooks/{provider}/{market}. Currently KYC providers (sandbox-kyc, dojah, sumsub). */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string; market: string }> }) {
  const { provider, market } = await params;
  const rawBody = await req.text(); // raw body: signatures are computed over exact bytes
  const r = await handleKycWebhook(provider, market, rawBody, req.headers);
  return NextResponse.json(r.body, { status: r.status });
}
