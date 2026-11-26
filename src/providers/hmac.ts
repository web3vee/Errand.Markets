import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacHex(alg: 'sha1' | 'sha256' | 'sha512', key: string, data: string): string {
  return createHmac(alg, key).update(data, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex/ASCII signatures. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toLowerCase());
  const y = Buffer.from(b.trim().toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}
