import { redirect } from 'next/navigation';

/** Homepage CTAs land here: send people into sign-in (if needed) and then the right place. */
export default async function GetStarted({ params, searchParams }: {
  params: Promise<{ locale: string; market: string }>; searchParams: Promise<{ intent?: string; category?: string }>;
}) {
  const { locale, market } = await params;
  const { intent, category } = await searchParams;
  const base = `/${locale}/${market}`;
  const target = intent === 'runner' ? `${base}/runner` : `${base}/errands/new${category && /^[a-z_]+$/.test(category) ? `?category=${category}` : ''}`;
  redirect(`${base}/sign-in?next=${encodeURIComponent(target)}`);
}
