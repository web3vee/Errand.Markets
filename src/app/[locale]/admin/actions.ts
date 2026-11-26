'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { REJECT_REASONS } from '@/modules/kyc/domain/rules';
import { decideVerification, KycError } from '@/modules/kyc/service';
import { defaultDb, requireAdmin } from '@/server/context';

export type DecisionState = { error?: string } | null;

const Decision = z.object({
  decision: z.enum(['approve', 'reject', 'request_resubmission']),
  reasonCode: z.enum(REJECT_REASONS).nullable(),
  note: z.string().trim().max(500).nullable(),
});

export async function decideAction(locale: string, verificationId: string, _prev: DecisionState, form: FormData): Promise<DecisionState> {
  const { account, scope } = await requireAdmin('ops');
  const t = await getTranslations({ locale });
  const parsed = Decision.safeParse({
    decision: form.get('decision'), reasonCode: form.get('reasonCode') || null, note: (form.get('note') as string) || null,
  });
  if (!parsed.success || !/^[0-9a-f-]{36}$/.test(verificationId)) return { error: t('common.error') };
  if (parsed.data.decision !== 'approve' && !parsed.data.reasonCode) return { error: t('admin.reasonRequired') };
  try {
    await decideVerification(defaultDb(), {
      adminId: account.id, adminScope: scope, verificationId,
      decision: parsed.data.decision, reasonCode: parsed.data.reasonCode, note: parsed.data.note,
    });
  } catch (e) {
    if (e instanceof KycError) return { error: t(e.code === 'decision_not_allowed' ? 'admin.notAllowed' : 'common.error') };
    throw e;
  }
  redirect(`/${locale}/admin/runners/${verificationId}?saved=1`);
}
