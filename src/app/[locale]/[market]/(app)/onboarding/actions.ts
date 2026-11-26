'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { safeNextPath } from '@/modules/identity/domain/policy';
import { updateDisplayName } from '@/modules/identity/service';
import { defaultDb, getSession } from '@/server/context';
import type { FormState } from '../sign-in/actions';

const DisplayName = z.string().trim().min(2).max(60).regex(/^[^<>{}]*$/);

export async function saveName(locale: string, marketSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations({ locale });
  const session = await getSession();
  if (!session) redirect(`/${locale}/${marketSlug}/sign-in`);
  const parsed = DisplayName.safeParse(form.get('name'));
  if (!parsed.success) return { error: t('onboarding.errors.name'), values: { name: String(form.get('name') ?? '') } };
  await updateDisplayName(defaultDb(), session.claims, parsed.data);
  const next = safeNextPath(String(form.get('next') ?? ''), locale);
  redirect(next ?? `/${locale}/${marketSlug}/account`);
}
