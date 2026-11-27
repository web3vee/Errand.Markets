import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sweep } from '@/server/workflows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Backstop for the Inngest cron (e.g. Vercel Cron). Requires `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await sweep());
}
