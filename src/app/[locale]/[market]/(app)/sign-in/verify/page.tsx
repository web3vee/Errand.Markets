import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { authMode } from '@/server/auth';
import { latestSandboxSms, requireMarket } from '@/server/context';
import { getOtpFlow } from '@/server/flow-cookie';
import { providerMode } from '@/providers/registry';
import { parseMarketPhone } from '@/lib/phone';
import { Notice } from '@/ui/forms/fields';
import { Container } from '@/ui/primitives/container';
import { resendCode, verifySignIn } from '../actions';
import { CodeForm } from '../forms';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('auth.verifyTitle') };
}

export default async function VerifyCode({ params }: { params: Promise<{ locale: string; market: string }> }) {
  const { locale, market: slug } = await params;
  setRequestLocale(locale);
  const market = await requireMarket(slug);
  const flow = await getOtpFlow();
  if (!flow || flow.market !== slug) redirect(`/${locale}/${slug}/sign-in`);
  const t = await getTranslations();
  const pretty = parseMarketPhone(flow.phone, market.phoneRegions);
  // SANDBOX ONLY: no SMS is sent, so show the code the sandbox "sent".
  const sandboxSms = authMode() === 'local' && providerMode(market.code) === 'sandbox' ? await latestSandboxSms(flow.phone) : null;
  const sandboxCode = sandboxSms?.body.match(/\b(\d{6})\b/)?.[1];
  return (
    <Container className="max-w-[30rem] py-14">
      <h1 className="text-h1">{t('auth.verifyTitle')}</h1>
      <p className="mt-3 text-body text-ink-2">
        {t.rich('auth.verifyLead', {
          number: pretty.ok ? pretty.international : flow.phone,
          phone: (chunks) => <span dir="ltr" className="font-medium text-ink">{chunks}</span>,
        })}
      </p>
      {sandboxCode ? (
        <div className="mt-6" data-testid="sandbox-code">
          <Notice tone="sandbox" title={t('sandbox.codeTitle')}>{t('sandbox.codeBody', { code: sandboxCode })}</Notice>
        </div>
      ) : null}
      <CodeForm action={verifySignIn.bind(null, locale, slug)} resend={resendCode.bind(null, locale, slug)} />
      <p className="mt-6"><Link href={`/${locale}/${slug}/sign-in`} className="inline-flex min-h-11 items-center text-small underline">{t('auth.changeNumber')}</Link></p>
    </Container>
  );
}
