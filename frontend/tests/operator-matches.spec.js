import { test, expect } from '@playwright/test';
import { assignedBy } from '../src/features/operator/operatorMatches.js';
import { sports } from '../src/data/sports.js';
import { upcomingDates } from '../src/features/sports/sportCalendar.js';

const route = '/operator/matches';
const live = assignedBy('live');
const scheduled = assignedBy('scheduled');
const completed = assignedBy('completed');
const card = (page, id) => page.locator(`[data-match-id="${id}"]`);
const section = (page, id) => page.locator(`#${id}`);
const sportLabel = id => sports.find(sport => sport.id === id).label;
const scheduledDates = upcomingDates.filter(day => scheduled.some(match => match.date === day.date));

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('fixtures resolve to real assigned matches, grouped by scorer state', () => {
  const all = [...live, ...scheduled, ...completed];
  expect(all.length, 'some assignments resolve').toBeGreaterThan(0);
  for (const match of live) expect(['live', 'ended'], match.id).toContain(match.status);
  for (const match of scheduled) expect(match.status, match.id).toBe('scheduled');
  for (const match of completed) expect(match.status, match.id).toBe('ended');
  // Every assignment carries a known sport id and two sides.
  for (const match of all) {
    expect(sports.map(sport => sport.id), match.id).toContain(match.sport);
    expect(match.sides, match.id).toHaveLength(2);
  }
});

test('page shows only the three scorer sections with the assigned counts', async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Matches');
  await expect(page.locator('.sport-section h2')).toHaveText(['Live', 'Scheduled', 'Completed']);
  await expect(section(page, 'op-live').locator('.live-dot')).toHaveCount(1);
  await expect(section(page, 'op-live').locator('.operator-card')).toHaveCount(live.length);
  await expect(section(page, 'op-scheduled').locator('.operator-card')).toHaveCount(scheduled.length);
  await expect(section(page, 'op-completed').locator('.operator-card')).toHaveCount(completed.length);
});

test('each card links to the scoring route with the right action label', async ({ page }) => {
  await page.goto(route);
  const labels = { live: 'Continue scoring', scheduled: 'Start scoring', completed: 'View match' };
  for (const [state, matches] of [['live', live], ['scheduled', scheduled], ['completed', completed]]) {
    for (const match of matches) {
      const link = card(page, match.key).getByRole('link');
      await expect(link).toHaveText(labels[state]);
      await expect(link).toHaveAttribute('href', `/operator/matches/${match.key}/score`);
      await expect(card(page, match.key)).toContainText(sportLabel(match.sport));
    }
  }
});

test('scheduled date chips filter in place', async ({ page }) => {
  await page.goto(route);
  const scheduledSection = section(page, 'op-scheduled');
  await expect(scheduledSection.locator('.date-chip')).toHaveText(['All', ...scheduledDates.map(day => day.label)]);
  await expect(scheduledSection.locator('.date-chip[aria-pressed="true"]')).toHaveText('All');
  const day = scheduledDates[0];
  await scheduledSection.locator('.date-chip', { hasText: new RegExp(`^${day.label}$`) }).click();
  const onDay = scheduled.filter(match => match.date === day.date);
  await expect(scheduledSection.locator('.operator-card')).toHaveCount(onDay.length);
  for (const match of onDay) await expect(card(page, match.key)).toBeVisible();
});

test('layout fits phones to large screens with 44px actions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);
  for (const width of [320, 375, 390, 768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      smallTargets: [...document.querySelectorAll('.operator-score-link, .date-chip')].filter(el => {
        const box = el.getBoundingClientRect();
        return el.getClientRects().length && (box.width < 44 || box.height < 44);
      }).length,
    }));
    expect(geometry, `layout at ${width}px`).toEqual({ overflow: false, smallTargets: 0 });
  }
});

test('the header My Matches tab navigates from the home page to the dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const tab = page.locator('.desktop-nav .nav-link', { hasText: 'My Matches' });
  await expect(tab).toHaveAttribute('href', '/operator/matches');
  await tab.click();
  await expect(page).toHaveURL(/\/operator\/matches$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Matches');
  await expect(tab).toHaveAttribute('aria-current', 'page');
});

test('the dashboard renders and the scoring route opens a page', async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Matches');
  // The scoring route now resolves to a sport page (badminton built) or a "coming soon" page.
  await page.goto(`/operator/matches/${(live[0] ?? scheduled[0]).key}/score`);
  await expect(page.locator('main')).toHaveCount(1);
});
