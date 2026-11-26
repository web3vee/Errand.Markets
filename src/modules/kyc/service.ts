import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { asSystem, asUser, type Db, type JwtClaims, type Tx } from '../../../db/client';
import { adminAuditLog, kycVerifications, providerWebhookEvents, runnerProfiles, runnerRules, users } from '../../../db/schema';
import { uuidv7 } from '@/lib/ids';
import type { KycEvent, KycLaunch, KycProvider, ProviderContext, WebhookResult } from '@/providers/types';
import { allowedDecisions, applyProviderResult, computeFlags, hashIdNumber, type AdminDecision, type RejectReason, type VerificationStatus } from './domain/rules';
import { isNull } from 'drizzle-orm';

type MarketRef = { id: string; code: string; kycAutoApprove: boolean };

export class KycError extends Error {
  constructor(public readonly code: 'not_a_runner' | 'already_approved' | 'in_review' | 'not_found' | 'decision_not_allowed' | 'out_of_scope') { super(code); }
}

/** Start (or restart) identity verification for a Runner. */
export async function startVerification(db: Db, deps: { kyc: KycProvider; ctx: ProviderContext; market: MarketRef }, input: {
  userId: string; phoneE164: string; locale: string; returnUrl: string;
}): Promise<{ verificationId: string; launch: KycLaunch }> {
  const verificationId = uuidv7();
  const level = await asSystem(db, 'kyc.startVerification (runner self-service)', async (tx) => {
    const [rp] = await tx.select({ kycStatus: runnerProfiles.kycStatus }).from(runnerProfiles).where(eq(runnerProfiles.userId, input.userId)).for('update');
    if (!rp) throw new KycError('not_a_runner');
    if (rp.kycStatus === 'approved') throw new KycError('already_approved');
    if (rp.kycStatus === 'in_review') throw new KycError('in_review');
    const [rules] = await tx.select({ level: runnerRules.requiredKycLevel }).from(runnerRules)
      .where(and(eq(runnerRules.marketId, deps.market.id), isNull(runnerRules.effectiveTo)));
    // Abandoned attempts are superseded.
    await tx.update(kycVerifications).set({ status: 'cancelled' })
      .where(and(eq(kycVerifications.userId, input.userId), inArray(kycVerifications.status, ['created', 'submitted'])));
    await tx.insert(kycVerifications).values({
      id: verificationId, userId: input.userId, marketId: deps.market.id, provider: deps.kyc.key, level: rules?.level ?? 'default', status: 'created',
    });
    await tx.update(runnerProfiles).set({ kycStatus: 'pending' }).where(eq(runnerProfiles.userId, input.userId));
    return rules?.level ?? 'default';
  });
  const session = await deps.kyc.startSession(deps.ctx, {
    verificationId, userId: input.userId, phoneE164: input.phoneE164, level, locale: input.locale, returnUrl: input.returnUrl,
  });
  if (session.providerRef) {
    await asSystem(db, 'kyc.startVerification store provider ref', (tx) =>
      tx.update(kycVerifications).set({ providerRef: session.providerRef }).where(eq(kycVerifications.id, verificationId)));
  }
  return { verificationId, launch: session.launch };
}

/**
 * Store a verified webhook (deduplicated by provider+event id) and apply its events.
 * Re-delivery of an already processed event is a no-op; a previously failed one is retried.
 */
export async function ingestKycWebhook(db: Db, input: {
  providerKey: string; market: MarketRef; verified: Extract<WebhookResult<KycEvent>, { valid: true }>; rawPayload: unknown; pepper: string; now?: Date;
}): Promise<{ outcome: 'processed' | 'duplicate' | 'ignored' }> {
  const now = input.now ?? new Date();
  return asSystem(db, `kyc.webhook ${input.providerKey}`, async (tx) => {
    const inserted = await tx.insert(providerWebhookEvents).values({
      provider: input.providerKey, marketId: input.market.id, eventId: input.verified.eventId, eventType: input.verified.eventType,
      signatureValid: true, payload: redact(input.rawPayload),
    }).onConflictDoNothing().returning({ id: providerWebhookEvents.id });
    let eventRowId = inserted[0]?.id;
    if (!eventRowId) {
      const [existing] = await tx.select().from(providerWebhookEvents)
        .where(and(eq(providerWebhookEvents.provider, input.providerKey), eq(providerWebhookEvents.eventId, input.verified.eventId))).for('update');
      if (!existing || existing.status === 'processed' || existing.status === 'ignored') return { outcome: 'duplicate' as const };
      eventRowId = existing.id;
    }
    if (input.verified.events.length === 0) {
      await tx.update(providerWebhookEvents).set({ status: 'ignored', processedAt: now, attempts: sql`${providerWebhookEvents.attempts} + 1` }).where(eq(providerWebhookEvents.id, eventRowId));
      return { outcome: 'ignored' as const };
    }
    for (const ev of input.verified.events) await applyKycEvent(tx, { ...input, now }, ev);
    await tx.update(providerWebhookEvents).set({ status: 'processed', processedAt: now, attempts: sql`${providerWebhookEvents.attempts} + 1` }).where(eq(providerWebhookEvents.id, eventRowId));
    return { outcome: 'processed' as const };
  });
}

