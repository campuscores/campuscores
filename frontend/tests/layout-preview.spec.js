import { test, expect } from '@playwright/test';
import { SCREENS } from '../src/features/preview/previewScreens.js';
// Stage 1 layout preview (design "Stage 1 layout preview"; Req 1.5, 1.7, 1.11, 19.6, 21.4, 21.9). The preview runs on
// the live-mode build (port 4176), built with VITE_LAYOUT_PREVIEW=1 and VITE_API_BASE as on staging, so any API call or
// socket would show up as a request. The production build on 4175 has no flag.
const APP = 'http://127.0.0.1:4176';
const WIDTHS = [390, 1440];
const NO_ACCESS = 'You do not have access to this page';

// The Primary_Action of these screens acts on no loaded data: it opens a create or invite page (top of a list screen)
// or ends the optional step 5. It is part of the frame, like the headings, so it stays while the list loads or fails.
const FRAME_PRIMARY = new Set(['manager-home', 'matches', 'admin-home', 'all-tournaments', 'staff-list', 'pending-invitations', 'setup-scorers']);

/**
 * Primary_Action count each state must show (Req 19.6 and design "Shared screen rules"). Viewer pages and the sign-in
 * choice have none by design. A staff screen shows one when ready or empty (the frame stays). Loading and error show
 * no content, so only a frame Primary_Action stays. No access shows nothing but the start-page link. An empty staff
 * member detail means the account no longer exists, so there is nothing to act on.
 */
function primaryCount(screen, state) {
  if (!screen.role || state === 'forbidden') return 0;
  if (screen.key === 'staff-member' && state === 'empty') return 0;
  if (state === 'loading' || state === 'error') return FRAME_PRIMARY.has(screen.key) ? 1 : 0;
  return 1;
}

/** Records every request that is not a static file of the app origin, and every socket. */
function watchRequests(page) {
  const leaks = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    const isStatic = url.origin === APP && !['fetch', 'xhr', 'eventsource', 'websocket'].includes(request.resourceType());
    if (!isStatic) leaks.push(`${request.resourceType()} ${request.url()}`);
  });
  page.on('websocket', socket => leaks.push(`websocket ${socket.url()}`));
  return leaks;
}

/**
 * Visible targets smaller than 44×44 CSS pixels (Req 19.1). A radio or checkbox is measured by its label, which is the
 * clickable target. Screen-reader-only text (1px) and closed menus or dialogs (no box) are skipped.
 */
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('a[href], button, input, select, textarea, summary')]
  .map(el => (el.matches('[type="checkbox"], [type="radio"]') && el.closest('label')) || el)
  .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  .map(el => ({ el, box: el.getBoundingClientRect() }))
  .filter(({ box }) => box.width > 1 && (box.width < 44 || box.height < 44))
  .map(({ el, box }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`));

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** What each state must show, from the design's state rules. */
async function expectState(page, state) {
  if (state === 'loading') await expect(page.getByText(/^Loading .+…$/).first()).toBeVisible();
  if (state === 'error') await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible();
  if (state === 'forbidden') await expect(page.locator('h1')).toHaveText(NO_ACCESS);
  if (state === 'not-found') await expect(page.locator('h1')).toHaveText('Tournament not found');
}

test.describe('layout preview', () => {
  test('the index lists every previewable entry and sends no request', async ({ page }) => {
    const leaks = watchRequests(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${APP}/preview`);
      await expect(page.locator('h1')).toHaveText('Layout preview');
      for (const screen of SCREENS.filter(entry => entry.states.length)) {
        await expect(page.locator(`main a[href="/preview/${screen.key}"]:visible`).first()).toBeVisible();
      }
      expect(await overflow(page), `page overflow at ${width}px`).toBeLessThanOrEqual(0);
      expect(await smallTargets(page), `targets under 44×44 at ${width}px`).toEqual([]);
    }
    expect(leaks).toEqual([]);
  });

  test('screens without a preview route show page-not-found', async ({ page }) => {
    for (const screen of SCREENS.filter(entry => entry.capturedBySpecs)) {
      await page.goto(`${APP}/preview/${screen.key}`);
      await expect(page.locator('h1')).toHaveText('Page not found');
    }
  });

  for (const screen of SCREENS.filter(entry => entry.states.length)) {
    test(`${screen.key}: every state renders with one h1, the Primary_Action rule, no overflow and 44×44 targets`, async ({ page }) => {
      const leaks = watchRequests(page);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Tournament Manager screens also preview with the Super Admin navigation.
      const visits = screen.states.map(state => ({ state, query: `?state=${state}` }));
      if (screen.role === 'TOURNAMENT_MANAGER') visits.push({ state: 'ready', query: '?state=ready&role=SUPER_ADMIN' });
      for (const { state, query } of visits) {
        await test.step(query, async () => {
          await page.setViewportSize({ width: WIDTHS[0], height: 900 });
          await page.goto(`${APP}/preview/${screen.key}${query}`);
          await expect(page.locator('h1:visible')).toHaveCount(1);
          await expectState(page, state);
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            const at = `${query} at ${width}px`;
            await expect(page.locator('h1:visible'), `one h1, ${at}`).toHaveCount(1);
            await expect(page.locator('.button-primary:visible'), `Primary_Action count, ${at}`).toHaveCount(primaryCount(screen, state));
            expect(await overflow(page), `page overflow, ${at}`).toBeLessThanOrEqual(0);
            // The not-found state reuses the site's page-not-found frame, which this feature does not change.
            if (state !== 'not-found') expect(await smallTargets(page), `targets under 44×44, ${at}`).toEqual([]);
          }
        });
      }
      expect(leaks, 'requests that leave the page').toEqual([]);
      expect(errors, 'page errors').toEqual([]);
    });
  }
});

// The production build (4175, no VITE_LAYOUT_PREVIEW) registers no preview route (Req 1.11).
test('the production build shows page-not-found at /preview', async ({ page }) => {
  for (const path of ['/preview', '/preview/manager-home?state=ready']) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveText('Page not found');
  }
});
