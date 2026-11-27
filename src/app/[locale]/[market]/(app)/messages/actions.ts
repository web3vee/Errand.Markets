'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { conversations } from '../../../../../../db/schema';
import { blockUser, MessagingError, REPORT_REASONS, reportUser, sendMessage, unblockUser } from '@/modules/messaging/service';
import { hitRateLimit } from '@/modules/platform/rate-limit';
import { defaultDb, requireAccount } from '@/server/context';
import { onMessage } from '@/server/workflows';

export type SendState = { error?: string; sentAt?: number } | null;

export async function sendMessageAction(locale: string, marketSlug: string, conversationId: string, _prev: SendState, form: FormData): Promise<SendState> {
  const { account } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/messages/${conversationId}`);
  const t = await getTranslations({ locale });
  const limit = await hitRateLimit(defaultDb(), `msg:${account.id}`, 30, 60);
  if (!limit.allowed) return { error: t('chat.errors.rate_limited') };
  const body = String(form.get('body') ?? '');
  const mediaId = String(form.get('mediaId') ?? '') || null;
  if (mediaId && !/^[0-9a-f-]{36}$/.test(mediaId)) return { error: t('common.error') };
  try {
    const r = await sendMessage(defaultDb(), account.id, conversationId, body, mediaId);
    await onMessage({ recipientId: r.recipientId, marketId: r.marketId, conversationId, senderName: account.displayName ?? '', preview: body.trim() || t('chat.photo') });
  } catch (e) {
    if (e instanceof MessagingError) return { error: t(`chat.errors.${e.code}`) };
    throw e;
  }
  return { sentAt: Date.now() };
}

async function otherParty(conversationId: string, me: string) {
  const [c] = await defaultDb().select().from(conversations).where(eq(conversations.id, conversationId));
  if (!c || (c.customerId !== me && c.runnerId !== me)) return null;
  return { other: c.customerId === me ? c.runnerId : c.customerId, marketId: c.marketId };
}

export async function blockAction(locale: string, marketSlug: string, conversationId: string, undo: boolean) {
  const { account } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/messages/${conversationId}`);
  const p = await otherParty(conversationId, account.id);
  if (p) await (undo ? unblockUser(defaultDb(), account.id, p.other) : blockUser(defaultDb(), account.id, p.other));
  redirect(`/${locale}/${marketSlug}/messages/${conversationId}`);
}

export async function reportAction(locale: string, marketSlug: string, conversationId: string, form: FormData) {
  const { account } = await requireAccount(locale, marketSlug, `/${locale}/${marketSlug}/messages/${conversationId}`);
  const reason = String(form.get('reason') ?? '');
  const details = String(form.get('details') ?? '').trim().slice(0, 1000) || null;
  const p = await otherParty(conversationId, account.id);
  if (p && (REPORT_REASONS as readonly string[]).includes(reason)) {
    const limit = await hitRateLimit(defaultDb(), `report:${account.id}`, 10, 3600);
    if (limit.allowed) await reportUser(defaultDb(), { reporterId: account.id, marketId: p.marketId, subjectType: 'user', subjectId: p.other, reasonCode: reason as never, details });
  }
  redirect(`/${locale}/${marketSlug}/messages/${conversationId}?reported=1`);
}
