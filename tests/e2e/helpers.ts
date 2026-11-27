import { execFileSync } from 'node:child_process';
import { expect, type Browser, type Page } from '@playwright/test';

export const rand = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
export const MARKETS = {
  ng: { phone: () => `0803 ${rand(3)} ${rand(4)}`, e164: (p: string) => `+234${p.replace(/\D/g, '').slice(1)}`, area: 'Wuse 2', other: 'vc' as const },
  vc: { phone: () => `784 430 ${rand(4)}`, e164: (p: string) => `+1${p.replace(/\D/g, '')}`, area: 'Kingstown', other: 'ng' as const },
};
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://errand:errand@localhost:5432/errand_dev';

export async function signIn(page: Page, market: 'ng' | 'vc', phone: string, name?: string) {
  await page.goto(`/en/${market}/sign-in`);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page).toHaveURL(new RegExp(`/en/${market}/sign-in/verify`));
  const code = (await page.getByTestId('sandbox-code').innerText()).match(/\d{6}/)![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).not.toHaveURL(/sign-in/);
  if (name) {
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Continue' }).click();
    // Wait for the save to finish before navigating away (otherwise the action can be cancelled).
    await expect(page).not.toHaveURL(/onboarding/);
  }
}

export function grantAdmin(e164: string, market: string) {
  execFileSync('pnpm', ['-s', 'admin:grant', '--phone', e164, '--market', market, '--perms', 'ops'], { stdio: 'pipe' });
}

/** Test shortcut (the full KYC journey is covered in auth-kyc.spec.ts): mark a Runner approved in the LOCAL db. */
export function approveRunnerInDb(e164: string) {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(DB)) throw new Error('only on a local database');
  execFileSync('psql', [DB, '-qc', `update runner_profiles set kyc_status='approved', kyc_approved_at=now() where user_id=(select id from users where phone_e164='${e164.replace(/[^+\d]/g, '')}')`]);
}

export async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}
