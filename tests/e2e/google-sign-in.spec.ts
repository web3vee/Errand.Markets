import { expect, test } from '@playwright/test';
import { MARKETS, rand } from './helpers';

/** Google sign-in (sandbox stand-in in local auth mode) → browse → asked for a phone before posting. */
test('Google sign-in: no phone needed to start, verified phone required before posting an errand', async ({ page }) => {
  await page.goto('/en/ng/get-started?intent=post');
  await expect(page).toHaveURL(/\/en\/ng\/sign-in/);
  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect(page).toHaveURL(/\/en\/ng\/sign-in\/google-sandbox/);
  await page.getByLabel('Email').fill(`gloria.${rand(8)}@example.com`);
  await page.getByLabel('Name (optional)').fill('Gloria Google');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Name came from "Google", so no onboarding; posting needs a phone first.
  await expect(page).toHaveURL(/\/en\/ng\/account\/phone\?next=/);
  await expect(page.getByRole('heading', { name: 'Add your mobile number' })).toBeVisible();
  await page.getByLabel('Mobile number').fill(MARKETS.ng.phone());
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page).toHaveURL(/\/en\/ng\/account\/phone\/verify/);
  const code = (await page.getByTestId('sandbox-code').innerText()).match(/\d{6}/)![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Back where they were going.
  await expect(page).toHaveURL(/\/en\/ng\/errands\/new/);
  await page.goto('/en/ng/account');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Gloria Google');
  await expect(page.getByText(/^\+234 /)).toBeVisible();
});

test('a Google account that already has a phone number cannot take another account\'s number', async ({ page, browser }) => {
  const phone = MARKETS.ng.phone();
  const other = await (await browser.newContext()).newPage();
  await other.goto('/en/ng/sign-in');
  await other.getByLabel('Mobile number').fill(phone);
  await other.getByRole('button', { name: 'Send code' }).click();
  const code = (await other.getByTestId('sandbox-code').innerText()).match(/\d{6}/)![0];
  await other.getByLabel('6-digit code').fill(code);
  await other.getByRole('button', { name: 'Continue' }).click();
  await expect(other).not.toHaveURL(/sign-in/);

  await page.goto('/en/ng/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await page.getByLabel('Email').fill(`taken.${rand(8)}@example.com`);
  await page.getByLabel('Name (optional)').fill('Second Person');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/en\/ng\/account$/);
  await page.getByRole('link', { name: 'Add mobile number' }).first().click();
  await expect(page).toHaveURL(/\/en\/ng\/account\/phone/);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('That number already has an account')).toBeVisible();
});
