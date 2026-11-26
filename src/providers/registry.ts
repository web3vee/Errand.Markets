import 'server-only';
import { z } from 'zod';
import { DojahKyc } from './kyc/dojah';
import { SandboxKyc } from './kyc/sandbox';
import { SumsubKyc } from './kyc/sumsub';
import { SandboxSms } from './sms/sandbox';
import { TermiiSms } from './sms/termii';
import { TwilioSms } from './sms/twilio';
import type { KycProvider, ProviderContext, ProviderMode, SmsProvider } from './types';

type MarketLike = {
  id: string | null; code: string; slug: string; timezone: string; formatLocale: string;
  currency: { code: string; minorUnit: number };
  providers: { sms: string; kyc: string };
};
type Deps = {
  writeOutbox: (m: { to: string; body: string; marketCode: string }) => Promise<number>;
  sandboxKycLaunchUrl: (verificationId: string) => string;
};

const isProductionDeploy = () => process.env.VERCEL_ENV === 'production';

/** PROVIDER_MODE_<MARKET> = sandbox | live (default sandbox). Sandbox is refused on production deploys. */
export function providerMode(code: string): ProviderMode {
  const mode = process.env[`PROVIDER_MODE_${code}`] === 'live' ? 'live' : 'sandbox';
  if (mode === 'sandbox' && isProductionDeploy()) throw new Error(`Market ${code} is in sandbox mode on a production deploy`);
  return mode;
}

/** Reads <PREFIX>_<NAME>_<MARKET> variables, failing fast with the exact missing names. */
function creds<T extends z.ZodRawShape>(prefix: string, code: string, shape: T): z.infer<z.ZodObject<T>> {
  const raw = Object.fromEntries(Object.keys(shape).map((k) => [k, process.env[`${prefix}_${k}_${code}`]]));
  const parsed = z.object(shape).safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${prefix}_${String(i.path[0])}_${code}`);
    throw new Error(`Missing/invalid credentials for ${prefix} in ${code}: ${missing.join(', ')}`);
  }
  return parsed.data;
}

export function providerContext(m: MarketLike, locale: string): ProviderContext {
  return {
    market: { id: m.id, code: m.code, currency: m.currency.code, minorUnit: m.currency.minorUnit, timezone: m.timezone, locale },
    mode: providerMode(m.code),
  };
}

export function smsFor(m: MarketLike, deps: Deps): SmsProvider {
  if (providerMode(m.code) === 'sandbox') return new SandboxSms(deps.writeOutbox);
  switch (m.providers.sms) {
    case 'termii': {
      const c = creds('TERMII', m.code, { API_KEY: z.string().min(1), SENDER_ID: z.string().min(1).max(11), BASE_URL: z.string().url().default('https://api.ng.termii.com') });
      return new TermiiSms({ apiKey: c.API_KEY, senderId: c.SENDER_ID, baseUrl: c.BASE_URL });
    }
    case 'twilio': {
      const c = creds('TWILIO', m.code, { ACCOUNT_SID: z.string().startsWith('AC'), AUTH_TOKEN: z.string().min(1), MESSAGING_SERVICE_SID: z.string().startsWith('MG') });
      return new TwilioSms({ accountSid: c.ACCOUNT_SID, authToken: c.AUTH_TOKEN, messagingServiceSid: c.MESSAGING_SERVICE_SID });
    }
    default:
      throw new Error(`Unknown SMS provider "${m.providers.sms}" for ${m.code}`);
  }
}

export function kycFor(m: MarketLike, deps: Deps): KycProvider {
  if (providerMode(m.code) === 'sandbox') {
    const secret = process.env.SANDBOX_WEBHOOK_SECRET;
    if (!secret) throw new Error('SANDBOX_WEBHOOK_SECRET is required in sandbox mode');
    return new SandboxKyc({ secret, launchUrl: deps.sandboxKycLaunchUrl });
  }
  switch (m.providers.kyc) {
    case 'dojah': {
      const c = creds('DOJAH', m.code, {
        APP_ID: z.string().min(1), PUBLIC_KEY: z.string().min(1), SECRET_KEY: z.string().min(1), WIDGET_ID: z.string().min(1),
        WEBHOOK_ALG: z.enum(['sha256', 'sha512']).default('sha256'),
      });
      return new DojahKyc({ appId: c.APP_ID, publicKey: c.PUBLIC_KEY, secretKey: c.SECRET_KEY, widgetId: c.WIDGET_ID, webhookAlg: c.WEBHOOK_ALG });
    }
    case 'sumsub': {
      const c = creds('SUMSUB', m.code, {
        APP_TOKEN: z.string().min(1), SECRET_KEY: z.string().min(1), WEBHOOK_SECRET: z.string().min(1),
        LEVEL_NAME: z.string().min(1), BASE_URL: z.string().url().default('https://api.sumsub.com'),
      });
      return new SumsubKyc({ appToken: c.APP_TOKEN, secretKey: c.SECRET_KEY, webhookSecret: c.WEBHOOK_SECRET, levelName: c.LEVEL_NAME, baseUrl: c.BASE_URL });
    }
    default:
      throw new Error(`Unknown KYC provider "${m.providers.kyc}" for ${m.code}`);
  }
}

/** The provider key that webhooks for this market's KYC arrive under (route segment). */
export function kycWebhookKey(m: MarketLike): string {
  return providerMode(m.code) === 'sandbox' ? 'sandbox-kyc' : m.providers.kyc;
}
