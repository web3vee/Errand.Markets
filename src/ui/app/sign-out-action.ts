'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';

export async function signOutAction(locale: string, marketSlug: string) {
  await auth().signOut();
  const safeLocale = /^[a-z]{2}(-[A-Z]{2})?$/.test(locale) ? locale : 'en';
  redirect(`/${safeLocale}/${/^[a-z]{2}$/.test(marketSlug) ? marketSlug : ''}`);
}
