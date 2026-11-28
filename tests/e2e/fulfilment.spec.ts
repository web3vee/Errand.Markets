import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { approveRunnerInDb, grantAdmin, MARKETS, newPage, rand, signIn } from './helpers';

/** Stage 5 in the browser: pay (sandbox) → start → proof photos → confirm → blind ratings; and a dispute resolved by an admin. */
async function acceptedErrand(browser: import('@playwright/test').Browser, market: 'ng' | 'vc', opts: { purchase?: boolean } = {}) {
  const m = MARKETS[market];
  const title = `${opts.purchase ? 'Buy bread' : 'Deliver envelope'} ${rand(5)}`;
  const runnerPhone = m.phone();
  const runner = await newPage(browser);
  await signIn(runner, market, runnerPhone, 'Rita Runner');
  await runner.getByRole('button', { name: 'Become a Runner' }).click();
  await runner.getByLabel(m.area).check();
  await runner.getByLabel('Motorbike').check();
  await runner.getByRole('button', { name: 'Save and continue' }).click();
  approveRunnerInDb(m.e164(runnerPhone));

  const customer = await newPage(browser);
  await signIn(customer, market, m.phone(), 'Cora Customer');
  await customer.goto(`/en/${market}/errands/new`);
  if (opts.purchase) {
    await customer.getByLabel(/Shopping/).check();
    await customer.getByLabel('The Runner needs to buy things for me').check();
    await customer.locator('#item-0-name').fill('Bread');
    await customer.locator('#item-0-price').fill(market === 'ng' ? '1,000' : '10');
  } else {
    await customer.getByLabel(/Deliveries/).check();
  }
  await customer.getByLabel('Short title').fill(title);
  await customer.getByLabel('Details').fill('Please be careful.');
  await customer.locator('#dropoff-area').selectOption({ label: m.area });
  await customer.locator('#dropoff-landmark').fill('Blue gate opposite the bank, 2nd floor');
  await customer.getByLabel(/^Your price/).fill(market === 'ng' ? '2,500' : '25');
  await customer.getByRole('button', { name: 'Post errand' }).click();
  await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'open');
  const errandUrl = customer.url().split('?')[0]!;

  await runner.goto(`/en/${market}/runner/errands`);
  await runner.getByRole('link', { name: new RegExp(title) }).click();
  await runner.getByRole('button', { name: /^Accept for/ }).click();
  await expect(runner.getByTestId('errand-status')).toHaveAttribute('data-status', 'offer_accepted');
  return { customer, runner, errandUrl, title, runnerPhone };
}
const png = () => sharp({ create: { width: 640, height: 480, channels: 3, background: '#4a7' } }).png().toBuffer();

