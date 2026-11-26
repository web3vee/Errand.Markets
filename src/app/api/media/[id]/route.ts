import { NextResponse } from 'next/server';
import { resolveMediaForViewer } from '@/modules/media/service';
import { objectStore } from '@/providers/registry';
import { defaultDb, getSession } from '@/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Serve an image only to someone allowed to see it (RLS + open-errand rule). Never public. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const m = await resolveMediaForViewer(defaultDb(), session.claims, id);
  if (!m) return new NextResponse(null, { status: 404 });
  const store = objectStore();
  const signed = store.signedUrl ? await store.signedUrl(m.storageKey, 300) : null;
  if (signed) return NextResponse.redirect(signed, { status: 302, headers: { 'cache-control': 'private, no-store' } });
  const obj = await store.get(m.storageKey);
  if (!obj) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(obj.bytes), {
    headers: { 'content-type': obj.contentType, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" },
  });
}
