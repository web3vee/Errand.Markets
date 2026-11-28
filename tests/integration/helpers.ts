import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { defaultDb, type JwtClaims } from '../../db/client';
import { adminGrants, markets, serviceAreas, userRoles } from '../../db/schema';
import { ensureUser } from '@/modules/identity/service';
import { getExampleNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import mobileExamples from 'libphonenumber-js/mobile/examples';
import { marketConfig } from '../fixtures/markets';

export const db = () => defaultDb();
export const claimsFor = (id: string, phone = '+1'): JwtClaims => ({ sub: id, role: 'authenticated', phone });

export async function market(code: string) {
  const [m] = await db().select().from(markets).where(eq(markets.code, code));
  return m!;
}
export async function areas(code: string) {
  const m = await market(code);
  return db().select().from(serviceAreas).where(eq(serviceAreas.marketId, m.id));
}

/**
 * A random valid mobile number for a phone region: libphonenumber's example number with its last
 * digits randomised until the result is still a valid mobile number there. No hardcoded prefixes.
 */
export function randomMobile(region: string): string {
  const example = getExampleNumber(region as CountryCode, mobileExamples);
  if (!example) throw new Error(`No example mobile number for ${region}`);
  const base = example.number.slice(0, -4);
  for (let i = 0; i < 200; i++) {
    const candidate = `${base}${Math.floor(Math.random() * 10_000).toString().padStart(4, '0')}`;
    const p = parsePhoneNumberFromString(candidate);
    if (p?.isValid() && p.country === region && ['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(p.getType() ?? '')) return p.number;
  }
  throw new Error(`Could not generate a mobile number for ${region}`);
}

/** Creates auth.users + app user (as a verified sign-in would). Phone comes from one of the market's phone countries. */
export async function makeUser(code: string, name = 'Test User') {
  const m = await market(code);
  const id = randomUUID();
  const regions = marketConfig(code).phoneRegions;
  const phone = randomMobile(regions[Math.floor(Math.random() * regions.length)]!);
  await db().execute(sql`insert into auth.users (id, phone) values (${id}, ${phone})`);
  await ensureUser(db(), { authUserId: id, phoneE164: phone, marketId: m.id, locale: 'en' });
  await db().execute(sql`update users set display_name = ${name} where id = ${id}`);
  return { id, phone, marketId: m.id, claims: claimsFor(id, phone) };
}

export async function makeAdmin(code: string | 'ALL', perms = ['ops']) {
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
