import 'server-only';
import { sql } from 'drizzle-orm';
import { asSystem } from '../../db/client';
import { providerWebhookEvents } from '../../db/schema';
import { ingestKycWebhook } from '@/modules/kyc/service';
import { kycWebhookKey } from '@/providers/registry';
import { defaultDb, getMarket, providersFor } from './context';

const MAX_BODY = 1_000_000;

/**
 * Shared by the HTTP route and the sandbox KYC page: verify signature → dedupe → process.
 * Unknown provider/market → 404; bad signature → 401 (provider will not retry forever);
 * processing error → 500 (provider retries; the event is re-processed).
 */
export async function handleKycWebhook(providerKey: string, marketSlug: string, rawBody: string, headers: Headers): Promise<{ status: number; body: Record<string, unknown> }> {
  if (rawBody.length > MAX_BODY) return { status: 413, body: { error: 'too_large' } };
  const market = await getMarket(marketSlug);
  if (!market || !market.id || kycWebhookKey(market) !== providerKey) return { status: 404, body: { error: 'unknown_endpoint' } };
  const { kyc } = providersFor(market, market.uiLanguages[0] ?? 'en');
  let verified;
  try {
    verified = await kyc.verifyWebhook({ rawBody, headers });
  } catch {
    return { status: 400, body: { error: 'unparseable' } };
  }
  if (!verified.valid) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'webhook.rejected', provider: providerKey, market: market.code, reason: verified.reason }));
    return { status: 401, body: { error: 'invalid_signature' } };
  }
  const pepper = process.env.ID_HASH_PEPPER;
  if (!pepper) throw new Error('ID_HASH_PEPPER is required');
  try {
    const r = await ingestKycWebhook(defaultDb(), {
      providerKey, market: { id: market.id, code: market.code, kycAutoApprove: market.kycAutoApprove },
      verified, rawPayload: JSON.parse(rawBody), pepper,
    });
    return { status: 200, body: { ok: true, outcome: r.outcome } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ level: 'error', msg: 'webhook.failed', provider: providerKey, market: market.code, eventId: verified.eventId, error: message }));
    await asSystem(defaultDb(), 'record failed webhook', (tx) => tx.insert(providerWebhookEvents).values({
      provider: providerKey, marketId: market.id, eventId: verified.eventId, eventType: verified.eventType, signatureValid: true,
      payload: {}, status: 'failed', attempts: 1, error: message.slice(0, 500),
    }).onConflictDoUpdate({
      target: [providerWebhookEvents.provider, providerWebhookEvents.eventId],
      set: { status: 'failed', error: message.slice(0, 500), attempts: sql`${providerWebhookEvents.attempts} + 1` },
    })).catch(() => {});
    return { status: 500, body: { error: 'processing_failed' } };
  }
}
