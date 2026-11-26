import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { defaultDb, type JwtClaims } from '../../db/client';
import { adminGrants, markets, serviceAreas, userRoles } from '../../db/schema';
import { ensureUser } from '@/modules/identity/service';

export const db = () => defaultDb();
export const claimsFor = (id: string, phone = '+1'): JwtClaims => ({ sub: id, role: 'authenticated', phone });

export async function market(code: 'NG' | 'VC') {
  const [m] = await db().select().from(markets).where(eq(markets.code, code));
  return m!;
}
export async function areas(code: 'NG' | 'VC') {
  const m = await market(code);
  return db().select().from(serviceAreas).where(eq(serviceAreas.marketId, m.id));
}

/** Creates auth.users + app user (as a verified sign-in would). */
export async function makeUser(code: 'NG' | 'VC', name = 'Test User') {
  const m = await market(code);
  const id = randomUUID();
  const digits = (k: number) => Array.from({ length: k }, () => Math.floor(Math.random() * 10)).join('');
  const phone = code === 'NG' ? `+2348${digits(9)}` : `+1784${digits(7)}`;
  await db().execute(sql`insert into auth.users (id, phone) values (${id}, ${phone})`);
  await ensureUser(db(), { authUserId: id, phoneE164: phone, marketId: m.id, locale: 'en' });
  await db().execute(sql`update users set display_name = ${name} where id = ${id}`);
  return { id, phone, marketId: m.id, claims: claimsFor(id, phone) };
}

export async function makeAdmin(code: 'NG' | 'VC' | 'ALL', perms = ['ops']) {
  const u = await makeUser(code === 'ALL' ? 'NG' : code, 'Admin');
  await db().insert(userRoles).values({ userId: u.id, role: 'admin' });
  await db().insert(adminGrants).values({ userId: u.id, marketId: code === 'ALL' ? null : (await market(code)).id, permissions: perms });
  return u;
}

/** Drizzle wraps driver errors ("Failed query: …"); the Postgres message is on `cause`. */
export async function expectDbError(p: Promise<unknown>, re: RegExp) {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    const text = `${err.message} ${err.cause?.message ?? ''}`;
    if (!re.test(text)) throw new Error(`expected ${re} but got: ${text.slice(0, 300)}`);
    return;
  }
  throw new Error(`expected ${re} but the query succeeded`);
}
