import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Webhook } from 'standardwebhooks';
import { phoneCountry } from '@/lib/phone';
import { marketSource } from '@/modules/markets/source';
import { providersFor } from '@/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Supabase Auth "Send SMS" hook (Q0 = Option A). Supabase generates the OTP and calls this
 * endpoint (signed with Standard Webhooks); we deliver it through the phone's market SMS provider
 * (Termii in NG, Twilio in VC). NOT YET RUN against a real Supabase project.
 */
export async function POST(req: Request) {
  const secret = process.env.SUPABASE_AUTH_SMS_HOOK_SECRET;
  if (!secret) return NextResponse.json({ error: { http_code: 500, message: 'hook not configured' } }, { status: 500 });
  const raw = await req.text();
  let payload: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    payload = new Webhook(secret.replace(/^v1,whsec_/, '')).verify(raw, Object.fromEntries(req.headers)) as typeof payload;
  } catch {
    return NextResponse.json({ error: { http_code: 401, message: 'invalid signature' } }, { status: 401 });
  }
  const phone = payload.user?.phone ? `+${payload.user.phone.replace(/^\+/, '')}` : null;
  const otp = payload.sms?.otp;
  if (!phone || !otp) return NextResponse.json({ error: { http_code: 400, message: 'missing phone or otp' } }, { status: 400 });
  const country = phoneCountry(phone);
  const market = (await marketSource().list()).find((m) => m.phone.region === country);
  if (!market) return NextResponse.json({ error: { http_code: 400, message: 'phone not in a supported market' } }, { status: 400 });
  const locale = market.uiLanguages[0] ?? 'en';
  const t = await getTranslations({ locale });
  try {
    const { sms, ctx } = providersFor(market, locale);
    await sms.send(ctx, { toE164: phone, body: t('sms.otp', { code: otp }), purpose: 'otp' });
    return NextResponse.json({});
  } catch (e) {
    console.error('sms hook send failed', e);
    return NextResponse.json({ error: { http_code: 502, message: 'sms provider failed' } }, { status: 502 });
  }
}
