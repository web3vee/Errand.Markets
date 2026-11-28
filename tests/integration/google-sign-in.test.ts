import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { serviceAreas, users } from '../../db/schema';
import { createErrand } from '@/modules/errands/service';
import { becomeRunner, ensureUser, getAccount, IdentityError, linkVerifiedPhone, phoneBelongsToOther } from '@/modules/identity/service';
import { ALL_MARKET_CODES, firstAreaSlug, marketConfig } from '../fixtures/markets';
import { claimsFor, db, expectDbError, makeUser, market, randomMobile } from './helpers';

/** A user as Google sign-in creates them: email + Google name, no phone. */
async function makeGoogleUser(code: string, name: string | null = 'Gloria Google') {
  const m = await market(code);
  const id = randomUUID();
  const email = `g-${id.slice(0, 8)}@example.com`;
  await db().execute(sql`insert into auth.users (id, email) values (${id}, ${email})`);
  const created = await ensureUser(db(), { authUserId: id, phoneE164: null, email, displayName: name, marketId: m.id, locale: 'en' });
  return { id, email, marketId: m.id, claims: claimsFor(id), created };
}

async function postErrand(code: string, customerId: string) {
  const m = await market(code);
  const [area] = await db().select().from(serviceAreas).where(and(eq(serviceAreas.marketId, m.id), eq(serviceAreas.slug, firstAreaSlug(code))));
  return createErrand(db(), {
    customerId, marketId: m.id, categoryKey: 'delivery', title: 'Deliver a parcel', description: '', priceMinor: 5000n,
    requiresPurchase: false, items: [], windowKind: 'asap', windowEnd: null, mediaIds: [], publish: true,
    stops: [{ kind: 'dropoff', serviceAreaId: area!.id, lat: null, lng: null, pinSource: 'area_center', landmark: 'Green door by the shop', contactName: null, contactPhoneE164: null, instructions: null }],
  });
}

describe.each(ALL_MARKET_CODES)('Google sign-in — %s', (code) => {
  it('creates a customer with email and Google name, and no phone', async () => {
    const g = await makeGoogleUser(code);
    expect(g.created).toMatchObject({ created: true, displayName: 'Gloria Google', marketId: g.marketId });
    const acct = await getAccount(db(), g.claims);
    expect(acct).toMatchObject({ phoneE164: null, email: g.email, displayName: 'Gloria Google' });
    expect(acct!.roles.map((r) => r.role)).toEqual(['customer']);
  });

  it('must verify a phone before posting or becoming a Runner; afterwards both work', async () => {
    const g = await makeGoogleUser(code);
    await expectDbError(postErrand(code, g.id), /verified phone number is required/);
    await expect(becomeRunner(db(), g.id)).rejects.toMatchObject({ code: 'phone_required' });

    const regions = marketConfig(code).phoneRegions;
    const phone = randomMobile(regions[regions.length - 1]!);
    await linkVerifiedPhone(db(), g.id, phone);
    expect((await getAccount(db(), g.claims))?.phoneE164).toBe(phone);
    expect((await postErrand(code, g.id)).status).toBe('open');
    await becomeRunner(db(), g.id);
    expect((await getAccount(db(), g.claims))?.runner).not.toBeNull();
  });
});

describe('phone linking rules', () => {
  it("refuses a number that belongs to another account, and never replaces a user's number", async () => {
    const phoneUser = await makeUser('NG');
    const g = await makeGoogleUser('NG');
    expect(await phoneBelongsToOther(db(), g.id, phoneUser.phone)).toBe(true);
    expect(await phoneBelongsToOther(db(), phoneUser.id, phoneUser.phone)).toBe(false);
    await expect(linkVerifiedPhone(db(), g.id, phoneUser.phone)).rejects.toMatchObject({ code: 'phone_taken' });

    const mine = randomMobile('NG');
    await linkVerifiedPhone(db(), g.id, mine);
    await linkVerifiedPhone(db(), g.id, mine); // idempotent
    await expect(linkVerifiedPhone(db(), g.id, randomMobile('NG'))).rejects.toMatchObject({ code: 'phone_already_set' });
  });

  it('the database refuses Runner roles/profiles without a phone, and accounts with no contact at all', async () => {
    const g = await makeGoogleUser('VC', null);
    await expectDbError(db().execute(sql`insert into user_roles (user_id, role) values (${g.id}, 'runner')`), /verified phone number is required/);
    await expectDbError(db().execute(sql`insert into runner_profiles (user_id, market_id) values (${g.id}, ${g.marketId})`), /verified phone number is required/);
    await expectDbError(db().update(users).set({ email: null }).where(eq(users.id, g.id)), /users_phone_or_email/);
    await expect(ensureUser(db(), { authUserId: randomUUID(), phoneE164: null, email: null, marketId: g.marketId, locale: 'en' }))
      .rejects.toBeInstanceOf(IdentityError);
  });

  it('a signed-in user cannot set their own phone through RLS (only the verified-OTP path can)', async () => {
    const g = await makeGoogleUser('NG');
    await expectDbError(
      db().transaction(async (tx) => {
        await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(g.claims)}, true), set_config('role', 'authenticated', true)`);
        await tx.update(users).set({ phoneE164: randomMobile('NG') }).where(eq(users.id, g.id));
      }),
      /permission denied/,
    );
  });
});