for (const market of ['ng', 'vc'] as const) {
  // NG: a delivery. VC: a shopping errand, so the Runner also adds a receipt and what they spent.
  const purchase = market === 'vc';
  test(`fulfilment: pay → start → proof → confirm → ratings — ${market.toUpperCase()}${purchase ? ' (shopping)' : ''}`, async ({ browser }) => {
    const { customer, runner, errandUrl } = await acceptedErrand(browser, market, { purchase });

    // Customer pays (sandbox) → Runner sees the exact location and can start.
    await customer.goto(errandUrl);
    await customer.getByRole('button', { name: 'Mark as paid (sandbox)' }).click();
    await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'funded');
    await runner.goto(errandUrl);
    await expect(runner.getByText('Blue gate opposite the bank')).toBeVisible();
    await runner.getByRole('button', { name: 'Start errand' }).click();
    await expect(runner.getByTestId('errand-status')).toHaveAttribute('data-status', 'in_progress');

    // Can't finish without a proof photo.
    await runner.getByRole('button', { name: 'Mark as done' }).click();
    await expect(runner.getByRole('alert').filter({ hasText: 'Add at least one proof photo.' })).toBeVisible();
    await runner.getByTestId('proof-input').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: await png() });
    await expect(runner.getByRole('button', { name: 'Remove photo' })).toBeVisible();
    if (purchase) {
      await runner.getByTestId('receipt-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: await png() });
      await expect(runner.getByRole('button', { name: 'Remove photo' })).toHaveCount(2);
      await runner.getByLabel(/Amount spent on items/).fill('12');
    }
    await runner.getByRole('button', { name: 'Mark as done' }).click();
    await expect(runner.getByTestId('errand-status')).toHaveAttribute('data-status', 'completed_pending_confirmation');

    // Customer sees the proof and confirms.
    await customer.goto(errandUrl);
    const proof = customer.getByTestId('proof-section').locator('img').first();
    await expect(proof).toBeVisible();
    expect(await proof.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    if (purchase) await expect(customer.getByTestId('proof-section')).toContainText('EC$2.00 more than the estimate');
    await customer.getByRole('button', { name: "Confirm it's done" }).click();
    await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'confirmed');

    // Blind ratings: the Runner can't see the customer's rating until they rate back.
    await customer.getByText('5 stars').click();
    await customer.getByLabel('Comment').fill('Fast and careful');
    await customer.getByRole('button', { name: 'Send rating' }).click();
    await expect(customer.getByTestId('my-rating')).toContainText('Fast and careful');
    await runner.goto(errandUrl);
    await expect(runner.getByText('Cora Customer rated you. Rate them to see it.')).toBeVisible();
    await expect(runner.getByTestId('their-rating')).toHaveCount(0);
    await runner.getByText('4 stars').click();
    await runner.getByRole('button', { name: 'Send rating' }).click();
    await expect(runner.getByTestId('their-rating')).toContainText('Fast and careful');
    await customer.reload();
    await expect(customer.getByTestId('their-rating')).toContainText('★★★★☆');
    await expect(customer.getByTestId('runner-rating')).toContainText('★ 5.0 (1)');
  });
}

test('dispute: customer reports a problem, admin refunds — NG', async ({ browser }) => {
  const { customer, runner, errandUrl, title } = await acceptedErrand(browser, 'ng');
  await customer.goto(errandUrl);
  await customer.getByRole('button', { name: 'Mark as paid (sandbox)' }).click();
  await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'funded');
  await runner.goto(errandUrl);
  await runner.getByRole('button', { name: 'Start errand' }).click();
  await expect(runner.getByTestId('errand-status')).toHaveAttribute('data-status', 'in_progress');

  await customer.goto(errandUrl);
  await customer.locator('summary', { hasText: 'Report a problem' }).click();
  await customer.getByLabel('What went wrong?').selectOption('not_done');
  await customer.getByLabel('Details').fill('Runner stopped replying');
  await customer.getByRole('button', { name: 'Report problem' }).click();
  await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'disputed');

  const adminPhone = MARKETS.ng.phone();
  const admin = await newPage(browser);
  await signIn(admin, 'ng', adminPhone, 'Market Admin');
  grantAdmin(MARKETS.ng.e164(adminPhone), 'NG');
  await admin.goto('/en/admin/disputes');
  await admin.getByRole('link', { name: new RegExp(title) }).click();
  await expect(admin.getByText('Runner stopped replying')).toBeVisible();
  await admin.getByLabel('Refund the customer').check();
  await admin.getByRole('button', { name: 'Save decision' }).click();
  await expect(admin.getByText('Decision saved.')).toBeVisible();

  await customer.reload();
  await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'refunded');
});

test('a Runner who backs out before payment puts the errand back on the market — VC', async ({ browser }) => {
  const { customer, runner, errandUrl } = await acceptedErrand(browser, 'vc');
  await runner.goto(errandUrl);
  await runner.locator('summary', { hasText: "I can't do this errand" }).click();
  await runner.getByRole('button', { name: "I can't do this errand" }).click();
  await expect(runner.getByText('The errand is open to other Runners again.')).toBeVisible();
  await customer.goto(errandUrl);
  await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'open');
});
