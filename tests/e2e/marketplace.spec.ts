import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { approveRunnerInDb, MARKETS, newPage, rand, signIn } from './helpers';

for (const market of ['ng', 'vc'] as const) {
  test(`post → browse → question → reply → price change → accept — ${market.toUpperCase()}`, async ({ browser }) => {
    const m = MARKETS[market];
    const title = `Deliver envelope ${rand(5)}`;

    // ── Runner: sign up, profile, (KYC approved via DB shortcut)
    const runnerPhone = m.phone();
    const runner = await newPage(browser);
    await signIn(runner, market, runnerPhone, 'Rita Runner');
    await runner.getByRole('button', { name: 'Become a Runner' }).click();
    await runner.getByLabel(m.area).check();
    await runner.getByLabel('Motorbike').check();
    await runner.getByRole('button', { name: 'Save and continue' }).click();
    approveRunnerInDb(m.e164(runnerPhone));

    // ── Customer posts an errand with a photo
    const customer = await newPage(browser);
    await signIn(customer, market, m.phone(), 'Cora Customer');
    await customer.goto(`/en/${market}/errands/new`);
    await customer.getByLabel(/Deliveries/).check();
    await customer.getByLabel('Short title').fill(title);
    await customer.getByLabel('Details').fill('A4 envelope, fragile.');
    await customer.locator('#dropoff-area').selectOption({ label: m.area });
    await customer.locator('#dropoff-landmark').fill('Blue gate opposite the bank, 2nd floor');
    await customer.getByLabel(/^Your price/).fill('2,500');
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#4a7' } }).png().toBuffer();
    await customer.locator('input[type=file]').setInputFiles({ name: 'parcel.png', mimeType: 'image/png', buffer: png });
    await expect(customer.getByRole('button', { name: 'Remove photo' })).toBeVisible();
    await customer.getByRole('button', { name: 'Post errand' }).click();
    await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'open');
    const errandUrl = customer.url().split('?')[0]!;

    // ── Runner finds it (area + price only), sees the photo, asks a question
    await runner.goto(`/en/${market}/runner/errands`);
    await runner.getByRole('link', { name: new RegExp(title) }).click();
    await expect(runner.getByText('Blue gate')).toHaveCount(0); // landmark hidden before acceptance/payment
    const img = runner.locator('img[src^="/api/media/"]').first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await runner.getByRole('button', { name: 'Ask a question' }).click();
    await runner.getByLabel('Write a message').fill('Is it heavy?');
    await runner.getByRole('button', { name: 'Send' }).click();
    await expect(runner.getByTestId('messages')).toContainText('Is it heavy?');

    // ── Customer gets a notification, replies; Runner sees it live (polling)
    await customer.goto(errandUrl);
    await expect(customer.getByTestId('unread-count').first()).toHaveText('1');
    await customer.getByRole('link', { name: 'Rita Runner' }).click();
    await customer.getByLabel('Write a message').fill('No, very light.');
    await customer.getByRole('button', { name: 'Send' }).click();
    await expect(runner.getByTestId('messages')).toContainText('No, very light.', { timeout: 10_000 });

    // ── Customer raises the price; Runner's stale page is refused, then accepts the new price
    await runner.goto(`/en/${market}/runner/errands`);
    await runner.getByRole('link', { name: new RegExp(title) }).click();
    await customer.goto(errandUrl);
    await customer.getByLabel(/Change price/).fill('3000');
    await customer.getByRole('button', { name: 'Save price' }).click();
    await expect(customer.getByText('Price updated.')).toBeVisible();
    await runner.getByRole('button', { name: /^Accept for/ }).click();
    await expect(runner.getByRole('main').getByRole('alert')).toContainText('just changed the price');
    await runner.reload();
    await runner.getByRole('button', { name: /^Accept for/ }).click();
    await expect(runner.getByTestId('errand-status')).toHaveAttribute('data-status', 'offer_accepted');
    await expect(runner.getByText('Blue gate')).toHaveCount(0); // still hidden until payment (Stage 6)

    // ── Customer sees the acceptance + notification
    await customer.goto(errandUrl);
    await expect(customer.getByTestId('errand-status')).toHaveAttribute('data-status', 'offer_accepted');
    await customer.goto(`/en/${market}/notifications`);
    await expect(customer.getByTestId('notifications')).toContainText('A Runner accepted your errand');
  });
}

test('an unverified Runner cannot see the marketplace', async ({ page }) => {
  await signIn(page, 'ng', MARKETS.ng.phone(), 'New Runner');
  await page.getByRole('button', { name: 'Become a Runner' }).click();
  await page.getByLabel('Wuse 2').check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.goto('/en/ng/runner/errands');
  await expect(page.getByText('Verify your identity to see and accept errands.')).toBeVisible();
});
