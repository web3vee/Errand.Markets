import { redirect } from 'next/navigation';

/** Homepage CTAs land here: send people into sign-in (if needed) and then the right place. */
export default async function GetStarted({ params, searchParams }: {
  params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ intent?: string }>;
}) {
  const { locale, market } = await params;
  const { intent } = await searchParams;
  const base = `/${locale}/${market}`;
  // Posting errands arrives in Stage 4; until then the account page explains it.
  const target = intent === 'runner' ? `${base}/runner` : `${base}/account`;
  redirect(`${base}/sign-in?next=${encodeURIComponent(target)}`);
}