async function applyKycEvent(tx: Tx, input: { providerKey: string; market: MarketRef; pepper: string; now: Date }, ev: KycEvent) {
  const provider = input.providerKey === 'sandbox-kyc' ? 'sandbox' : input.providerKey;
  const where = ev.verificationId
    ? eq(kycVerifications.id, ev.verificationId)
    : ev.providerRef && !ev.userId
      ? and(eq(kycVerifications.provider, provider), eq(kycVerifications.providerRef, ev.providerRef))
      : and(eq(kycVerifications.provider, provider), eq(kycVerifications.userId, ev.userId ?? '00000000-0000-0000-0000-000000000000'));
  const [v] = await tx.select().from(kycVerifications).where(and(where, eq(kycVerifications.marketId, input.market.id)))
    .orderBy(desc(kycVerifications.createdAt)).limit(1).for('update');
  if (!v) throw new Error(`KYC event for unknown verification (${ev.verificationId ?? ev.providerRef ?? ev.userId})`);
  if (['admin_approved', 'admin_rejected', 'cancelled'].includes(v.status)) return; // decided or superseded: ignore late events

  const [u] = await tx.select({ displayName: users.displayName }).from(users).where(eq(users.id, v.userId));
  const [rules] = await tx.select({ minAge: runnerRules.minAgeYears }).from(runnerRules)
    .where(and(eq(runnerRules.marketId, input.market.id), isNull(runnerRules.effectiveTo)));

  const idHash = ev.result.idNumber && ev.result.documentType
    ? hashIdNumber(input.pepper, input.market.code, ev.result.documentType, ev.result.idNumber) : null;
  const duplicate = idHash
    ? (await tx.select({ id: kycVerifications.id }).from(kycVerifications).where(and(
        eq(kycVerifications.idNumberHash, idHash), ne(kycVerifications.userId, v.userId),
        inArray(kycVerifications.status, ['provider_approved', 'admin_approved']),
      )).limit(1)).length > 0
    : false;
  const { flags, ageYears } = computeFlags({ result: ev.result, minAgeYears: rules?.minAge ?? 18, now: input.now, duplicate, displayName: u?.displayName ?? null });
  const next = applyProviderResult(ev.result, { autoApprove: input.market.kycAutoApprove, flags });

  await tx.update(kycVerifications).set({
    status: next.verification,
    providerRef: v.providerRef ?? ev.providerRef,
    idNumberHash: idHash ?? v.idNumberHash,
    submittedAt: v.submittedAt ?? input.now,
    resultSummary: {
      checks: ev.result.checks, documentType: ev.result.documentType ?? null, nameOnDocument: ev.result.nameOnDocument ?? null,
      ageYears, flags, reasons: ev.result.reasons ?? [], autoApproved: next.autoApproved,
    },
  }).where(eq(kycVerifications.id, v.id));
  await tx.update(runnerProfiles).set({ kycStatus: next.runner, kycApprovedAt: next.runner === 'approved' ? input.now : null })
    .where(eq(runnerProfiles.userId, v.userId));
}

/** Admin decision. Caller must already hold `ops` for the verification's market (checked again here). */
export async function decideVerification(db: Db, input: {
  adminId: string; adminScope: 'all' | string[]; verificationId: string; decision: AdminDecision; reasonCode: RejectReason | null; note: string | null; now?: Date;
}) {
  const now = input.now ?? new Date();
  return asSystem(db, 'kyc.decideVerification (admin, scope checked)', async (tx) => {
    const [v] = await tx.select().from(kycVerifications).where(eq(kycVerifications.id, input.verificationId)).for('update');
    if (!v) throw new KycError('not_found');
    if (input.adminScope !== 'all' && !input.adminScope.includes(v.marketId)) throw new KycError('out_of_scope');
    if (!allowedDecisions(v.status as VerificationStatus).includes(input.decision)) throw new KycError('decision_not_allowed');
    const [latest] = await tx.select({ id: kycVerifications.id }).from(kycVerifications)
      .where(and(eq(kycVerifications.userId, v.userId), ne(kycVerifications.status, 'cancelled'))).orderBy(desc(kycVerifications.createdAt)).limit(1);
    if (latest?.id !== v.id) throw new KycError('decision_not_allowed');

    const map = {
      approve: { verification: 'admin_approved', runner: 'approved' },
      reject: { verification: 'admin_rejected', runner: 'rejected' },
      request_resubmission: { verification: 'needs_resubmission', runner: 'resubmission_required' },
    } as const;
    const next = map[input.decision];
    await tx.update(kycVerifications).set({
      status: next.verification, reviewedBy: input.adminId, reviewedAt: now,
      reviewReasonCode: input.decision === 'approve' ? null : input.reasonCode, reviewNote: input.note,
    }).where(eq(kycVerifications.id, v.id));
    await tx.update(runnerProfiles).set({ kycStatus: next.runner, kycApprovedAt: next.runner === 'approved' ? now : null })
      .where(eq(runnerProfiles.userId, v.userId));
    await tx.insert(adminAuditLog).values({
      actorId: input.adminId, marketId: v.marketId, action: `kyc.${input.decision}`, subjectType: 'kyc_verification', subjectId: v.id,
      data: { userId: v.userId, reasonCode: input.reasonCode, note: input.note, from: v.status, to: next.verification },
    });
    return { userId: v.userId, marketId: v.marketId, runnerStatus: next.runner };
  });
}

