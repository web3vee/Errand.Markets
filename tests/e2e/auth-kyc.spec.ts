import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

/**
 * Full Stage 3 journey per market, through the real UI:
 * homepage CTA → phone OTP sign-in (sandbox SMS) → name → become a Runner → profile →
 * identity check (sandbox provider → signed webhook) → admin review → approved.
 */
const rand = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const MARKETS = {
  ng: { phone: () => `0803 ${rand(3)} ${rand(4)}`, e164: (p: string) => `+234${p.replace(/\D/g, '').slice(1)}`, area: 'Wuse 2', other: 'vc' },
  vc: { phone: () => `784 430 ${rand(4)}`, e164: (p: string) => `+1${p.replace(/\D/g, '')}`, area: 'Kingstown', other: 'ng' },
} as const;

async function signIn(page: Page, market: 'ng' | 'vc', phone: string, name?: string) {
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page).toHaveURL(new RegExp(`/en/${market}/sign-in/verify`));
  const code = (await page.getByTestId('sandbox-code').innerText()).match(/\d{6}/)![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  if (name) {
    await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible();
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).not.toHaveURL(/onboarding/);
  }
}

function grantAdmin(e164: string, market: string) {
  execFileSync('pnpm', ['-s', 'admin:grant', '--phone', e164, '--market', market, '--perms', 'ops'], { stdio: 'pipe' });
}

for (const market of ['ng', 'vc'] as const) {
  test(`Runner sign-up, KYC and admin approval — ${market.toUpperCase()}`, async ({ browser }) => {
    const m = MARKETS[market];
    const runnerPhone = m.phone();
    const runner = await (await browser.newContext()).newPage();

    // Homepage → Become a Runner → sign-in (with next=/runner)
    await runner.goto(`/en/${market}`);
    await runner.getByRole('link', { name: 'Become a Runner' }).first().click();
    await expect(runner).toHaveURL(/sign-in\?next=/);

    // Wrong-country number is rejected with a clear message
    await runner.getByLabel('Mobile number').fill(market === 'ng' ? '+1 784 430 1234' : '+234 803 123 4567');
    await runner.getByRole('button', { name: 'Send code' }).click();
    await expect(runner.getByRole('main').getByRole('alert')).toContainText("isn't from");

    // Wrong code is rejected, right code signs in
    await runner.getByLabel('Mobile number').fill(runnerPhone);
    await runner.getByRole('button', { name: 'Send code' }).click();
    await runner.getByLabel('6-digit code').fill('000000');
    await runner.getByRole('button', { name: 'Continue' }).click();
    await expect(runner.getByRole('main').getByRole('alert')).toContainText("isn't right");
    const code = (await runner.getByTestId('sandbox-code').innerText()).match(/\d{6}/)![0];
    await runner.getByLabel('6-digit code').fill(code);
    await runner.getByRole('button', { name: 'Continue' }).click();
    await runner.getByLabel('Your name').fill('Ada Obi');
    await runner.getByRole('button', { name: 'Continue' }).click();

    // Become a Runner → profile → verification
    await expect(runner).toHaveURL(new RegExp(`/en/${market}/account`));
    await runner.getByRole('button', { name: 'Become a Runner' }).click();
    await expect(runner.getByRole('heading', { name: 'Your Runner profile' })).toBeVisible();
    await runner.getByLabel(m.area).check();
    await runner.getByLabel('Motorbike').check();
    await runner.getByRole('button', { name: 'Save and continue' }).click();
    await expect(runner.getByTestId('kyc-status')).toHaveAttribute('data-status', 'not_started');
    await runner.getByRole('button', { name: 'Start verification' }).click();

    // Sandbox provider page → signed webhook → in review
    await expect(runner.getByRole('heading', { name: 'Sandbox identity check' })).toBeVisible();
    await runner.getByLabel('Document number').fill(`9${rand(10)}`);
    await runner.getByRole('button', { name: 'Send result' }).click();
    await expect(runner.getByTestId('kyc-status')).toHaveAttribute('data-status', 'in_review');

    // A non-admin can't see the admin area
    await runner.goto('/en/admin/runners');
    await expect(runner.getByRole('heading', { name: 'Runner verification' })).toHaveCount(0);

    // Admin for the OTHER market can't see this Runner
    const otherPhone = MARKETS[m.other].phone();
    const other = await (await browser.newContext()).newPage();
    await other.goto(`/en/${m.other}/sign-in`);
    await signIn(other, m.other, otherPhone, 'Other Admin');
    grantAdmin(MARKETS[m.other].e164(otherPhone), m.other.toUpperCase());
    await other.goto('/en/admin/runners');
    await expect(other.getByRole('heading', { name: 'Runner verification' })).toBeVisible();
    await expect(other.getByRole('link', { name: /Ada Obi/ })).toHaveCount(0);

    // Admin for this market approves
    const adminPhone = m.phone();
    const admin = await (await browser.newContext()).newPage();
    await admin.goto(`/en/${market}/sign-in`);
    await signIn(admin, market, adminPhone, 'Market Admin');
    grantAdmin(m.e164(adminPhone), market.toUpperCase());
    await admin.goto('/en/admin/runners');
    await admin.getByRole('link', { name: /Ada Obi/ }).last().click();
    await expect(admin.getByText('Selfie liveness')).toBeVisible();
    await admin.getByLabel('Approve').check();
    await admin.getByRole('button', { name: 'Save decision' }).click();
    await expect(admin.getByText('Decision saved.')).toBeVisible();

    // Runner sees approval
    await runner.goto(`/en/${market}/runner/verify`);
    await expect(runner.getByTestId('kyc-status')).toHaveAttribute('data-status', 'approved');
  });
}

test('market mismatch: an NG account visiting a VC page is sent to its own market', async ({ page }) => {
  await page.goto('/en/ng/sign-in');
  await signIn(page, 'ng', MARKETS.ng.phone(), 'Bola');
  await page.goto('/en/vc/account');
  await expect(page).toHaveURL(/\/en\/ng\/account/);
});
