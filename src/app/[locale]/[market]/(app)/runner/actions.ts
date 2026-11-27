'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { kycVerifications } from '../../../../../../db/schema';
import { parseMarketPhone } from '@/lib/phone';
import { becomeRunner, updateRunnerProfile } from '@/modules/identity/service';
import { KycError, startVerification } from '@/modules/kyc/service';
import { SANDBOX_SIGNATURE_HEADER, SandboxKycPayload, signSandboxPayload } from '@/providers/kyc/sandbox';
import { providerMode } from '@/providers/registry';
import type { KycLaunch } from '@/providers/types';
import { defaultDb, providersFor, requireAccount } from '@/server/context';
import { handleKycWebhook } from '@/server/webhooks';
import type { FormState } from '../sign-in/actions';

export async function becomeRunnerAction(locale: string, marketSlug: string) {
  const { account } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/account`);
  await becomeRunner(defaultDb(), account.id);
  redirect(`/${locale}/${marketSlug}/runner/profile`);
}

const ProfileInput = z.object({
  bio: z.string().trim().max(280).optional().transform((v) => v || null),
  vehicle: z.enum(['none', 'bicycle', 'motorbike', 'car']),
  areas: z.array(z.string().uuid()).min(1),
  emergencyName: z.string().trim().max(60).optional().transform((v) => v || null),
  emergencyPhone: z.string().trim().max(32).optional().transform((v) => v || null),
});

export async function saveRunnerProfile(locale: string, marketSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { session, market } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/runner/profile`);
  const t = await getTranslations({ locale });
  const parsed = ProfileInput.safeParse({
    bio: form.get('bio') ?? undefined, vehicle: form.get('vehicle'), areas: form.getAll('areas'),
    emergencyName: form.get('emergencyName') ?? undefined, emergencyPhone: form.get('emergencyPhone') ?? undefined,
  });
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '');
    return { error: t(field === 'areas' ? 'runnerOnboarding.errors.areas' : field === 'bio' ? 'runnerOnboarding.errors.bio' : 'common.error') };
  }
  let emergencyPhone: string | null = null;
  if (parsed.data.emergencyPhone) {
    const p = parseMarketPhone(parsed.data.emergencyPhone, market.phone);
    if (!p.ok) return { error: t('runnerOnboarding.errors.emergency_phone') };
    emergencyPhone = p.e164;
  }
  try {
    await updateRunnerProfile(defaultDb(), session.claims, {
      bio: parsed.data.bio, vehicle: parsed.data.vehicle, serviceAreaIds: parsed.data.areas,
      emergencyContactName: parsed.data.emergencyName, emergencyContactPhone: emergencyPhone,
    });
  } catch (e) {
    return { error: t(e instanceof Error && e.message === 'invalid_service_area' ? 'runnerOnboarding.errors.invalid_service_area' : 'common.error') };
  }
  redirect(`/${locale}/${marketSlug}/runner/verify`);
}

export type KycStartState = { error?: string; launch?: KycLaunch } | null;

export async function startKycAction(locale: string, marketSlug: string, _prev: KycStartState): Promise<KycStartState> {
  const { account, market } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/runner/verify`);
  const t = await getTranslations({ locale });
  let launch: KycLaunch;
  try {
    const { kyc, ctx } = providersFor(market, locale);
    ({ launch } = await startVerification(defaultDb(), { kyc, ctx, market }, {
      userId: account.id, phoneE164: account.phoneE164, locale, returnUrl: `/${locale}/${marketSlug}/runner/verify`,
    }));
  } catch (e) {
    if (e instanceof KycError && ['already_approved', 'in_review', 'not_a_runner'].includes(e.code)) return { error: t(`runnerOnboarding.errors.${e.code}`) };
    console.error('kyc start failed', e);
    return { error: t('runnerOnboarding.launchUnavailable') };
  }
  if (launch.kind === 'url') redirect(launch.url);
  return { launch };
}

/** SANDBOX ONLY: simulate the provider's result by sending a signed webhook through the real pipeline. */
export async function completeSandboxKyc(locale: string, marketSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { account, market } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/runner/verify`);
  const t = await getTranslations({ locale });
  if (providerMode(market.code) !== 'sandbox' || process.env.VERCEL_ENV === 'production') return { error: t('common.error') };
  const verificationId = String(form.get('verificationId') ?? '');
  const [v] = await defaultDb().select({ id: kycVerifications.id, status: kycVerifications.status }).from(kycVerifications)
    .where(and(eq(kycVerifications.id, verificationId), eq(kycVerifications.userId, account.id)));
  if (!v || !['created', 'submitted'].includes(v.status)) return { error: t('common.error') };
  const payload = SandboxKycPayload.safeParse({
    eventId: randomUUID(), verificationId, userId: account.id,
    outcome: form.get('outcome'), livenessPassed: form.get('liveness') === 'on',
    document: { type: form.get('docType'), idNumber: form.get('idNumber'), name: form.get('docName'), dateOfBirth: form.get('dob') },
  });
  if (!payload.success) return { error: t('common.error') };
  const raw = JSON.stringify(payload.data);
  const headers = new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(process.env.SANDBOX_WEBHOOK_SECRET!, raw) });
  const r = await handleKycWebhook('sandbox-kyc', marketSlug, raw, headers);
  if (r.status !== 200) return { error: t('common.error') };
  redirect(`/${locale}/${marketSlug}/runner/verify`);
}
