import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import type { ObjectStore } from '../types';

/**
 * SANDBOX STORAGE — files on local disk (default ./.data/uploads). For development and tests only:
 * serverless filesystems are ephemeral. Refused on production deploys by the registry.
 */
export class LocalObjectStore implements ObjectStore {
  readonly key = 'local';
  readonly sandbox = true;
  constructor(private readonly root: string) {}
  private resolve(path: string) {
    const full = normalize(join(this.root, path));
    if (!full.startsWith(normalize(this.root) + sep)) throw new Error('path escapes storage root');
    return full;
  }
  async put(path: string, bytes: Uint8Array, contentType: string) {
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes);
    await writeFile(`${full}.type`, contentType);
  }
  async get(path: string) {
    try {
      const full = this.resolve(path);
      return { bytes: new Uint8Array(await readFile(full)), contentType: (await readFile(`${full}.type`, 'utf8')).trim() };
    } catch {
      return null;
    }
  }
}
