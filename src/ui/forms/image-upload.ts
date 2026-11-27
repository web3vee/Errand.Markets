'use client';

/**
 * Downscale on the device before upload (long edge 1600px, JPEG 0.8): a 4 MB phone photo
 * becomes ~250 KB — matters on slow, expensive data. The server re-encodes and strips metadata anyway.
 */
export async function downscale(file: File, maxEdge = 1600): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 600_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', 0.8));
  } catch {
    return file;
  }
}

export async function uploadImage(file: File, kind: 'errand_reference' | 'message_photo'): Promise<{ id: string } | { error: string }> {
  const body = new FormData();
  body.set('file', await downscale(file), 'photo.jpg');
  body.set('kind', kind);
  const res = await fetch('/api/media', { method: 'POST', body });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  return res.ok && json.id ? { id: json.id } : { error: json.error ?? 'upload_failed' };
}
