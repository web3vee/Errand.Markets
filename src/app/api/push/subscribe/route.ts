import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deletePushSubscription, savePushSubscription } from '@/modules/notifications/service';
import { currentAccount, defaultDb, getSession } from '@/server/context';

export const runtime = 'nodejs';
const Sub = z.object({ endpoint: z.string().url().max(1000).startsWith('https://'), keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }) });

export async function POST(req: Request) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await savePushSubscription(defaultDb(), account.id, { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent: req.headers.get('user-agent')?.slice(0, 200) ?? null });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await deletePushSubscription(defaultDb(), session.claims, body.endpoint);
  return NextResponse.json({ ok: true });
}
