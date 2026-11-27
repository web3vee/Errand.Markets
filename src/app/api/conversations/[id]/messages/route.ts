import { NextResponse } from 'next/server';
import { getThread } from '@/modules/messaging/service';
import { markReadByKey } from '@/modules/notifications/service';
import { defaultDb, getSession } from '@/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Polling fallback for chat (used when Supabase Realtime isn't configured). RLS decides access. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const after = new URL(req.url).searchParams.get('after');
  if (!/^[0-9a-f-]{36}$/.test(id) || (after && !/^[0-9a-f-]{36}$/.test(after))) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const thread = await getThread(defaultDb(), session.claims, id, { afterId: after });
  if (!thread) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (thread.messages.length) await markReadByKey(defaultDb(), session.claims, `conversation:${id}`);
  return NextResponse.json({
    status: thread.conversation.status,
    messages: thread.messages.map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, mediaId: m.mediaId, createdAt: m.createdAt.toISOString() })),
  }, { headers: { 'cache-control': 'private, no-store' } });
}