export type ReviewRow = {
  verificationId: string; userId: string; marketId: string; displayName: string | null; phoneE164: string; provider: string;
  status: string; runnerStatus: string; submittedAt: Date | null; summary: unknown; reviewReasonCode: string | null; reviewNote: string | null; reviewedAt: Date | null;
};

/** Admin review queue — read through RLS as the admin (RLS limits rows to the admin's markets). */
export async function listReviews(db: Db, claims: JwtClaims, filter: { marketIds: string[] | 'all'; statuses: string[] }) {
  return asUser(db, claims, async (tx) => {
    const conds = [ne(kycVerifications.status, 'cancelled')];
    if (filter.statuses.length) conds.push(inArray(runnerProfiles.kycStatus, filter.statuses as never));
    if (filter.marketIds !== 'all') conds.push(inArray(kycVerifications.marketId, filter.marketIds.length ? filter.marketIds : ['00000000-0000-0000-0000-000000000000']));
    const rows = await tx.selectDistinctOn([kycVerifications.userId], {
      verificationId: kycVerifications.id, userId: kycVerifications.userId, marketId: kycVerifications.marketId,
      displayName: users.displayName, phoneE164: users.phoneE164, provider: kycVerifications.provider, status: kycVerifications.status,
      runnerStatus: runnerProfiles.kycStatus, submittedAt: kycVerifications.submittedAt, summary: kycVerifications.resultSummary,
      reviewReasonCode: kycVerifications.reviewReasonCode, reviewNote: kycVerifications.reviewNote, reviewedAt: kycVerifications.reviewedAt,
    }).from(kycVerifications)
      .innerJoin(users, eq(users.id, kycVerifications.userId))
      .innerJoin(runnerProfiles, eq(runnerProfiles.userId, kycVerifications.userId))
      .where(and(...conds))
      .orderBy(kycVerifications.userId, desc(kycVerifications.createdAt));
    return (rows as ReviewRow[]).sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));
  });
}

export async function getReview(db: Db, claims: JwtClaims, verificationId: string) {
  return asUser(db, claims, async (tx) => {
    const [row] = await tx.select({
      verificationId: kycVerifications.id, userId: kycVerifications.userId, marketId: kycVerifications.marketId,
      displayName: users.displayName, phoneE164: users.phoneE164, provider: kycVerifications.provider, status: kycVerifications.status,
      runnerStatus: runnerProfiles.kycStatus, submittedAt: kycVerifications.submittedAt, summary: kycVerifications.resultSummary,
      reviewReasonCode: kycVerifications.reviewReasonCode, reviewNote: kycVerifications.reviewNote, reviewedAt: kycVerifications.reviewedAt,
    }).from(kycVerifications)
      .innerJoin(users, eq(users.id, kycVerifications.userId))
      .innerJoin(runnerProfiles, eq(runnerProfiles.userId, kycVerifications.userId))
      .where(eq(kycVerifications.id, verificationId));
    return (row as ReviewRow | undefined) ?? null;
  });
}

/** The Runner's own latest verification (status page). */
export async function myLatestVerification(db: Db, claims: JwtClaims) {
  return asUser(db, claims, async (tx) => {
    const [v] = await tx.select({ id: kycVerifications.id, status: kycVerifications.status, reviewReasonCode: kycVerifications.reviewReasonCode, createdAt: kycVerifications.createdAt })
      .from(kycVerifications).where(and(eq(kycVerifications.userId, claims.sub), ne(kycVerifications.status, 'cancelled')))
      .orderBy(desc(kycVerifications.createdAt)).limit(1);
    return v ?? null;
  });
}

/** Keep ID numbers, names and dates of birth out of the stored webhook payload. */
export function redact(payload: unknown): unknown {
  const SENSITIVE = /(id_?number|idnumber|nin|bvn|number|dob|date_?of_?birth|first_?name|last_?name|surname|name|image|photo|selfie|base64|address|phone)/i;
  const walk = (v: unknown, key = ''): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, k)]));
    if (typeof v === 'string' && SENSITIVE.test(key) && !/^(type|status|reviewAnswer)$/i.test(key)) return '[redacted]';
    return v;
  };
  return walk(payload);
}
