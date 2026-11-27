import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ObjectStore } from '../types';

/**
 * Supabase Storage (private bucket, service-role access from the server only).
 * NOT YET RUN against a real Supabase project.
 */
export class SupabaseObjectStore implements ObjectStore {
  readonly key = 'supabase';
  readonly sandbox = false;
  private client: SupabaseClient;
  constructor(cfg: { url: string; serviceRoleKey: string; bucket: string }) {
    this.client = createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false } });
    this.bucket = cfg.bucket;
  }
  private bucket: string;
  async put(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.client.storage.from(this.bucket).upload(path, bytes, { contentType, upsert: false, cacheControl: '3600' });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  }
  async get(path: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
  }
  async signedUrl(path: string, ttlSeconds: number) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(path, ttlSeconds);
    return error ? null : data.signedUrl;
  }
}
