import { test, expect, devices } from '@playwright/test';
import { sports } from '../src/data/sports.js';
import { sampleTournaments } from '../src/features/tournaments/sampleTournaments.js';
import { swipe } from './helpers.js';

async function settleScroll(rail) {
  await rail.evaluate(el => new Promise(resolve => {
    let timer;
    function finish() { el.removeEventListener('scroll', wait); resolve(); }
    function wait() { clearTimeout(timer); timer = setTimeout(finish, 150); }
    el.addEventListener('scroll', wait);
    wait();
  }));
}

test('approved layout, local assets and text fit from phones to large screens', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => {
    image.loading = 'eager';
    return image.decode();
  })));
  const favicon = await page.request.get('/favicon.ico');
  expect(favicon.status()).toBe(200);
  expect([...(await favicon.body()).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  await page.locator('.athlete-card, .match-card').evaluateAll(cards => Promise.all(cards.map(card => {
    const value = getComputedStyle(card).getPropertyValue(card.matches('.athlete-card') ? '--panel-background' : '--match-background');
    const image = new Image();
    image.src = value.match(/url\(['"]?([^'")]+)/)[1];
    return image.decode();
  })));
  await expect(page.locator('.player-core img')).toHaveCount(6);
  await expect(page.locator('.player-popout[aria-hidden="true"]')).toHaveCount(6);
  await expect(page.locator('h1')).toHaveText('Live Scores, Stats & More');
  await expect(page.locator('.matrix-toggle, .live-matches button, .live-matches a')).toHaveCount(0);

  for (const width of [320, 375, 390, 430, 556, 767, 768, 820, 1023, 1024, 1199, 1200, 1280, 1440, 1920, 2560, 3440, 3840]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const hero = document.querySelector('.hero');
      const title = hero.querySelector('h1');
      const spans = [...title.children].map(span => span.getBoundingClientRect());
      const field = hero.querySelector('canvas').getBoundingClientRect();
      const heroBox = hero.getBoundingClientRect();
      const header = document.querySelector(innerWidth < 768 ? '.mobile-header' : '.desktop-banner');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        textOverflows: [...document.querySelectorAll('.sport-link span, .match-meta, .match-overview span, th, td, .tournament-details h3, .tournament-details p')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
        canvasConfined: ['left', 'right', 'top', 'bottom'].every(edge => Math.abs(field[edge] - heroBox[edge]) < 1),
        panelsFit: [...document.querySelectorAll('.athlete-card')].every(card => { const box = card.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.height > 40; }),
        lines: Math.abs(spans[0].top - spans[1].top) < 1 ? 1 : 2,
        alignment: getComputedStyle(title).textAlign,
        tournamentImageRatio: [...document.querySelectorAll('.tournament-surface img')].every(image => {
          const box = image.getBoundingClientRect();
          return Math.abs(box.width / box.height - 2) < .01;
        }),
        headerWidth: header.getBoundingClientRect().width,
        headerTargetsFit: [...header.querySelectorAll('.site-name, .nav-link, summary')].filter(el => el.getClientRects().length).every(el => {
          const box = el.getBoundingClientRect();
          return box.width >= 44 && box.height >= 44;
        }),
        rails: [...document.querySelectorAll('.match-scroll, .tournament-scroll')].map(rail => {
          rail.scrollLeft = 0;
          return rail.scrollWidth > rail.clientWidth && rail.firstElementChild.getBoundingClientRect().width < rail.clientWidth - 16;
        }),
      };
    });
    expect(geometry, `layout at ${width}px`).toMatchObject({ overflow: false, textOverflows: [], canvasConfined: true, panelsFit: true, tournamentImageRatio: true, lines: width >= 768 && width <= 1023 ? 1 : 2, headerWidth: width, headerTargetsFit: true, rails: [true, true] });
    if (width < 1024) expect(geometry.alignment).toBe('center');
    if ([390, 820, 1440, 3840].includes(width)) await page.screenshot({ path: test.info().outputPath(`homepage-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('image skeletons: neutral shimmer blocks while images load, alt text hidden, no layout shift, still with reduced motion', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(/\/assets\/(?!logo).*\.webp$/, async route => { await held; await route.continue(); });
  await page.goto('/');
  const state = () => page.evaluate(() => {
    const style = (el, pseudo) => getComputedStyle(el, pseudo);
    const image = document.querySelector('.tournament-surface img'), panel = document.querySelector('.athlete-card'), match = document.querySelector('.match-surface');
    const box = el => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
    return {
      image: style(image).backgroundImage.includes('gradient'), imageColor: style(image).color, alt: Boolean(image.alt), playerColor: style(panel.querySelector('img')).color,
      panel: style(panel, '::before').backgroundImage.includes('gradient'), match: match ? style(match, '::before').backgroundImage.split('gradient').length > 2 : true,
      animation: style(image).animationName, boxes: [box(image), box(document.querySelector('.hero')), box(panel)],
    };
  });
  const loading = await state();
  expect(loading).toMatchObject({ image: true, imageColor: 'rgba(0, 0, 0, 0)', alt: true, playerColor: 'rgba(0, 0, 0, 0)', panel: true, match: true, animation: 'image-shimmer' });
  release();
  await page.locator('.tournament-surface img').first().evaluate(image => { image.loading = 'eager'; return image.decode(); });
  expect((await state()).boxes).toEqual(loading.boxes);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await state()).animation).toBe('none');
});

test('header: logo home link at the left, the decorative name centered without overlap or wrap', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 360, 390, 429, 430, 767, 768, 900, 1023, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    const header = page.locator(width < 768 ? '.mobile-header' : '.desktop-banner');
    await expect(header.getByRole('link', { name: 'Campuscores home' }), `${width}px`).toHaveCount(1);
    await expect(header.locator('.site-title')).toHaveAttribute('aria-hidden', 'true');
    const box = await header.evaluate(el => {
      const rect = node => node.getBoundingClientRect();
      const title = el.querySelector('.site-title'), range = document.createRange();
      range.selectNodeContents(title);
      const text = rect(range), logo = rect(el.querySelector('.site-name')), right = rect(el.querySelector('.desktop-nav, .mobile-menu'));
      return { textLeft: text.left, textRight: text.right, logoRight: logo.right, rightLeft: right.left, logoLeft: logo.left, rightRight: right.right,
        imageHeight: rect(el.querySelector('.site-name img')).height, rects: range.getClientRects().length, font: parseFloat(getComputedStyle(title).fontSize), header: rect(el).height };
    });
    const middle = (box.textLeft + box.textRight) / 2;
    expect(box.rects, `${width}px one line`).toBe(1);
    expect(box.textLeft - box.logoRight, `${width}px clear of the logo`).toBeGreaterThanOrEqual(8);
    expect(box.rightLeft - box.textRight, `${width}px clear of the nav`).toBeGreaterThanOrEqual(8);
    expect(box.font).toBeGreaterThanOrEqual(15);
    expect(Math.abs(box.logoLeft - (width - box.rightRight)), `${width}px same inline padding`).toBeLessThan(1);
    const trueCenter = width >= 1024 || (width >= 430 && width < 768);
    expect(Math.abs(middle - (trueCenter ? width / 2 : (box.logoRight + box.rightLeft) / 2)), `${width}px centered`).toBeLessThan(1.5);
    expect(box.imageHeight).toBe(width < 768 ? 26 : 34);
    expect(box.header).toBeGreaterThanOrEqual(width < 768 ? 64 : 76);
  }
});

test('sport filters change only live cards and support keyboard input', async ({ page }) => {
  await page.goto('/');
  const url = page.url();
  const rail = page.locator('.match-scroll');
  const history = await page.evaluate(() => window.history.length);
  await expect(page.locator('.sports-nav button')).toHaveCount(7);
  await expect(page.locator('.sports-nav a')).toHaveCount(0);
  await page.locator('.tournament-scroll').evaluate(el => { el.scrollLeft = 200; });
  const tournamentScroll = await page.locator('.tournament-scroll').evaluate(el => el.scrollLeft);
  for (const sport of ['football', 'basketball', 'lawn-tennis', 'table-tennis', 'badminton', 'volleyball', 'all']) {
    await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.locator(`.sports-nav button[data-sport="${sport}"]`).click();
    await expect(page.locator('.sports-nav button[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator(`.sports-nav button[data-sport="${sport}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(rail.locator('.match-card')).toHaveCount(sport === 'all' ? 6 : 1);
    if (sport !== 'all') await expect(rail.locator('.match-card')).toHaveAttribute('data-sport', sport);
    await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBe(0);
    await expect(page.locator('#match-filter-status')).toContainText(sport === 'all' ? '6 live matches' : '1 live match');
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => window.history.length)).toBe(history);
    await expect(page.locator('.tournament-card')).toHaveCount(5);
    expect(await page.locator('.tournament-scroll').evaluate(el => el.scrollLeft)).toBe(tournamentScroll);
  }
  await page.locator('[data-sport="table-tennis"].sport-link').focus();
  await page.keyboard.press('Space');
  await expect(rail.locator('.match-card')).toHaveAttribute('data-sport', 'table-tennis');
  await page.locator('[data-sport="all"].sport-link').focus();
  await page.keyboard.press('Enter');
  await expect(rail.locator('.match-card')).toHaveCount(6);
});

for (const [width, deviceScaleFactor] of [[390, 1], [390, 2], [390, 3], [768, 1]]) {
  test(`cold phone loads use smaller local portraits and textures at ${width}px, DPR ${deviceScaleFactor}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor });
    try {
      const page = await context.newPage();
      const requested = [];
      page.on('request', request => requested.push(new URL(request.url()).pathname));
      await page.goto('http://127.0.0.1:4175/');
      const portraits = await page.locator('.athlete-card').evaluateAll(async cards => {
        await Promise.all(cards.flatMap(card => [...card.querySelectorAll('img')].map(image => image.decode())));
        return cards.map(card => {
          const [core, popout] = card.querySelectorAll('img');
          return { original: new URL(core.src).pathname, core: new URL(core.currentSrc).pathname, popout: new URL(popout.currentSrc).pathname };
        });
      });
      expect(portraits).toHaveLength(6);
      const textures = await page.locator('.athlete-card, .match-surface').evaluateAll(async surfaces => {
        const paths = surfaces.map(surface => getComputedStyle(surface, '::before').backgroundImage.match(/url\(['"]?([^'")]+)/)[1]);
        await Promise.all(paths.map(path => { const image = new Image(); image.src = path; return image.decode(); }));
        return paths.map(path => new URL(path).pathname);
      });
      expect(textures).toHaveLength(12);
      for (const portrait of portraits) {
        expect(portrait.popout).toBe(portrait.core);
        if (width < 768) {
          expect(portrait.core).toMatch(/^\/assets\/.+-(320|640)\.webp$/);
          if (deviceScaleFactor < 3) expect(portrait.core).toMatch(/-320\.webp$/);
          expect(requested).not.toContain(portrait.original);
        }
      }
      for (const texture of textures) expect(texture).toMatch(width < 768 ? /-background-640\.webp$/ : /-background\.webp$/);
      if (width < 768) expect(requested.filter(path => /-background\.webp$/.test(path))).toEqual([]);
    } finally { await context.close(); }
  });
}

// One test per width keeps each rail journey inside its own timeout budget on slower runners.
// Loaded Firefox runners can stall one automation round trip for over 5 s while the page state is already correct.
const railExpect = expect.configure({ timeout: 15000 });
for (const width of [390, 820, 1440, 2560, 3840]) {
  test(`both rails spotlight visible cards and scroll without arrow controls at ${width}px`, async ({ page, browserName }) => {
    test.slow(browserName === 'webkit', 'Headless WebKit renders the 2560-3840px rails about 3× slower than Chromium');
    await page.goto('/');
    await page.setViewportSize({ width, height: 1000 });
    for (const selector of ['.match-scroll', '.tournament-scroll']) {
      const rail = page.locator(selector);
      await rail.evaluate(el => { el.scrollLeft = 0; });
      await railExpect.poll(() => rail.evaluate(el => [...el.children].every(card => {
        const box = card.getBoundingClientRect(), root = el.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(box.right, root.right) - Math.max(box.left, root.left)) / box.width;
        return card.classList.contains('is-peek') === (ratio < .9);
      }))).toBe(true);
      const peek = rail.locator('.is-peek').first().locator('.match-surface, .tournament-surface');
      await railExpect(peek).toHaveCSS('opacity', '0.66');
      await rail.scrollIntoViewIfNeeded();
      await rail.hover();
      await page.mouse.wheel(380, 0);
      await railExpect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      await settleScroll(rail);
      await rail.focus();
      await page.keyboard.press('ArrowRight');
      await settleScroll(rail);
      await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await railExpect(rail.locator(':scope > :last-child')).not.toHaveClass(/is-peek/);
      await railExpect.poll(() => rail.evaluate(el => el.lastElementChild.getBoundingClientRect().right <= el.getBoundingClientRect().right - 52)).toBe(true);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await railExpect(page.locator('.match-surface').first()).toHaveCSS('transform', 'none');
  });
}

test('menus and legacy links navigate and close correctly', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await expect(page.locator('.desktop-nav .sports-options a')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(page.locator('.desktop-nav .sports-dropdown')).not.toHaveAttribute('open');
  await page.goto('/tournament.html?event=racquet-open');
  await expect(page).toHaveURL(/\/tournaments\/racquet-open$/);
  await page.goto('/index.html?preview=rectangular');
  await expect(page).toHaveURL(/\/$/);
  // The Stage 1 layout preview is removed, so /preview is an unknown path (staff roles Req 1.11).
  for (const path of ['/preview', '/preview/admin-home?state=ready', '/missing-page']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Return home' }).click();
  // The public header has no staff link (staff roles Req 4.1).
  await expect(page.locator('header a[href^="/operator"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.locator('.mobile-menu > summary');
  await expect(menu).toHaveText('');
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.locator('.mobile-menu-panel summary').click();
  await expect(page.locator('.mobile-menu-panel .sports-options a:visible')).toHaveCount(6);
  await page.mouse.click(8, 130);
  await expect(page.locator('.mobile-menu')).not.toHaveAttribute('open');
  await menu.click();
  await page.locator('.mobile-menu-panel a[href="/tournaments"]').click();
  await expect(page).toHaveURL(/\/tournaments$/);
  await expect(page.locator('.mobile-menu')).not.toHaveAttribute('open');
  await expect(page.getByRole('heading', { level: 1, name: 'Tournaments' })).toBeInViewport();
  expect(errors).toEqual([]);
});

// Keep each click/refresh/back journey inside its own timeout budget on slower runners.
const destinations = [...sports.map(sport => ({ destination: '/sports/' + sport.id + '/', sport })), ...sampleTournaments.map(event => ({ destination: '/tournaments/' + event.id, title: event.name }))];
for (const { destination, sport, title } of destinations) {
  test('homepage destination ' + destination + ' opens, refreshes and returns with Back', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    if (sport) await page.locator('.desktop-nav .sports-dropdown summary').click();
    await page.locator('a[href="' + destination + '"]').first().click();
    await expect(page).toHaveURL(new RegExp(destination.replace(/\/$/, '') + '/?$'));
    const ready = () => expect(page.getByRole('heading', { level: 1, name: sport ? sport.label : title })).toBeVisible();
    await ready(); expect((await page.reload()).status()).toBe(200); await ready();
    await page.goBack(); await expect(page.locator('.hero')).toBeVisible(); expect(errors).toEqual([]);
  });
}

test('repeat Home and Tournaments navigation scrolls and closes phone menus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    const navigation = page.locator(width < 768 ? '.mobile-menu-panel' : '.desktop-nav');
    const menu = page.locator('.mobile-menu');
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width < 768) await menu.locator(':scope > summary').click();
      await navigation.getByRole('link', { name: 'Tournaments', exact: true }).click();
      await expect(page).toHaveURL(/\/tournaments$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Tournaments' })).toBeInViewport();
      await expect(navigation.locator('a[href="/tournaments"]')).toHaveAttribute('aria-current', 'page');
      if (width < 768) await expect(menu).not.toHaveAttribute('open');
    }
    // The header opens the Tournaments page; the /#tournaments anchor still scrolls to the homepage section.
    await page.goto('/#tournaments');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await expect(page.locator('#tournaments')).toBeInViewport();
    const home = navigation.getByRole('link', { name: 'Home', exact: true });
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width < 768) {
        await expect(menu).not.toHaveAttribute('open');
        await menu.locator(':scope > summary').click();
        await expect(menu).toHaveAttribute('open');
      }
      await home.evaluate(el => el.focus({ preventScroll: true }));
      await expect(home).toBeFocused();
      await page.evaluate(() => window.scrollTo(0, 200));
      await expect.poll(() => page.evaluate(() => window.scrollY), { message: 'Home starts scrolled at ' + width + 'px' }).toBe(200);
      // A keyboard activation leaves the setup scroll in place until the route effect resets it.
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page).toHaveURL(/\/$/);
      if (width < 768) await expect(menu).not.toHaveAttribute('open');
    }
  }
});

test('hero motion stops offscreen, with reduced motion, and on route unmount', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    window.pendingAnimationFrames = new Set();
    window.requestAnimationFrame = callback => {
      const id = request(time => { window.pendingAnimationFrames.delete(id); callback(time); });
      window.pendingAnimationFrames.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { window.pendingAnimationFrames.delete(id); cancel(id); };
  });
  await page.goto('/');
  const canvas = page.locator('.hero-matrix');
  const pattern = () => canvas.evaluate(el => el.toDataURL());
  await expect.poll(() => canvas.evaluate(el => el.width)).toBeGreaterThan(0);
  const initial = await pattern();
  await expect.poll(pattern).not.toBe(initial);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await pattern();
  await page.waitForTimeout(160);
  expect(await pattern()).toBe(still);
  await expect(page.locator('.hero h1')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(0);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(1);
  await page.locator('#tournaments').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(1);
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await page.locator('.desktop-nav a[href="/sports/football/"]').click();
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(0);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(1);
});

test('phone touch can swipe both card rows', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch-drag input exists only through Chromium CDP; WebKit phones are checked in mobile.spec.js and by hand');
  const context = await browser.newContext(devices['iPhone 13']);
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4175/');
    for (const selector of ['.match-scroll', '.tournament-scroll']) {
      const rail = page.locator(selector);
      await swipe(page, rail);
      await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
  } finally { await context.close(); }
});
