import { and, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { kycVerifications } from '../../../../../../../../db/schema';
import { providerMode } from '@/providers/registry';
import { defaultDb, requireVerifiedPhone } from '@/server/context';
import { Notice } from '@/ui/forms/fields';
import { Container } from '@/ui/primitives/container';
import { completeSandboxKyc } from '../../actions';
import { SandboxKycForm } from './form';

/** SANDBOX ONLY — stands in for the Dojah / Sumsub hosted flow. 404 in live mode. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('sandbox.kycTitle') };
}

export default async function SandboxKyc({ params, searchParams }: { params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ v?: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const { account, market } = await requireVerifiedPhone(locale, slug, `/${locale}/${slug}/runner/verify`);
  if (providerMode(market.code) !== 'sandbox') notFound();
  const v = (await searchParams).v ?? '';
  const [row] = /^[0-9a-f-]{36}$/.test(v)
    ? await defaultDb().select({ id: kycVerifications.id }).from(kycVerifications).where(and(eq(kycVerifications.id, v), eq(kycVerifications.userId, account.id)))
    : [];
  if (!row) notFound();
  const t = await getTranslations();
  // Document types the market's real provider would offer (Dojah NG: NIN; Sumsub VC: ID card / passport / licence).
  const docTypes = market.providers.kyc === 'dojah' ? ['nin'] : ['national_id', 'passport', 'drivers_licence'];
  return (
    <Container className="max-w-[34rem] py-14">
      <h1 className="text-h1">{t('sandbox.kycTitle')}</h1>
      <div className="mt-4"><Notice tone="sandbox">{t('sandbox.kycLead')}</Notice></div>
      <SandboxKycForm action={completeSandboxKyc.bind(null, locale, slug)} verificationId={row.id} docTypes={docTypes} defaultName={account.displayName ?? ''} />
    </Container>
  );
}
