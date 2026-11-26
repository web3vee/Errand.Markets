import { redirect } from 'next/navigation';

export default async function AdminIndex({ params }: { params: Promise<{ locale: string }> }) {
  redirect(`/${(await params).locale}/admin/runners`);
}

// Per-request: depends on the signed-in admin (never prerender).
export const dynamic = 'force-dynamic';
