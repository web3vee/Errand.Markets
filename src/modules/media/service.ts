import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { asSystem, asUser, type Db, type JwtClaims } from '../../../db/client';
import { errands, media, runnerProfiles, users } from '../../../db/schema';
import { uuidv7 } from '@/lib/ids';
import type { ObjectStore } from '@/providers/types';

export const MEDIA_POLICY = { maxInputBytes: 8 * 1024 * 1024, maxEdge: 1600, quality: 72, maxPixels: 50_000_000 } as const;
export type MediaKind = 'errand_reference' | 'message_photo' | 'proof' | 'receipt' | 'avatar';
export class MediaError extends Error {
  constructor(public readonly code: 'too_large' | 'unsupported' | 'not_found') { super(code); }
}

/**
 * Normalise an uploaded image: verify it really is JPEG/PNG/WebP (by decoding, not by name),
 * apply EXIF rotation, drop ALL metadata (incl. GPS), cap the long edge, re-encode as WebP.
 * Small files matter on slow, expensive data.
 */
export async function sanitizeImage(input: Uint8Array) {
  if (input.byteLength > MEDIA_POLICY.maxInputBytes) throw new MediaError('too_large');
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: MEDIA_POLICY.maxPixels }).metadata();
  } catch {
    throw new MediaError('unsupported');
  }
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) throw new MediaError('unsupported');
  const { data, info } = await sharp(input, { limitInputPixels: MEDIA_POLICY.maxPixels })
    .rotate()
    .resize({ width: MEDIA_POLICY.maxEdge, height: MEDIA_POLICY.maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: MEDIA_POLICY.quality })
    .toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), width: info.width, height: info.height, contentType: 'image/webp', sha256: createHash('sha256').update(data).digest('hex') };
}

export async function storeImage(db: Db, store: ObjectStore, input: {
  ownerId: string; marketId: string; marketCode: string; kind: MediaKind; bytes: Uint8Array; conversationId?: string | null;
}) {
  const img = await sanitizeImage(input.bytes);
  const id = uuidv7();
  const storageKey = `${input.marketCode.toLowerCase()}/${input.kind}/${id}.webp`;
  await store.put(storageKey, img.bytes, img.contentType);
  await asSystem(db, 'media.store (owner verified by caller)', (tx) => tx.insert(media).values({
    id, marketId: input.marketId, ownerId: input.ownerId, kind: input.kind, storageKey, contentType: img.contentType,
    bytes: img.bytes.byteLength, width: img.width, height: img.height, sha256: img.sha256, conversationId: input.conversationId ?? null,
  }));
  return { id, width: img.width, height: img.height, bytes: img.bytes.byteLength };
}

/**
 * Can this user view this image? RLS covers owners, errand participants, conversation participants
 * and admins. One extra case: reference photos of an OPEN errand are visible to verified Runners
 * of the same market (so they can decide whether to accept).
 */
export async function resolveMediaForViewer(db: Db, claims: JwtClaims, mediaId: string) {
  const [viaRls] = await asUser(db, claims, (tx) => tx.select().from(media).where(eq(media.id, mediaId)));
  if (viaRls) return viaRls;
  return asSystem(db, 'media.view open-errand reference for verified runner', async (tx) => {
    const [m] = await tx.select().from(media).where(and(eq(media.id, mediaId), eq(media.kind, 'errand_reference')));
    if (!m?.errandId) return null;
    const [e] = await tx.select({ status: errands.status, marketId: errands.marketId }).from(errands).where(eq(errands.id, m.errandId));
    const [rp] = await tx.select({ kyc: runnerProfiles.kycStatus, marketId: runnerProfiles.marketId }).from(runnerProfiles).where(eq(runnerProfiles.userId, claims.sub));
    const [u] = await tx.select({ status: users.status }).from(users).where(eq(users.id, claims.sub));
    return e?.status === 'open' && rp?.kyc === 'approved' && rp.marketId === e.marketId && u?.status === 'active' ? m : null;
  });
}

/** Attach the owner's unattached uploads to an errand (inside the caller's transaction). */
export async function attachErrandMedia(tx: Parameters<Parameters<Db['transaction']>[0]>[0], ownerId: string, errandId: string, mediaIds: string[]) {
  if (!mediaIds.length) return 0;
  const rows = await tx.update(media).set({ errandId })
    .where(and(inArray(media.id, mediaIds), eq(media.ownerId, ownerId), eq(media.kind, 'errand_reference'), isNull(media.errandId)))
    .returning({ id: media.id });
  return rows.length;
}
