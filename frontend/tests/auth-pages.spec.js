// The test build has no VITE_CLERK_PUBLISHABLE_KEY, so these cover the keyless build (Req 11.8, 13.2, 13.3, 13.5, 13.6).
import { test, expect } from '@playwright/test';
const textPages = ['/privacy', '/account/delete', '/sign-in', '/account'];
const widths = [320, 375, 390, 768, 1024, 1280, 1440, 1920, 2560];
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('header has no Sign in link on desktop or in the phone menu without a Clerk key', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.desktop-nav')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-menu > summary').click();
  await expect(page.locator('.mobile-menu-panel')).toBeVisible();
  await expect(page.locator('.mobile-menu-panel').getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
});

for (const route of textPages) {
  test(`${route} has one h1 and no sideways scroll from 320px to desktop`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('h1')).toHaveCount(1);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${width}px`).toBe(false);
    }
  });
}

test('sign-in and account routes explain that sign-in is unavailable', async ({ page }) => {
  for (const route of ['/sign-in', '/account', '/account/delete']) {
    await page.goto(route);
    await expect(page.locator('h1'), route).toHaveText('Sign-in unavailable');
    await expect(page.getByRole('main').getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy');
  }
});

test('privacy policy names the processors and links to account deletion', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('h1')).toHaveText('Privacy policy');
  await expect(page).toHaveTitle('Privacy | Campuscores');
  const main = page.getByRole('main');
  for (const name of ['Clerk', 'Google', 'Cloudflare', 'Neon']) await expect(main).toContainText(name);
  await expect(main.getByRole('link', { name: 'account deletion page' })).toHaveAttribute('href', '/account/delete');
  await expect(main.getByRole('link', { name: 'bhatiaarnav05@gmail.com' })).toHaveAttribute('href', 'mailto:bhatiaarnav05@gmail.com');
  await expect(main).not.toContainText('to be confirmed');
});

test('public pages request no Clerk code', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  for (const route of ['/', '/sports/badminton/', '/sports/football/', '/privacy']) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter(url => /clerk|AuthArea/i.test(url))).toEqual([]);
});

test('/privacy works on direct entry, refresh and back', async ({ page }) => {
  await page.goto('/');
  await page.goto('/privacy');
  await expect(page.locator('h1')).toHaveText('Privacy policy');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Privacy policy');
  await page.getByRole('link', { name: 'account deletion page' }).click();
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(page.locator('h1')).toHaveText('Sign-in unavailable');
  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('h1')).toHaveText('Privacy policy');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('Campuscores');
});
