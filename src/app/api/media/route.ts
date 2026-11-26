import { NextResponse } from 'next/server';
import { MediaError, MEDIA_POLICY, storeImage } from '@/modules/media/service';
import { hitRateLimit } from '@/modules/platform/rate-limit';
import { objectStore } from '@/providers/registry';
import { currentAccount, defaultDb, getMarketById } from '@/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Upload one image (multipart field "file", "kind"). Returns the media id to attach to an errand or message. */
export async function POST(req: Request) {
  const account = await currentAccount();
  if (!account || account.status !== 'active') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MEDIA_POLICY.maxInputBytes + 64 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const limit = await hitRateLimit(defaultDb(), `upload:${account.id}`, 40, 3600);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const kind = form?.get('kind');
  if (!(file instanceof Blob) || (kind !== 'errand_reference' && kind !== 'message_photo')) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const market = await getMarketById(account.marketId);
  if (!market?.id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const r = await storeImage(defaultDb(), objectStore(), {
      ownerId: account.id, marketId: market.id, marketCode: market.code, kind, bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.code }, { status: e.code === 'too_large' ? 413 : 415 });
    throw e;
  }
}
